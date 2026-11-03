"""Yellow forms: club co-curricular attendance claims.

A club files two documents per event:

  1. a PRE-APPROVAL before the event — the event and the students expected to
     miss class — approved by the club's Faculty Coordinator and then the
     Associate HOD. Submit and both approvals are refused once the event has
     started (IST calendar date, app.core.clock), so the last day to approve
     is the day before;
  2. once the event is over, ONE CLAIM SHEET against the approved
     pre-approval — per student, the dates and periods missed and their
     current attendance with and without claims — straight to the Claims
     Coordinator, whose approval forwards it to the attendance office.

The stages live in app/core/yellow_form_workflow, who may file or read in
app/core/yellow_form_access. Every response carries viewer_can_* flags so the
client renders exactly the actions this server will accept.
"""
import csv
import io
import uuid
from datetime import date, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core import clock, faculty_scope, yellow_form_access
from app.core import yellow_form_workflow as workflow
from app.core.config import settings
from app.core.database import get_db
from app.core.rbac import get_current_user, get_resolved_permissions
from app.models.faculty_assignment import FacultyAssignment
from app.models.user import User
from app.models.yellow_form import (
    ClubClaimEntry, ClubClaimSheet, ClubClaimStudent, PreApprovalForm, PreApprovalStudent,
)
from app.repositories.club import club_repo, hierarchy_repo, member_repo
from app.schemas.yellow_form import (
    ClaimSheetEntryOut, ClaimSheetOut, ClaimSheetStudentOut, ClaimSheetUpsert, EligibleStudentOut,
    PreApprovalCreate, PreApprovalOut, PreApprovalStudentOut, PreApprovalSummary, PreApprovalUpdate,
    ReviewAction, StudentLookupOut, YellowFormBundle,
    duplicate_register_number_error, event_window_error,
)
from app.services.engines.club_hierarchy import club_hierarchy_engine
from app.services.engines.notification import notification_engine

router = APIRouter()

#: Everything PreApprovalOut reads beyond the row itself.
PRE_APPROVAL_LOADERS = (
    selectinload(PreApprovalForm.club),
    selectinload(PreApprovalForm.creator),
    selectinload(PreApprovalForm.fc_approver),
    selectinload(PreApprovalForm.ahod_approver),
    selectinload(PreApprovalForm.last_reviewer),
    selectinload(PreApprovalForm.students),
    selectinload(PreApprovalForm.claim_sheet),
)

#: Everything ClaimSheetOut reads, including the attached pre-approved list.
CLAIM_SHEET_LOADERS = (
    selectinload(ClubClaimSheet.club),
    selectinload(ClubClaimSheet.creator),
    selectinload(ClubClaimSheet.reviewer),
    selectinload(ClubClaimSheet.students).selectinload(ClubClaimStudent.entries),
    selectinload(ClubClaimSheet.pre_approval).options(
        selectinload(PreApprovalForm.students),
        selectinload(PreApprovalForm.fc_approver),
        selectinload(PreApprovalForm.ahod_approver),
    ),
)

CSV_HEADER = (
    ["S.No", "Register Number", "Student Name", "Class", "Date"]
    + [p["column"] for p in workflow.CLAIM_SHEET_PERIODS]
    + ["Attendance With Claims", "Attendance Without Claims", "Role"]
)

#: A cell starting with one of these is a formula to Excel / Sheets.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _reference(prefix: str) -> str:
    return f"{prefix}-{clock.today().year}-{uuid.uuid4().hex[:6].upper()}"


def _parse(value: str) -> date:
    return date.fromisoformat(value)


def _dmy(value) -> str:
    return (_parse(value) if isinstance(value, str) else value).strftime("%d/%m/%Y")


def _span(form: PreApprovalForm) -> str:
    if form.event_start_date == form.event_end_date:
        return _dmy(form.event_start_date)
    return f"{_dmy(form.event_start_date)} – {_dmy(form.event_end_date)}"


def _academic_year(start: date) -> str:
    y = start.year
    return f"{y}-{y + 1}" if start.month >= 6 else f"{y - 1}-{y}"


def _class_suggestion(user: Optional[User]) -> str:
    if user is None:
        return ""
    return " ".join(p for p in (user.semester, user.programme, user.section) if p).strip()


def _name(user: Optional[User]) -> Optional[str]:
    return user.name if user else None


def _who(row) -> str:
    return f"{row.student_name} ({row.register_number})"


def _club_coordinators(db: Session, club_id: str) -> List[User]:
    users = (
        db.query(User)
        .join(FacultyAssignment, FacultyAssignment.faculty_id == User.id)
        .filter(
            FacultyAssignment.club_id == club_id,
            FacultyAssignment.role_tag == faculty_scope.CLUB_FACULTY_COORDINATOR,
            FacultyAssignment.status == "active",
        )
        .order_by(User.name)
        .all()
    )
    return list({u.id: u for u in users}.values())


def _holders_of(db: Session, permission: str) -> List[User]:
    """Every active faculty member holding a department-wide permission."""
    return [
        u for u in db.query(User).filter(User.primary_role == "faculty", User.status == "active")
        .order_by(User.name).all()
        if permission in get_resolved_permissions(u)
    ]


def _leadership_ids(db: Session, club_id: str) -> List[str]:
    """The audience of club_hierarchy_engine.notify_club_leadership (the club's
    top two ranks), as ids, so one event can de-duplicate them against its
    other recipients and link to the form rather than the club."""
    levels = hierarchy_repo.get_by_club(db, club_id=club_id)
    top_ranks = sorted({l.level_order for l in levels})[:2]
    return [
        m.student_id for m in member_repo.get_club_members(db, club_id=club_id)
        if m.status == "active" and club_hierarchy_engine.get_level_order_for_member(db, m) in top_ranks
    ]


class _Recipients:
    """One notification per person per event, whichever audiences they are in.

    The first audience a person is added under wins — so add the people being
    asked to act before the people merely being informed.
    """

    def __init__(self):
        self._by_user: Dict[str, tuple] = {}

    def add(self, user_ids, *, title: str, content: str, email: bool = False) -> None:
        for user_id in user_ids:
            if user_id and user_id not in self._by_user:
                self._by_user[user_id] = (title, content, email)

    def send(self, db: Session, *, entity_type: str, entity_id: str) -> None:
        for user_id, (title, content, email) in self._by_user.items():
            notification_engine.send_notification(
                db, user_id=user_id, title=title, content=content, source_module="claims",
                entity_type=entity_type, entity_id=entity_id, email_recipient=email,
            )


class _Viewer:
    """What the caller may do, each fact looked up at most once per club.

    A list endpoint serialises many forms, usually of one or two clubs; asking
    the access rules afresh for every row would be an N+1 of membership and
    coordinator lookups.
    """

    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user
        self.permissions = get_resolved_permissions(user)
        self.view_all = yellow_form_access.has_view_all(user)
        self._filer: Dict[str, bool] = {}
        self._reader: Dict[str, bool] = {}
        self._coordinator: Dict[str, bool] = {}
        self._scoped: Dict[tuple, bool] = {}
        self._fc_names: Dict[str, List[str]] = {}
        self._ahod_names: Optional[List[str]] = None

    def can_file(self, club_id: str) -> bool:
        if club_id not in self._filer:
            self._filer[club_id] = yellow_form_access.can_file(self.db, self.user, club_id)
        return self._filer[club_id]

    def is_club_reader(self, club_id: str) -> bool:
        if club_id not in self._reader:
            self._reader[club_id] = yellow_form_access.can_read_club(self.db, self.user, club_id)
        return self._reader[club_id]

    def may_act(self, spec: workflow.StageSpec, obj) -> bool:
        # Every scope check depends on the club alone.
        key = (spec.id, obj.club_id)
        if key not in self._scoped:
            self._scoped[key] = workflow.may_act(self.db, self.user, obj, spec)
        return self._scoped[key]

    def sees_pre_approval(self, form: PreApprovalForm, include_listed_students: bool = True) -> bool:
        return yellow_form_access.pre_approval_visible(
            self.user, form, is_club_reader=self.is_club_reader(form.club_id),
            view_all=self.view_all, include_listed_students=include_listed_students,
        )

    def sees_claim_sheet(self, sheet: ClubClaimSheet, include_listed_students: bool = True) -> bool:
        return yellow_form_access.claim_sheet_visible(
            self.user, sheet, is_club_reader=self.is_club_reader(sheet.club_id),
            view_all=self.view_all, include_listed_students=include_listed_students,
        )

    def sees_all_attendance(self, sheet: ClubClaimSheet) -> bool:
        """Attendance is a student's own record. Everyone else who can read the
        sheet (the club's other members, students listed on it) sees their own
        figures only; the people filing, overseeing or reviewing it see all."""
        spec = workflow.CLAIM_SHEET_STAGES.get(sheet.status)
        if self.view_all or self.can_file(sheet.club_id) or (spec is not None and self.may_act(spec, sheet)):
            return True
        if sheet.club_id not in self._coordinator:
            self._coordinator[sheet.club_id] = faculty_scope.is_club_faculty_coordinator_for(
                self.db, self.user.id, sheet.club_id,
            )
        return self._coordinator[sheet.club_id]

    def fc_names(self, club_id: str) -> List[str]:
        if club_id not in self._fc_names:
            self._fc_names[club_id] = [u.name for u in _club_coordinators(self.db, club_id)]
        return self._fc_names[club_id]

    def ahod_names(self) -> List[str]:
        if self._ahod_names is None:
            self._ahod_names = [u.name for u in _holders_of(self.db, "yellow_forms:approve_associate_hod")]
        return self._ahod_names


def _pending_label(names: List[str], role: str) -> str:
    return f"{', '.join(names)} ({role})" if names else role


NO_FACULTY_COORDINATOR = (
    "This club has no Faculty Coordinator assigned — ask the department to assign one "
    "before requesting pre-approval."
)


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------

def _pre_approval_out(form: PreApprovalForm, viewer: _Viewer) -> PreApprovalOut:
    today = clock.today()
    start, end = _parse(form.event_start_date), _parse(form.event_end_date)
    is_expired = form.status in workflow.PRE_APPROVAL_OPEN_STATUSES and today >= start
    event_completed = today >= end
    can_file = viewer.can_file(form.club_id)
    editable = can_file and form.status in workflow.EDITABLE_STATUSES and not is_expired
    # Nobody but super_admin could act at the first stage, and nobody would be told.
    no_coordinator = editable and not viewer.fc_names(form.club_id)
    spec = workflow.PRE_APPROVAL_STAGES.get(form.status)
    sheet = form.claim_sheet

    pending_with = None
    if not is_expired and form.status == "faculty_coordinator_review":
        pending_with = _pending_label(viewer.fc_names(form.club_id), "Faculty Coordinator")
    elif not is_expired and form.status == "associate_hod_review":
        pending_with = _pending_label(viewer.ahod_names(), "Associate HOD")

    return PreApprovalOut(
        id=form.id,
        reference_number=form.reference_number,
        club_id=form.club_id,
        club_name=form.club.name if form.club else form.club_id,
        academic_year=form.academic_year,
        event_name=form.event_name,
        event_description=form.event_description,
        venue=form.venue,
        event_start_date=form.event_start_date,
        event_end_date=form.event_end_date,
        status=form.status,
        status_label=workflow.PRE_APPROVAL_STATUS_LABELS.get(form.status, form.status),
        created_by=form.created_by,
        created_by_name=_name(form.creator) or "Unknown",
        submitted_at=form.submitted_at,
        faculty_coordinator_approved_by=form.faculty_coordinator_approved_by,
        faculty_coordinator_approved_by_name=_name(form.fc_approver),
        faculty_coordinator_approved_at=form.faculty_coordinator_approved_at,
        associate_hod_approved_by=form.associate_hod_approved_by,
        associate_hod_approved_by_name=_name(form.ahod_approver),
        associate_hod_approved_at=form.associate_hod_approved_at,
        review_comments=form.review_comments,
        last_reviewed_by_name=_name(form.last_reviewer),
        last_reviewed_stage=form.last_reviewed_stage,
        students=[PreApprovalStudentOut.model_validate(s) for s in form.students],
        student_count=len(form.students),
        approval_deadline=(start - timedelta(days=1)).isoformat(),
        is_expired=is_expired,
        event_completed=event_completed,
        pending_with=pending_with,
        claim_sheet_id=sheet.id if sheet else None,
        claim_sheet_status=sheet.status if sheet else None,
        claim_sheet_reference=sheet.reference_number if sheet else None,
        viewer_can_edit=editable,
        viewer_can_submit=editable and not no_coordinator,
        submit_blocked_reason=NO_FACULTY_COORDINATOR if no_coordinator else None,
        viewer_can_delete=can_file and form.status == "draft",
        viewer_can_review=spec is not None and not is_expired and viewer.may_act(spec, form),
        viewer_can_file_claim_sheet=(
            can_file and form.status == "approved" and event_completed and sheet is None
        ),
    )


def _claim_sheet_out(sheet: ClubClaimSheet, viewer: _Viewer) -> ClaimSheetOut:
    form = sheet.pre_approval
    event_completed = clock.today() >= _parse(form.event_end_date)
    can_file = viewer.can_file(sheet.club_id)
    editable = can_file and sheet.status in workflow.EDITABLE_STATUSES
    spec = workflow.CLAIM_SHEET_STAGES.get(sheet.status)
    sees_all = viewer.sees_all_attendance(sheet)

    students = []
    for s in sheet.students:
        shown = sees_all or s.student_id == viewer.user.id
        students.append(ClaimSheetStudentOut(
            id=s.id,
            pre_approval_student_id=s.pre_approval_student_id,
            student_id=s.student_id,
            register_number=s.register_number,
            student_name=s.student_name,
            class_name=s.class_name,
            role=s.role,
            attendance_with_claims=s.attendance_with_claims if shown else None,
            attendance_without_claims=s.attendance_without_claims if shown else None,
            entries=[ClaimSheetEntryOut(id=e.id, date=e.date, periods=e.periods_list) for e in s.entries],
        ))

    return ClaimSheetOut(
        id=sheet.id,
        reference_number=sheet.reference_number,
        pre_approval_id=sheet.pre_approval_id,
        pre_approval_reference=form.reference_number,
        club_id=sheet.club_id,
        club_name=sheet.club.name if sheet.club else sheet.club_id,
        event_name=form.event_name,
        event_start_date=form.event_start_date,
        event_end_date=form.event_end_date,
        status=sheet.status,
        status_label=workflow.CLAIM_SHEET_STATUS_LABELS.get(sheet.status, sheet.status),
        created_by=sheet.created_by,
        created_by_name=_name(sheet.creator) or "Unknown",
        submitted_at=sheet.submitted_at,
        late_submission_flag=sheet.late_submission_flag,
        reviewed_by=sheet.reviewed_by,
        reviewed_by_name=_name(sheet.reviewer),
        reviewed_at=sheet.reviewed_at,
        review_comments=sheet.review_comments,
        students=students,
        student_count=len(students),
        row_count=sum(len(s.entries) for s in students),
        pre_approval=PreApprovalSummary(
            reference_number=form.reference_number,
            faculty_coordinator_approved_by_name=_name(form.fc_approver),
            faculty_coordinator_approved_at=form.faculty_coordinator_approved_at,
            associate_hod_approved_by_name=_name(form.ahod_approver),
            associate_hod_approved_at=form.associate_hod_approved_at,
            students=[PreApprovalStudentOut.model_validate(s) for s in form.students],
        ),
        attendance_redacted=not sees_all,
        viewer_can_edit=editable,
        viewer_can_submit=editable and event_completed and form.status == "approved",
        viewer_can_delete=can_file and sheet.status == "draft",
        viewer_can_review=spec is not None and viewer.may_act(spec, sheet),
        # The CSV carries everyone's attendance.
        viewer_can_export=sees_all and viewer.sees_claim_sheet(sheet),
    )


def _bundle(pre_approvals, claim_sheets, viewer: _Viewer) -> YellowFormBundle:
    return YellowFormBundle(
        pre_approvals=[_pre_approval_out(f, viewer) for f in pre_approvals],
        claim_sheets=[_claim_sheet_out(s, viewer) for s in claim_sheets],
    )


# ---------------------------------------------------------------------------
# Lookups and guards
# ---------------------------------------------------------------------------

def _get_pre_approval(db: Session, form_id: str) -> PreApprovalForm:
    form = db.query(PreApprovalForm).options(*PRE_APPROVAL_LOADERS).filter(PreApprovalForm.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Pre-approval not found")
    return form


def _get_claim_sheet(db: Session, sheet_id: str) -> ClubClaimSheet:
    sheet = db.query(ClubClaimSheet).options(*CLAIM_SHEET_LOADERS).filter(ClubClaimSheet.id == sheet_id).first()
    if not sheet:
        raise HTTPException(status_code=404, detail="Claim sheet not found")
    return sheet


def _require_club(db: Session, club_id: str):
    club = club_repo.get(db, club_id)
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


def _require_filer(viewer: _Viewer, club_id: str) -> None:
    if not viewer.can_file(club_id):
        raise HTTPException(
            status_code=403,
            detail="Only the club's leadership can file yellow forms for this club",
        )


def _club_list_includes_drafts(viewer: _Viewer, club_id: str) -> bool:
    """Club readers see drafts; view_all holders see everything submitted."""
    if viewer.is_club_reader(club_id):
        return True
    if viewer.view_all:
        return False
    raise HTTPException(status_code=403, detail="You do not have access to this club's yellow forms")


def _review_reason(review_in: ReviewAction, noun: str) -> Optional[str]:
    comments = (review_in.comments or "").strip()
    if review_in.action != workflow.APPROVE and not comments:
        raise HTTPException(status_code=400, detail=f"Give a reason when sending a {noun} back or rejecting it.")
    return comments or None


def _check_pre_approval(start: date, end: date, students) -> None:
    error = event_window_error(start, end) or duplicate_register_number_error(students)
    if error:
        raise HTTPException(status_code=400, detail=error)
    if start <= clock.today():
        raise HTTPException(
            status_code=400,
            detail="Pre-approval has to be granted before the event starts, so the start date must be after today.",
        )


def _require_editable_pre_approval(form: PreApprovalForm) -> None:
    if form.status not in workflow.EDITABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or returned pre-approval can be changed — this one is "
                   f"{workflow.PRE_APPROVAL_STATUS_LABELS.get(form.status, form.status).lower()}.",
        )
    if clock.today() >= _parse(form.event_start_date):
        raise HTTPException(
            status_code=400,
            detail="The event has already started — pre-approval can no longer be requested.",
        )


def _require_editable_claim_sheet(sheet: ClubClaimSheet) -> None:
    if sheet.status not in workflow.EDITABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Only a draft or returned claim sheet can be changed — this one is "
                   f"{workflow.CLAIM_SHEET_STATUS_LABELS.get(sheet.status, sheet.status).lower()}.",
        )


def _require_event_over(form: PreApprovalForm) -> None:
    if form.status != "approved":
        raise HTTPException(
            status_code=400,
            detail="The pre-approval must be fully approved before a claim sheet can be filed.",
        )
    if clock.today() < _parse(form.event_end_date):
        raise HTTPException(
            status_code=400,
            detail=f"The claim sheet can be filed once the event is over — on or after {_dmy(form.event_end_date)}.",
        )


def _build_pre_approval_students(db: Session, students_in) -> List[PreApprovalStudent]:
    """Rows in the order given, each linked to the student's account when one
    carries that register number (in any case: the input is upper-cased)."""
    register_numbers = [s.register_number for s in students_in]
    linked = {
        enrollment_no.upper(): user_id for enrollment_no, user_id in
        db.query(User.enrollment_no, User.id)
        .filter(func.upper(User.enrollment_no).in_(register_numbers), User.primary_role == "student")
    } if register_numbers else {}
    return [
        PreApprovalStudent(
            id=_new_id("pas"),
            student_id=linked.get(s.register_number),
            register_number=s.register_number,
            student_name=s.student_name,
            class_name=s.class_name,
            role=s.role,
            position=position,
        )
        for position, s in enumerate(students_in)
    ]


def _check_attendance(who: str, with_claims: Optional[float], without_claims: Optional[float]) -> None:
    for label, value in (("with claims", with_claims), ("without claims", without_claims)):
        if value is None:
            continue
        if not 0 <= value <= 100:
            raise HTTPException(status_code=400, detail=f"{who}: attendance {label} must be between 0 and 100.")
        if abs(round(value, 2) - value) > 1e-9:
            raise HTTPException(status_code=400, detail=f"{who}: attendance {label} can have at most 2 decimal places.")
    if with_claims is not None and without_claims is not None and without_claims > with_claims:
        raise HTTPException(
            status_code=400,
            detail=f"{who}: attendance without claims ({without_claims:g}) cannot be higher than "
                   f"attendance with claims ({with_claims:g}).",
        )


def _build_claim_rows(form: PreApprovalForm, students_in) -> List[ClubClaimStudent]:
    """Validate a claim sheet's rows against its pre-approval and build them.

    Drafts may leave dates and attendance empty; submit is where completeness
    is enforced (_check_claim_sheet_complete).
    """
    start, end = _parse(form.event_start_date), _parse(form.event_end_date)
    pre_approved = {s.id: s for s in form.students}
    seen = set()
    rows = []
    for position, item in enumerate(students_in):
        listed = pre_approved.get(item.pre_approval_student_id)
        if listed is None:
            raise HTTPException(
                status_code=400,
                detail="One of these students is not on the approved pre-approval list for this event — "
                       "only pre-approved students can be claimed for.",
            )
        who = _who(listed)
        if listed.id in seen:
            raise HTTPException(status_code=400, detail=f"{who} is on the claim sheet more than once.")
        seen.add(listed.id)
        _check_attendance(who, item.attendance_with_claims, item.attendance_without_claims)

        dates = set()
        entries = []
        for entry in sorted(item.entries, key=lambda e: e.date):
            if not start <= entry.date <= end:
                raise HTTPException(
                    status_code=400,
                    detail=f"{who}: {_dmy(entry.date)} is outside the event dates ({_span(form)}).",
                )
            if entry.date in dates:
                raise HTTPException(status_code=400, detail=f"{who}: {_dmy(entry.date)} is listed more than once.")
            dates.add(entry.date)
            entries.append(ClubClaimEntry(
                id=_new_id("cce"), date=entry.date.isoformat(), periods=",".join(entry.periods),
            ))

        rows.append(ClubClaimStudent(
            id=_new_id("ccst"),
            pre_approval_student_id=listed.id,
            student_id=listed.student_id,
            register_number=listed.register_number,
            student_name=listed.student_name,
            class_name=listed.class_name,
            role=item.role or listed.role,
            attendance_with_claims=item.attendance_with_claims,
            attendance_without_claims=item.attendance_without_claims,
            position=position,
            entries=entries,
        ))
    return rows


def _check_claim_sheet_complete(sheet: ClubClaimSheet) -> None:
    if not sheet.students:
        raise HTTPException(status_code=400, detail="Add at least one student before submitting the claim sheet.")
    for s in sheet.students:
        who = _who(s)
        if not s.entries:
            raise HTTPException(
                status_code=400,
                detail=f"{who} has no dates on the claim sheet — add the periods they missed, or remove them.",
            )
        for entry in s.entries:
            if not entry.periods_list:
                raise HTTPException(status_code=400, detail=f"{who}: pick at least one period for {_dmy(entry.date)}.")
        if s.attendance_with_claims is None or s.attendance_without_claims is None:
            raise HTTPException(status_code=400, detail=f"Enter {who}'s attendance with and without claims.")
        _check_attendance(who, s.attendance_with_claims, s.attendance_without_claims)


def _replace(db: Session, collection, rows) -> None:
    # Flush the deletions first: the unique constraints on (parent, register
    # number) and (sheet, pre-approved student) would otherwise see the old
    # row and its replacement at the same time.
    collection.clear()
    db.flush()
    collection.extend(rows)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def _notify_pre_approval_submitted(db: Session, form: PreApprovalForm) -> None:
    club_name = form.club.name
    deadline = _dmy(_parse(form.event_start_date) - timedelta(days=1))
    recipients = _Recipients()
    recipients.add(
        [u.id for u in _club_coordinators(db, form.club_id)],
        title=f"{club_name} pre-approval needs your approval",
        content=(
            f"{club_name} has asked for pre-approval of “{form.event_name}” ({_span(form)}, "
            f"{len(form.students)} student(s)). Approve by {deadline} — pre-approval cannot be "
            f"granted once the event starts."
        ),
        email=True,
    )
    recipients.add(
        _leadership_ids(db, form.club_id),
        title=f"Pre-approval {form.reference_number} submitted",
        content=f"“{form.event_name}” is now with the Faculty Coordinator.",
    )
    recipients.send(db, entity_type="pre_approval", entity_id=form.id)


def _notify_pre_approval_reviewed(db: Session, form: PreApprovalForm, action: str, spec: workflow.StageSpec) -> None:
    club_name = form.club.name
    recipients = _Recipients()

    if action == workflow.APPROVE and form.status == "associate_hod_review":
        deadline = _dmy(_parse(form.event_start_date) - timedelta(days=1))
        recipients.add(
            [u.id for u in _holders_of(db, "yellow_forms:approve_associate_hod")],
            title=f"{club_name} pre-approval needs your approval",
            content=(
                f"The Faculty Coordinator approved “{form.event_name}” ({_span(form)}, "
                f"{len(form.students)} student(s)). It needs your final approval by {deadline}."
            ),
            email=True,
        )
        recipients.add(
            _leadership_ids(db, form.club_id),
            title=f"Pre-approval {form.reference_number} moved to the Associate HOD",
            content=f"The Faculty Coordinator approved “{form.event_name}”; it is now with the Associate HOD.",
        )
    elif action == workflow.APPROVE:
        granted = (
            f"“{form.event_name}” is pre-approved. File the claim sheet once the event is over "
            f"(on or after {_dmy(form.event_end_date)})."
        )
        recipients.add([form.created_by], title=f"Pre-approval {form.reference_number} granted", content=granted)
        recipients.add(
            _leadership_ids(db, form.club_id),
            title=f"Pre-approval {form.reference_number} granted", content=granted,
        )
        recipients.add(
            [s.student_id for s in form.students],
            title="You are on a pre-approved yellow form",
            content=(
                f"{club_name} has pre-approval for “{form.event_name}” ({_span(form)}). "
                f"Your attendance claim will be filed by the club after the event."
            ),
        )
    else:
        verb = "sent back" if action == workflow.REVISE else "rejected"
        title = f"Pre-approval {form.reference_number} {'returned' if action == workflow.REVISE else 'rejected'}"
        content = f"The {spec.label} {verb} “{form.event_name}”: {form.review_comments}"
        recipients.add([form.created_by], title=title, content=content, email=action == workflow.REVISE)
        recipients.add(_leadership_ids(db, form.club_id), title=title, content=content)

    recipients.send(db, entity_type="pre_approval", entity_id=form.id)


def _notify_claim_sheet_submitted(db: Session, sheet: ClubClaimSheet) -> None:
    form = sheet.pre_approval
    club_name = sheet.club.name
    recipients = _Recipients()
    recipients.add(
        [u.id for u in _holders_of(db, "yellow_forms:review_claim_sheet")],
        title=f"{club_name} claim sheet needs your review",
        content=(
            f"{club_name} filed claim sheet {sheet.reference_number} for “{form.event_name}” "
            f"({_span(form)}, {len(sheet.students)} student(s))."
        ),
        email=True,
    )
    recipients.add(
        _leadership_ids(db, sheet.club_id),
        title=f"Claim sheet {sheet.reference_number} submitted",
        content=f"The claim sheet for “{form.event_name}” is now with the Claims Coordinator.",
    )
    recipients.send(db, entity_type="claim_sheet", entity_id=sheet.id)


def _notify_claim_sheet_reviewed(db: Session, sheet: ClubClaimSheet, action: str) -> None:
    form = sheet.pre_approval
    club_name = sheet.club.name
    recipients = _Recipients()

    if action == workflow.APPROVE:
        content = (
            f"The claim sheet for “{form.event_name}” was approved and forwarded to the attendance office."
        )
        title = f"Claim sheet {sheet.reference_number} approved"
        recipients.add([sheet.created_by], title=title, content=content)
        recipients.add(_leadership_ids(db, sheet.club_id), title=title, content=content)
        recipients.add(
            [s.student_id for s in sheet.students],
            title="Your yellow-form claim was approved",
            content=(
                f"{club_name}'s claim for “{form.event_name}” ({_span(form)}) was approved and "
                f"forwarded to the attendance office."
            ),
        )
    else:
        verb = "sent back" if action == workflow.REVISE else "rejected"
        title = f"Claim sheet {sheet.reference_number} {'returned' if action == workflow.REVISE else 'rejected'}"
        content = f"The Claims Coordinator {verb} the claim sheet for “{form.event_name}”: {sheet.review_comments}"
        recipients.add([sheet.created_by], title=title, content=content, email=action == workflow.REVISE)
        recipients.add(_leadership_ids(db, sheet.club_id), title=title, content=content)

    recipients.send(db, entity_type="claim_sheet", entity_id=sheet.id)


# ---------------------------------------------------------------------------
# Routes. Static paths first: a parameterised route declared above them
# would swallow "queue" or "workflow" as an id.
# ---------------------------------------------------------------------------

@router.get("/workflow")
def get_yellow_form_workflow(current_user: User = Depends(get_current_user)):
    return workflow.as_json()


@router.get("/queue", response_model=YellowFormBundle)
def get_review_queue(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """What is waiting on the caller's decision right now, oldest first.

    Scoped in SQL, the same way the review endpoints authorize, so the count is
    honest: a Faculty Coordinator sees only their own clubs' forms, and a form
    whose event has started is gone — nobody can act on it any more.
    """
    viewer = _Viewer(db, current_user)
    is_admin = "*" in viewer.permissions

    conditions = []
    for spec in workflow.PRE_APPROVAL_STAGES.values():
        if not (is_admin or spec.permission in viewer.permissions):
            continue
        condition = PreApprovalForm.status == spec.id
        if spec.scope_check is not None and not is_admin:
            # The one scoped stage is the club's own Faculty Coordinator.
            club_ids = faculty_scope.get_club_coordinator_club_ids(db, current_user.id)
            if not club_ids:
                continue
            condition = and_(condition, PreApprovalForm.club_id.in_(club_ids))
        conditions.append(condition)

    pre_approvals = []
    if conditions:
        pre_approvals = (
            db.query(PreApprovalForm).options(*PRE_APPROVAL_LOADERS)
            .filter(or_(*conditions), PreApprovalForm.event_start_date > clock.today().isoformat())
            .order_by(PreApprovalForm.submitted_at, PreApprovalForm.created_at)
            .all()
        )

    claim_sheets = []
    sheet_spec = workflow.CLAIM_SHEET_STAGES["claims_coordinator_review"]
    if is_admin or sheet_spec.permission in viewer.permissions:
        claim_sheets = (
            db.query(ClubClaimSheet).options(*CLAIM_SHEET_LOADERS)
            .filter(ClubClaimSheet.status == sheet_spec.id)
            .order_by(ClubClaimSheet.submitted_at, ClubClaimSheet.created_at)
            .all()
        )

    return _bundle(pre_approvals, claim_sheets, viewer)


@router.get("/reviewed", response_model=YellowFormBundle)
def get_reviewed_by_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Everything the caller has approved, sent back or rejected, newest first.

    Only what they may still read: a reviewer who has lost the role, or a
    Faculty Coordinator moved off the club, keeps no window onto the forms.
    """
    uid = current_user.id
    viewer = _Viewer(db, current_user)
    pre_approvals = (
        db.query(PreApprovalForm).options(*PRE_APPROVAL_LOADERS)
        .filter(or_(
            PreApprovalForm.faculty_coordinator_approved_by == uid,
            PreApprovalForm.associate_hod_approved_by == uid,
            PreApprovalForm.last_reviewed_by == uid,
        ))
        .order_by(PreApprovalForm.updated_at.desc())
        .limit(100)
        .all()
    )
    claim_sheets = (
        db.query(ClubClaimSheet).options(*CLAIM_SHEET_LOADERS)
        .filter(ClubClaimSheet.reviewed_by == uid)
        .order_by(ClubClaimSheet.updated_at.desc())
        .limit(100)
        .all()
    )
    return _bundle(
        [f for f in pre_approvals if viewer.sees_pre_approval(f)],
        [s for s in claim_sheets if viewer.sees_claim_sheet(s)],
        viewer,
    )


@router.get("/mine", response_model=YellowFormBundle)
def get_my_yellow_forms(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Forms and claim sheets the caller is listed on, once the club has submitted them."""
    uid = current_user.id
    listed_on = db.query(PreApprovalStudent.pre_approval_id).filter(PreApprovalStudent.student_id == uid)
    claimed_on = db.query(ClubClaimStudent.sheet_id).filter(ClubClaimStudent.student_id == uid)
    pre_approvals = (
        db.query(PreApprovalForm).options(*PRE_APPROVAL_LOADERS)
        .filter(PreApprovalForm.id.in_(listed_on), PreApprovalForm.status != "draft")
        .order_by(PreApprovalForm.event_start_date.desc(), PreApprovalForm.created_at.desc())
        .all()
    )
    claim_sheets = (
        db.query(ClubClaimSheet).options(*CLAIM_SHEET_LOADERS)
        .filter(ClubClaimSheet.id.in_(claimed_on), ClubClaimSheet.status != "draft")
        .order_by(ClubClaimSheet.created_at.desc())
        .all()
    )
    return _bundle(pre_approvals, claim_sheets, _Viewer(db, current_user))


@router.get("/clubs/{club_id}/pre-approvals", response_model=List[PreApprovalOut])
def list_club_pre_approvals(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club(db, club_id)
    viewer = _Viewer(db, current_user)
    query = db.query(PreApprovalForm).options(*PRE_APPROVAL_LOADERS).filter(PreApprovalForm.club_id == club_id)
    if not _club_list_includes_drafts(viewer, club_id):
        query = query.filter(PreApprovalForm.status != "draft")
    forms = query.order_by(PreApprovalForm.event_start_date.desc(), PreApprovalForm.created_at.desc()).all()
    return [_pre_approval_out(f, viewer) for f in forms]


@router.post("/clubs/{club_id}/pre-approvals", response_model=PreApprovalOut)
def create_pre_approval(
    club_id: str,
    form_in: PreApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club(db, club_id)
    viewer = _Viewer(db, current_user)
    _require_filer(viewer, club_id)
    _check_pre_approval(form_in.event_start_date, form_in.event_end_date, form_in.students)

    form = PreApprovalForm(
        id=_new_id("paf"),
        reference_number=_reference("PAF"),
        club_id=club_id,
        academic_year=form_in.academic_year or _academic_year(form_in.event_start_date),
        event_name=form_in.event_name,
        event_description=form_in.event_description or None,
        venue=form_in.venue or None,
        event_start_date=form_in.event_start_date.isoformat(),
        event_end_date=form_in.event_end_date.isoformat(),
        status="draft",
        created_by=current_user.id,
    )
    form.students = _build_pre_approval_students(db, form_in.students)
    db.add(form)
    db.commit()
    return _pre_approval_out(_get_pre_approval(db, form.id), viewer)


@router.get("/clubs/{club_id}/claim-sheets", response_model=List[ClaimSheetOut])
def list_club_claim_sheets(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club(db, club_id)
    viewer = _Viewer(db, current_user)
    query = db.query(ClubClaimSheet).options(*CLAIM_SHEET_LOADERS).filter(ClubClaimSheet.club_id == club_id)
    if not _club_list_includes_drafts(viewer, club_id):
        query = query.filter(ClubClaimSheet.status != "draft")
    sheets = query.order_by(ClubClaimSheet.created_at.desc()).all()
    return [_claim_sheet_out(s, viewer) for s in sheets]


@router.get("/clubs/{club_id}/eligible-students", response_model=List[EligibleStudentOut])
def list_eligible_students(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The club's active members, ready to drop onto a pre-approval."""
    club = _require_club(db, club_id)
    _require_filer(_Viewer(db, current_user), club_id)
    members = [
        m for m in member_repo.get_club_members(db, club_id=club_id)
        if m.status == "active" and m.student is not None
    ]
    return [
        EligibleStudentOut(
            student_id=m.student_id,
            register_number=m.student.enrollment_no or "",
            student_name=m.student.name,
            class_name_suggestion=_class_suggestion(m.student),
            default_role=club.name,
        )
        for m in sorted(members, key=lambda m: m.student.name.lower())
    ]


@router.get("/clubs/{club_id}/student-lookup", response_model=StudentLookupOut)
def lookup_student(
    club_id: str,
    register_number: str = Query(..., min_length=1, max_length=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club(db, club_id)
    _require_filer(_Viewer(db, current_user), club_id)
    register_number = register_number.strip().upper()
    student = db.query(User).filter(
        func.upper(User.enrollment_no) == register_number, User.primary_role == "student",
    ).first() if register_number else None
    if student is None:
        return StudentLookupOut(found=False, register_number=register_number)
    return StudentLookupOut(
        found=True,
        student_id=student.id,
        register_number=register_number,
        student_name=student.name,
        class_name_suggestion=_class_suggestion(student),
    )


@router.get("/pre-approvals/{form_id}", response_model=PreApprovalOut)
def get_pre_approval(form_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    form = _get_pre_approval(db, form_id)
    viewer = _Viewer(db, current_user)
    if not viewer.sees_pre_approval(form):
        raise HTTPException(status_code=403, detail="You do not have access to this pre-approval")
    return _pre_approval_out(form, viewer)


@router.put("/pre-approvals/{form_id}", response_model=PreApprovalOut)
def update_pre_approval(
    form_id: str,
    form_in: PreApprovalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    form = _get_pre_approval(db, form_id)
    viewer = _Viewer(db, current_user)
    _require_filer(viewer, form.club_id)
    _require_editable_pre_approval(form)

    provided = form_in.model_dump(exclude_unset=True)
    start = form_in.event_start_date or _parse(form.event_start_date)
    end = form_in.event_end_date or _parse(form.event_end_date)
    _check_pre_approval(start, end, form_in.students if form_in.students is not None else form.students)

    if form_in.event_name is not None:
        form.event_name = form_in.event_name
    if "event_description" in provided:
        form.event_description = form_in.event_description or None
    if "venue" in provided:
        form.venue = form_in.venue or None
    if form_in.academic_year:
        form.academic_year = form_in.academic_year
    elif start.isoformat() != form.event_start_date:
        form.academic_year = _academic_year(start)
    form.event_start_date = start.isoformat()
    form.event_end_date = end.isoformat()
    if form_in.students is not None:
        _replace(db, form.students, _build_pre_approval_students(db, form_in.students))

    db.commit()
    return _pre_approval_out(_get_pre_approval(db, form_id), viewer)


@router.delete("/pre-approvals/{form_id}")
def delete_pre_approval(form_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    form = _get_pre_approval(db, form_id)
    _require_filer(_Viewer(db, current_user), form.club_id)
    if form.status != "draft":
        raise HTTPException(status_code=400, detail="Only a draft pre-approval can be deleted.")
    db.delete(form)
    db.commit()
    return {"status": "success"}


@router.post("/pre-approvals/{form_id}/submit", response_model=PreApprovalOut)
def submit_pre_approval(form_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Send to the Faculty Coordinator. A returned form restarts from the
    Faculty Coordinator: both earlier approvals are cleared, because the form
    they approved is not the form being resubmitted."""
    form = _get_pre_approval(db, form_id)
    viewer = _Viewer(db, current_user)
    _require_filer(viewer, form.club_id)
    _require_editable_pre_approval(form)
    if not form.students:
        raise HTTPException(status_code=400, detail="Add at least one student before submitting for approval.")
    if not viewer.fc_names(form.club_id):
        raise HTTPException(status_code=400, detail=NO_FACULTY_COORDINATOR)

    form.status = "faculty_coordinator_review"
    form.submitted_at = clock.today().isoformat()
    form.review_comments = None
    form.faculty_coordinator_approved_by = None
    form.faculty_coordinator_approved_at = None
    form.associate_hod_approved_by = None
    form.associate_hod_approved_at = None
    db.commit()

    form = _get_pre_approval(db, form_id)
    _notify_pre_approval_submitted(db, form)
    return _pre_approval_out(form, viewer)


@router.post("/pre-approvals/{form_id}/review", response_model=PreApprovalOut)
def review_pre_approval(
    form_id: str,
    review_in: ReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    form = _get_pre_approval(db, form_id)
    spec = workflow.PRE_APPROVAL_STAGES.get(form.status)
    if spec is None:
        raise HTTPException(
            status_code=400,
            detail=f"This pre-approval is not awaiting review — it is "
                   f"{workflow.PRE_APPROVAL_STATUS_LABELS.get(form.status, form.status).lower()}.",
        )

    viewer = _Viewer(db, current_user)
    if not viewer.may_act(spec, form):
        raise HTTPException(status_code=403, detail=spec.denial)
    if clock.today() >= _parse(form.event_start_date):
        raise HTTPException(
            status_code=400,
            detail="The event has already started — pre-approval can no longer be granted.",
        )
    comments = _review_reason(review_in, "pre-approval")

    if review_in.action == workflow.APPROVE:
        setattr(form, spec.approved_by_field, current_user.id)
        setattr(form, spec.approved_at_field, clock.today().isoformat())
        form.status = spec.on_approve
    else:
        form.status = "returned" if review_in.action == workflow.REVISE else "rejected"
        form.review_comments = comments
        form.last_reviewed_by = current_user.id
        form.last_reviewed_stage = spec.id
    db.commit()

    form = _get_pre_approval(db, form_id)
    _notify_pre_approval_reviewed(db, form, review_in.action, spec)
    return _pre_approval_out(form, _Viewer(db, current_user))


@router.post("/pre-approvals/{form_id}/claim-sheet", response_model=ClaimSheetOut)
def create_claim_sheet(
    form_id: str,
    sheet_in: ClaimSheetUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    form = _get_pre_approval(db, form_id)
    viewer = _Viewer(db, current_user)
    _require_filer(viewer, form.club_id)
    _require_event_over(form)
    if form.claim_sheet is not None:
        raise HTTPException(
            status_code=400,
            detail=f"This pre-approval already has a claim sheet ({form.claim_sheet.reference_number}) — open that one instead.",
        )

    sheet = ClubClaimSheet(
        id=_new_id("ccs"),
        reference_number=_reference("YF"),
        pre_approval_id=form.id,
        club_id=form.club_id,
        status="draft",
        created_by=current_user.id,
    )
    sheet.students = _build_claim_rows(form, sheet_in.students)
    db.add(sheet)
    try:
        db.commit()
    except IntegrityError:
        # Two filers racing: the unique pre_approval_id lets exactly one win.
        db.rollback()
        raise HTTPException(status_code=400, detail="This pre-approval already has a claim sheet — open that one instead.")
    return _claim_sheet_out(_get_claim_sheet(db, sheet.id), viewer)


@router.get("/claim-sheets/{sheet_id}", response_model=ClaimSheetOut)
def get_claim_sheet(sheet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sheet = _get_claim_sheet(db, sheet_id)
    viewer = _Viewer(db, current_user)
    if not viewer.sees_claim_sheet(sheet):
        raise HTTPException(status_code=403, detail="You do not have access to this claim sheet")
    return _claim_sheet_out(sheet, viewer)


@router.put("/claim-sheets/{sheet_id}", response_model=ClaimSheetOut)
def update_claim_sheet(
    sheet_id: str,
    sheet_in: ClaimSheetUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sheet = _get_claim_sheet(db, sheet_id)
    viewer = _Viewer(db, current_user)
    _require_filer(viewer, sheet.club_id)
    _require_editable_claim_sheet(sheet)
    _replace(db, sheet.students, _build_claim_rows(sheet.pre_approval, sheet_in.students))
    db.commit()
    return _claim_sheet_out(_get_claim_sheet(db, sheet_id), viewer)


@router.delete("/claim-sheets/{sheet_id}")
def delete_claim_sheet(sheet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sheet = _get_claim_sheet(db, sheet_id)
    _require_filer(_Viewer(db, current_user), sheet.club_id)
    if sheet.status != "draft":
        raise HTTPException(status_code=400, detail="Only a draft claim sheet can be deleted.")
    db.delete(sheet)
    db.commit()
    return {"status": "success"}


@router.post("/claim-sheets/{sheet_id}/submit", response_model=ClaimSheetOut)
def submit_claim_sheet(sheet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sheet = _get_claim_sheet(db, sheet_id)
    viewer = _Viewer(db, current_user)
    _require_filer(viewer, sheet.club_id)
    _require_editable_claim_sheet(sheet)
    _require_event_over(sheet.pre_approval)
    _check_claim_sheet_complete(sheet)

    today = clock.today()
    if sheet.status == "draft":
        # Informational only, like the individual-claim flag: a late sheet is
        # still reviewed. It says whether the CLUB filed late, so a resubmission
        # after a send-back keeps it.
        sheet.late_submission_flag = (
            today - _parse(sheet.pre_approval.event_end_date)
        ).days > settings.CLAIM_SUBMISSION_SLA_DAYS
    sheet.status = "claims_coordinator_review"
    sheet.submitted_at = today.isoformat()
    sheet.review_comments = None
    db.commit()

    sheet = _get_claim_sheet(db, sheet_id)
    _notify_claim_sheet_submitted(db, sheet)
    return _claim_sheet_out(sheet, viewer)


@router.post("/claim-sheets/{sheet_id}/review", response_model=ClaimSheetOut)
def review_claim_sheet(
    sheet_id: str,
    review_in: ReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sheet = _get_claim_sheet(db, sheet_id)
    spec = workflow.CLAIM_SHEET_STAGES.get(sheet.status)
    if spec is None:
        raise HTTPException(
            status_code=400,
            detail=f"This claim sheet is not awaiting review — it is "
                   f"{workflow.CLAIM_SHEET_STATUS_LABELS.get(sheet.status, sheet.status).lower()}.",
        )

    viewer = _Viewer(db, current_user)
    if not viewer.may_act(spec, sheet):
        raise HTTPException(status_code=403, detail=spec.denial)
    comments = _review_reason(review_in, "claim sheet")

    setattr(sheet, spec.approved_by_field, current_user.id)
    setattr(sheet, spec.approved_at_field, clock.today().isoformat())
    if review_in.action == workflow.APPROVE:
        sheet.status = spec.on_approve
    else:
        sheet.status = "returned" if review_in.action == workflow.REVISE else "rejected"
        sheet.review_comments = comments
    db.commit()

    sheet = _get_claim_sheet(db, sheet_id)
    _notify_claim_sheet_reviewed(db, sheet, review_in.action)
    return _claim_sheet_out(sheet, _Viewer(db, current_user))


def _csv_text(value: Optional[str]) -> str:
    text = value or ""
    return f"'{text}" if text.startswith(_FORMULA_PREFIXES) else text


def _csv_percent(value: Optional[float]) -> str:
    return "" if value is None else f"{value:.2f}"


@router.get(
    "/claim-sheets/{sheet_id}/export.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "The claim sheet in the department's column layout."}},
)
def export_claim_sheet(sheet_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The claim sheet as the department's template lays it out: one row per
    student per date, a period column holding its own label when missed."""
    sheet = _get_claim_sheet(db, sheet_id)
    viewer = _Viewer(db, current_user)
    if not (viewer.sees_claim_sheet(sheet) and viewer.sees_all_attendance(sheet)):
        raise HTTPException(status_code=403, detail="You do not have access to export this claim sheet")

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    serial = 0
    for student in sheet.students:
        for entry in student.entries:
            serial += 1
            missed = set(entry.periods_list)
            writer.writerow([
                serial,
                _csv_text(student.register_number),
                _csv_text(student.student_name),
                _csv_text(student.class_name),
                _dmy(entry.date),
                *[p["column"] if p["id"] in missed else "" for p in workflow.CLAIM_SHEET_PERIODS],
                _csv_percent(student.attendance_with_claims),
                _csv_percent(student.attendance_without_claims),
                _csv_text(student.role),
            ])

    # The BOM makes Excel read the file as UTF-8 (names, en dashes).
    return Response(
        content=("﻿" + buffer.getvalue()).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{sheet.reference_number}.csv"'},
    )
