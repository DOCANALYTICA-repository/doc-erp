from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.schemas.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page
from app.core.rbac import PermissionChecker, get_current_user, get_resolved_permissions
from app.core import capabilities, claim_workflow, faculty_scope
from app.core.claim_reviewers import ReviewerDirectory
from app.repositories.claim import CLAIM_OUT_LOADERS, claim_repo, claim_participant_repo, attendance_entry_repo, timetable_repo, doc_repo
from app.schemas.claim import (
    ClaimOut, ClaimCreate, ClaimResubmit, TimetableSessionOut, TimetableSessionCreate,
    SupportingDocumentOut, DuplicateClaimWarning,
)
from app.models.user import User
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.services.engines.storage import storage_engine
from app.services.engines.ai import ai_engine
from app.services.engines.reporting import reporting_engine
from app.services.engines.notification import notification_engine
import uuid
from datetime import datetime, timezone

router = APIRouter()

# 1. Timetable fetch helper (Missed class selection)
@router.get("/timetable", response_model=List[TimetableSessionOut])
def get_student_timetable(
    programme: str,
    semester: str,
    section: str,
    batch: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """The class's timetable, narrowed to the caller's batch by default.

    A student is only ever shown slots they actually sit in: their own batch's,
    plus every unbatched slot. Left unfiltered, the claim wizard offered the
    other batch's hours, and a claim raised against one routed to a faculty
    member who does not teach that student — which no reviewer could sensibly
    approve or refuse.

    Anyone who is not a student (Class Teacher, HOD, admin) gets the whole grid
    unless they ask for a batch explicitly, since maintaining a timetable means
    seeing all of it.
    """
    effective_batch = batch if batch is not None else (
        current_user.batch if current_user.primary_role == "student" else None
    )
    return timetable_repo.get_by_academic_context(
        db, prog=programme, sem=semester, sec=section, batch=effective_batch,
    )


# 1a. Timetable administration (Class Teacher / HOD / super_admin) — this
# didn't exist at all before Phase 5; there was no way to populate or
# maintain the timetable data the entire claims workflow depends on beyond
# the one-time seed script.
def _require_timetable_scope(db: Session, current_user: User, programme, semester, section) -> None:
    """A Class Teacher may only maintain THEIR OWN class's timetable.

    claims:manage_timetable was permission-gated but not scope-gated, so any
    Class Teacher could rewrite or delete any other class's timetable — and the
    whole claims workflow is built on that data. HOD and super_admin stay
    department-wide by design.
    """
    if current_user.primary_role == "super_admin":
        return
    if "claims:manage_timetable_all" in get_resolved_permissions(current_user):
        return
    if faculty_scope.is_class_teacher_for(db, current_user.id, programme, semester, section):
        return
    raise HTTPException(
        status_code=403,
        detail="You are not the Class Teacher for this programme/semester/section",
    )


@router.post("/timetable", response_model=TimetableSessionOut)
def create_timetable_session(
    session_in: TimetableSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    _require_timetable_scope(db, current_user, session_in.programme, session_in.semester, session_in.section)
    session_dict = session_in.dict()
    session_dict["id"] = f"tt_{uuid.uuid4().hex[:12]}"
    return timetable_repo.create(db, obj_in=session_dict)

@router.put("/timetable/{session_id}", response_model=TimetableSessionOut)
def update_timetable_session(
    session_id: str,
    session_in: TimetableSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    session = timetable_repo.get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Timetable session not found")
    # Scope BOTH the row being edited and the values being written, or a Class
    # Teacher could move another class's slot into their own scope, or their
    # own out of it.
    _require_timetable_scope(db, current_user, session.programme, session.semester, session.section)
    _require_timetable_scope(db, current_user, session_in.programme, session_in.semester, session_in.section)
    return timetable_repo.update(db, db_obj=session, obj_in=session_in.model_dump(exclude_unset=True))

@router.delete("/timetable/{session_id}")
def delete_timetable_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    session = timetable_repo.get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Timetable session not found")
    _require_timetable_scope(db, current_user, session.programme, session.semester, session.section)
    timetable_repo.remove(db, id=session_id)
    return {"status": "success"}

# 1b. Duplicate-claim check — SOFT WARNING ONLY, never blocks submission
# (per the Claims PRD: "recommend withdrawal of the previous claim but
# shall not block submission").
@router.get("/duplicate-check", response_model=DuplicateClaimWarning)
def check_duplicate_claim(
    date_range: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = claim_repo.get_by_submitter(db, user_id=current_user.id)
    match = next((c for c in existing if c.date_range == date_range and c.status != "rejected"), None)
    if match:
        return DuplicateClaimWarning(
            has_potential_duplicate=True,
            message=f"You already have a claim ({match.reference_number}) covering {date_range}. "
                    f"Consider withdrawing it before submitting a new one for the same dates.",
        )
    return DuplicateClaimWarning(has_potential_duplicate=False)


# 2. Submit Claim
@router.post("", response_model=ClaimOut)
def submit_attendance_claim(
    claim_in: ClaimCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:submit"]))
):
    # Clubs file co-curricular claims as yellow forms (pre-approval, then a
    # claim sheet) from their club workspace; this route is individual-only.
    if claim_in.submission_type == "club":
        raise HTTPException(
            status_code=400,
            detail="Club claims are filed as yellow forms from the club workspace: "
                   "a pre-approval before the event, then a claim sheet once it is over.",
        )
    if claim_in.club_id or any(s != current_user.id for s in claim_in.student_ids or []):
        raise HTTPException(
            status_code=400,
            detail="A claim is filed by the student it is for — clubs claim for their members "
                   "with yellow forms from the club workspace.",
        )
    if claim_in.category == "co_curricular" and not capabilities.is_live("claims.individual_co_curricular"):
        raise HTTPException(
            status_code=403,
            detail="Individual co-curricular claims (yellow forms) are not available yet — "
                   "clubs file yellow forms from their club workspace.",
        )

    claim_id = f"cl_{uuid.uuid4().hex[:12]}"
    ref_num = f"ACP-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    # Late-submission flag: more than CLAIM_SUBMISSION_SLA_DAYS calendar days
    # after the LAST date covered by the claim. Per the PRD this is
    # informational only — late claims remain fully eligible for review and
    # are never auto-rejected.
    late_flag = False
    try:
        last_date_str = claim_in.date_range.split("to")[-1].strip()
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
        late_flag = (
            datetime.now(timezone.utc).replace(tzinfo=None) - last_date
        ).days > settings.CLAIM_SUBMISSION_SLA_DAYS
    except (ValueError, IndexError):
        pass  # Unparseable date_range format — leave flag False rather than guess

    # Create main Claim record
    claim_dict = {
        "id": claim_id,
        "reference_number": ref_num,
        "category": claim_in.category,
        "academic_year": claim_in.academic_year,
        "semester": claim_in.semester,
        "programme": claim_in.programme,
        "section": claim_in.section,
        "submission_type": claim_in.submission_type,
        "club_id": claim_in.club_id,
        "submitted_by": current_user.id,
        "submission_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "date_range": claim_in.date_range,
        "reason": claim_in.reason,
        "status": "submitted",
        "late_submission_flag": late_flag,
        "current_workflow_stage": "initial_review" # Class Teacher or Club Faculty Coordinator
    }
    db_claim = Claim(**claim_dict)
    db.add(db_claim)

    co_teachers = _co_teachers(db, claim_in.programme, claim_in.semester, claim_in.section)
    student_ids = [current_user.id]
    for s_id in student_ids:
        cp_id = f"cp_{uuid.uuid4().hex[:12]}"
        db_participant = ClaimParticipant(
            id=cp_id,
            claim_id=claim_id,
            student_id=s_id,
            status="pending"
        )
        db.add(db_participant)

        # Missed classes entries
        for mc in claim_in.missed_classes:
            entry_id = f"ae_{uuid.uuid4().hex[:12]}"
            db_entry = AttendanceEntry(
                id=entry_id,
                claim_participant_id=cp_id,
                subject=mc.subject,
                course_code=mc.course_code,
                date=mc.date,
                hour=mc.hour,
                subject_faculty_id=mc.subject_faculty_id,
                co_faculty_id=_co_teacher_for(co_teachers, mc),
                status="pending"
            )
            db.add(db_entry)

    db.commit()
    db.refresh(db_claim)

    for s_id in student_ids:
        notification_engine.send_notification(
            db, user_id=s_id, title="Claim submitted",
            content=f"Your {claim_in.category} claim ({ref_num}) has been submitted for initial review.",
            source_module="claims", entity_type="claim", entity_id=claim_id,
        )

    return _to_claim_out(db_claim, ReviewerDirectory(db))


def _co_teachers(db: Session, programme, semester, section) -> dict:
    """(weekday, hour, faculty_id) -> co-teacher, for every co-taught slot.

    Looked up on the server rather than taken from the client: a student
    must not be able to name who signs off their absence.
    """
    return {
        (s.day_of_week, s.hour, s.faculty_id): s.co_faculty_id
        for s in db.query(TimetableSession).filter(
            TimetableSession.programme == programme,
            TimetableSession.semester == semester,
            TimetableSession.section == section,
            TimetableSession.co_faculty_id.isnot(None),
        ).all()
    }


def _co_teacher_for(co_teachers: dict, mc) -> Optional[str]:
    try:
        weekday = datetime.strptime(mc.date, "%Y-%m-%d").strftime("%A")
    except ValueError:
        return None
    return co_teachers.get((weekday, mc.hour, mc.subject_faculty_id))

def _to_claim_out(claim: Claim, reviewers: Optional[ReviewerDirectory] = None) -> ClaimOut:
    """Attach the real submitter name via the existing relationship instead
    of trusting any client-supplied value — fixes the hardcoded
    'Vikram Aditya' display bug that existed purely on the frontend.

    `reviewers` adds who the claim is waiting on. It is optional only so that
    a caller with no Session to hand can still serialise a claim; every route
    passes one.
    """
    out = ClaimOut.model_validate(claim)
    out.submitter_name = claim.submitter.name if claim.submitter else "Unknown"
    if reviewers is not None:
        out.pending_approvals = reviewers.pending_for(claim)
    return out


#: What a reviewer is looking at. "pending" is their to-do list — only claims
#: their own decision is holding up. "actioned" is everything they have already
#: decided, whether it has since been fully approved or merely moved on.
#:
#: One list used to serve both, so a claim a reviewer had already approved sat
#: in their queue next to ones they had not, with nothing but the stage column
#: to tell them apart.
VIEW_PENDING = "pending"
VIEW_ACTIONED = "actioned"
CLAIM_VIEWS = (VIEW_PENDING, VIEW_ACTIONED)

#: Every stage after the Class Teacher has approved.
_PAST_INITIAL_REVIEW = ("subject_faculty", "course_coordinator", "attendance_office")

#: Claim statuses whose next move belongs to the student, not to any reviewer.
_AWAITING_THE_STUDENT = ("draft", "returned", "rejected")


def _claims_pending_for_subject_faculty(db: Session, faculty_id: str) -> List[Claim]:
    """Every claim where this faculty member has at least one of their own
    pending AttendanceEntry rows AND the claim has actually reached the
    subject_faculty stage. AttendanceEntry rows are all created "pending"
    at submission time (before Class Teacher review even happens), so
    without the stage check a subject faculty member would see claims still
    awaiting Class Teacher approval in their Review Queue — confirmed bug."""
    entries = attendance_entry_repo.get_pending_by_faculty(db, faculty_id=faculty_id)
    seen = {}
    for entry in entries:
        claim = entry.participant.claim if entry.participant else None
        if claim and claim.current_workflow_stage == "subject_faculty" and claim.id not in seen:
            seen[claim.id] = claim
    return list(seen.values())


# 3. Retrieve Claims — scoped to what THIS user is actually allowed/expected to see
def _paginate(items: List[ClaimOut], page: int, page_size: int) -> Page[ClaimOut]:
    """Slice an already-scoped list.

    In memory rather than in SQL because the reviewer's list is assembled from
    four differently-scoped queries and then de-duplicated — there is no single
    SQL statement to LIMIT. The set is bounded by a department's claim volume,
    and cutting it at the database would mean either four separate paginations
    or a UNION that re-derives every scope rule in SQL.
    """
    start = (page - 1) * page_size
    return Page[ClaimOut](
        items=items[start:start + page_size],
        total=len(items),
        page=page,
        page_size=page_size,
    )


def _faculty_pending(db: Session, user: User) -> dict:
    """Claims whose next move is THIS reviewer's.

    A draft is excluded everywhere below. A draft has not been submitted to
    anyone — it sat in the Class Teacher's queue purely because it carries the
    initial_review stage from the moment it is created, and there was nothing
    they could usefully do with it.

    So is a claim that has been sent back or rejected: the next move there is
    the student's, and listing it under "awaiting your decision" asks the
    reviewer to decide something they have already decided.
    """
    permissions = get_resolved_permissions(user)
    tags = set(user.role_tags_list)
    results = {}

    if "Class Teacher" in tags:
        for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage == "initial_review",
            Claim.submission_type == "individual",
            Claim.status.notin_(_AWAITING_THE_STUDENT),
        ).all():
            if faculty_scope.is_class_teacher_for(db, user.id, c.programme, c.semester, c.section):
                results[c.id] = c

    if "Club Faculty Coordinator" in tags:
        for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage == "initial_review",
            Claim.submission_type == "club",
            Claim.status.notin_(_AWAITING_THE_STUDENT),
        ).all():
            if faculty_scope.is_club_faculty_coordinator_for(db, user.id, c.club_id):
                results[c.id] = c

    if "claims:review_faculty" in permissions:
        # Already narrowed to the subject_faculty stage AND to entries of
        # theirs that are still pending, which is exactly "pending for me".
        for c in _claims_pending_for_subject_faculty(db, user.id):
            results[c.id] = c

    if "Course Coordinator" in tags or "HOD" in tags:
        # course_coordinator ONLY. attendance_office is terminal — it belongs
        # in the actioned view, not in anyone's to-do list.
        for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage == "course_coordinator",
        ).all():
            if "HOD" in tags or faculty_scope.is_course_coordinator_for(db, user.id, c.programme):
                results[c.id] = c

    return results


def _faculty_actioned(db: Session, user: User) -> dict:
    """Claims this reviewer has already decided.

    Deliberately includes claims that have since moved on as well as ones now
    fully approved: from the reviewer's side both are the same fact — they
    have signed, and there is nothing left for them to do — and a reviewer who
    wants to check what they approved last week should not have to know which
    desk it is sitting on now.

    A claim they sent back or rejected is here too, found by last_revised_by:
    a rejection is a decision, and it would otherwise vanish the moment it was
    made.
    """
    permissions = get_resolved_permissions(user)
    tags = set(user.role_tags_list)
    results = {}

    if "Class Teacher" in tags:
        for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage.in_(_PAST_INITIAL_REVIEW),
            Claim.submission_type == "individual",
        ).all():
            if faculty_scope.is_class_teacher_for(db, user.id, c.programme, c.semester, c.section):
                results[c.id] = c

    if "Club Faculty Coordinator" in tags:
        for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage.in_(_PAST_INITIAL_REVIEW),
            Claim.submission_type == "club",
        ).all():
            if faculty_scope.is_club_faculty_coordinator_for(db, user.id, c.club_id):
                results[c.id] = c

    if "claims:review_faculty" in permissions:
        for c in claim_repo.get_decided_by_subject_faculty(db, faculty_id=user.id):
            results[c.id] = c

    if "Course Coordinator" in tags or "HOD" in tags:
        for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage == "attendance_office",
        ).all():
            if "HOD" in tags or faculty_scope.is_course_coordinator_for(db, user.id, c.programme):
                results[c.id] = c

    for c in db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
        Claim.last_revised_by == user.id,
    ).all():
        results[c.id] = c

    return results


@router.get("", response_model=Page[ClaimOut])
def list_claims(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    view: str = Query(VIEW_PENDING),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Claims scoped to what this caller may see, one page at a time.

    Returns an envelope with a TOTAL rather than a bare array. The previous
    100-row cap was invisible: a super_admin with 300 claims saw 100 and no
    indication the rest existed. An explicit page with a total is the opposite
    failure mode — the user can see there is more.

    Scoping happens first and pagination second, on purpose: paging a list and
    then filtering it would produce short pages and a meaningless total.

    `view` splits a reviewer's claims into what still needs them and what they
    have already decided. It does nothing for a student: their own claims are
    their own claims whatever state they are in.
    """
    if view not in CLAIM_VIEWS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown view '{view}'. Expected one of: {', '.join(CLAIM_VIEWS)}",
        )

    reviewers = ReviewerDirectory(db)

    if current_user.primary_role == "super_admin":
        claims = claim_repo.get_multi(db)
        if view == VIEW_PENDING:
            claims = [c for c in claims if c.status not in _AWAITING_THE_STUDENT]
        return _paginate([_to_claim_out(c, reviewers) for c in claims], page, page_size)

    if current_user.primary_role == "faculty":
        found = _faculty_pending(db, current_user) if view == VIEW_PENDING \
            else _faculty_actioned(db, current_user)
        ordered = sorted(
            found.values(), key=lambda c: (c.submission_date, c.id), reverse=True,
        )
        return _paginate([_to_claim_out(c, reviewers) for c in ordered], page, page_size)

    # Students (and club accounts, once modeled) see their own claims.
    return _paginate(
        [
            _to_claim_out(c, reviewers)
            for c in claim_repo.get_by_submitter(db, user_id=current_user.id)
        ],
        page, page_size,
    )


@router.get("/workflow")
def get_claim_workflow():
    """The claim state machine, as data.

    ClaimStatusStepper.tsx kept its own hardcoded copy of the stage list and
    labels — which is how it came to hardcode 'approved' onto stage 3 as a
    workaround for a backend bug, permanently greying out the stage that
    actually needed attention. Serving the same table both sides read from
    removes the temptation.

    MUST stay above the /{claim_id} route below, or "workflow" is matched as
    a claim id and this endpoint never runs — the same trap that hid the
    reviewer inbox in clubs.py.
    """
    return claim_workflow.as_json()


@router.get("/{claim_id}", response_model=ClaimOut)
def get_claim(claim_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    reviewers = ReviewerDirectory(db)

    if current_user.primary_role == "super_admin":
        return _to_claim_out(claim, reviewers)
    if claim.submitted_by == current_user.id:
        return _to_claim_out(claim, reviewers)
    if any(p.student_id == current_user.id for p in claim.participants):
        return _to_claim_out(claim, reviewers)

    # A draft belongs to the student alone. It carries the initial_review
    # stage from the moment it is created, which is the only reason a Class
    # Teacher could open one — an unsubmitted form nobody has been asked to
    # look at yet.
    if claim.status == "draft":
        raise HTTPException(status_code=403, detail="You do not have access to this claim")

    if current_user.primary_role == "faculty":
        tags = set(current_user.role_tags_list)
        permissions = get_resolved_permissions(current_user)
        is_reviewer = (
            (
                "Class Teacher" in tags and claim.submission_type == "individual"
                and faculty_scope.is_class_teacher_for(db, current_user.id, claim.programme, claim.semester, claim.section)
            )
            or (
                "Club Faculty Coordinator" in tags and claim.submission_type == "club"
                and faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, claim.club_id)
            )
            or ("HOD" in tags and claim.current_workflow_stage in ("course_coordinator", "attendance_office"))
            or (
                "Course Coordinator" in tags
                and claim.current_workflow_stage in ("course_coordinator", "attendance_office")
                and faculty_scope.is_course_coordinator_for(db, current_user.id, claim.programme)
            )
            or (
                # Subject faculty: only once the Class Teacher has let it
                # through, and only for a claim carrying one of their hours.
                # They keep that access after the claim moves on — they have
                # to be able to reopen what they approved.
                "claims:review_faculty" in permissions
                and claim.current_workflow_stage != "initial_review"
                and any(
                    entry.is_taught_by(current_user.id)
                    for participant in claim.participants
                    for entry in participant.entries
                )
            )
            # Whoever sent it back can still read it. Otherwise a reviewer who
            # rejected a claim could not answer a question about it.
            or claim.last_revised_by == current_user.id
        )
        if is_reviewer:
            return _to_claim_out(claim, reviewers)

    raise HTTPException(status_code=403, detail="You do not have access to this claim")


# 4. Review Claim Approval Actions — per-stage authorization + real per-reviewer
#    scoping at the parallel "subject_faculty" stage (a subject faculty may only
#    act on entries actually assigned to them, and the claim only advances past
#    this stage once every participant's entries are no longer pending).
@router.post("/{claim_id}/approve-stage")
def approve_claim_stage(
    claim_id: str,
    action: str,  # approve, reject, revise
    feedback: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Advance, return or reject a claim at whichever stage it is sitting in.

    This was a 130-line if/elif chain, and three separate defects in it were
    really one defect: a branch that forgot to honour `action` (a rejection
    recorded as a success), a branch that forgot super_admin (an admin unable
    to rescue a stuck claim), and a branch that forgot to record the revision.
    Each was patched individually.

    The stages now live in app/core/claim_workflow.STAGES, and this endpoint is
    the three steps that are true of every stage: look up the spec, authorize,
    apply. A new stage cannot forget any of them.
    """
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if action not in claim_workflow.ACTIONS:
        raise HTTPException(status_code=400, detail="Invalid action")
    if action == claim_workflow.REVISE and not (feedback and feedback.strip()):
        raise HTTPException(status_code=400, detail="A reason is required to revise a claim")

    stage = claim.current_workflow_stage
    spec = claim_workflow.STAGES.get(stage)
    if spec is None or spec.is_terminal:
        raise HTTPException(
            status_code=403,
            detail=spec.denial if spec else f"Unknown workflow stage '{stage}'",
        )

    # ---- 1. authorize -----------------------------------------------------
    if not claim_workflow.may_act(db, current_user, claim, spec):
        raise HTTPException(status_code=403, detail=spec.denial)

    is_super_admin = current_user.primary_role == "super_admin"

    def record_revision():
        """Always called on a non-approval, for every stage."""
        claim.revision_reason = feedback
        claim.last_revised_by = current_user.id
        claim.last_revised_stage = stage

    def send_back():
        claim.status = "returned" if action == claim_workflow.REVISE else "rejected"
        claim.current_workflow_stage = "closed"
        record_revision()

    # ---- 2. apply ---------------------------------------------------------
    if spec.is_parallel:
        # Many independent reviewers: each acts only on their OWN entries, and
        # the claim advances only once none are left pending.
        my_pending = [
            entry
            for participant in claim.participants
            for entry in participant.entries
            if entry.status == "pending"
            # Either teacher of a co-taught hour may sign it, and one
            # signature clears it for both.
            and (is_super_admin or entry.is_taught_by(current_user.id))
        ]
        if not my_pending:
            raise HTTPException(
                status_code=403,
                detail="You have no pending attendance entries on this claim",
            )

        if action == claim_workflow.APPROVE:
            for entry in my_pending:
                entry.status = "approved"
                db.add(entry)
            db.flush()
            all_entries = [e for p in claim.participants for e in p.entries]
            if all(e.status != "pending" for e in all_entries):
                claim.current_workflow_stage = spec.on_approve
        else:
            for entry in my_pending:
                entry.status = "rejected"
                entry.feedback = feedback
                db.add(entry)
            send_back()

    elif action == claim_workflow.APPROVE:
        claim.current_workflow_stage = spec.on_approve
        if spec.approve_status:
            claim.status = spec.approve_status

    else:
        send_back()

    db.add(claim)
    db.commit()

    new_spec = claim_workflow.STAGES.get(claim.current_workflow_stage)
    stage_label = (
        claim_workflow.label_for(new_spec, claim.submission_type)
        if new_spec else claim.current_workflow_stage
    )
    participant_ids = {p.student_id for p in claim.participants}
    for s_id in participant_ids:
        notification_engine.send_notification(
            db, user_id=s_id, title=f"Claim {claim.reference_number} update",
            content=f"Your claim is now at: {stage_label} (status: {claim.status}).",
            source_module="claims", entity_type="claim", entity_id=claim.id,
        )
    # The stage that just approved forward to Subject Faculty review is the
    # one moment a SPECIFIC reviewer (not a role-wide permission holder) is
    # known — each attendance entry names its own subject_faculty_id.
    if stage == "initial_review" and claim.current_workflow_stage == "subject_faculty":
        faculty_ids = {
            f_id
            for participant in claim.participants
            for entry in participant.entries
            if entry.status == "pending"
            for f_id in (entry.subject_faculty_id, entry.co_faculty_id)
            if f_id
        }
        for f_id in faculty_ids:
            notification_engine.send_notification(
                db, user_id=f_id, title="Claim pending your review",
                content=f"Claim {claim.reference_number} has attendance entries awaiting your approval.",
                source_module="claims", entity_type="claim", entity_id=claim.id,
                # A reviewer being asked to act is exactly the case email
                # exists for — the workflow stalls until they notice.
                email_recipient=True,
            )

    return {"status": "success", "new_stage": claim.current_workflow_stage, "claim_status": claim.status}


# 4b. Resubmit — edits a returned claim in place (per product decision: no
# new linked claim, same record, reviewers see continuity) and notifies the
# reviewer who returned it (plus whoever now holds initial_review scope,
# since the two may differ) with a plain-dict diff of what changed.
@router.put("/{claim_id}/resubmit", response_model=ClaimOut)
def resubmit_claim(
    claim_id: str,
    resubmit_in: ClaimResubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the claim's submitter may resubmit it")
    if claim.status != "returned":
        raise HTTPException(status_code=400, detail="Only a returned claim may be resubmitted")

    diff = {}

    if resubmit_in.date_range is not None and resubmit_in.date_range != claim.date_range:
        diff["date_range"] = {"old": claim.date_range, "new": resubmit_in.date_range}
        claim.date_range = resubmit_in.date_range

    if resubmit_in.reason is not None and resubmit_in.reason != claim.reason:
        diff["reason"] = {"old": claim.reason, "new": resubmit_in.reason}
        claim.reason = resubmit_in.reason

    if resubmit_in.missed_classes is not None:
        old_labels = [f"{e.subject} ({e.date} {e.hour})" for p in claim.participants for e in p.entries]
        for participant in claim.participants:
            for entry in list(participant.entries):
                db.delete(entry)
        db.flush()
        co_teachers = _co_teachers(db, claim.programme, claim.semester, claim.section)
        new_labels = []
        for participant in claim.participants:
            for mc in resubmit_in.missed_classes:
                entry_id = f"ae_{uuid.uuid4().hex[:12]}"
                db.add(AttendanceEntry(
                    id=entry_id,
                    claim_participant_id=participant.id,
                    subject=mc.subject,
                    course_code=mc.course_code,
                    date=mc.date,
                    hour=mc.hour,
                    subject_faculty_id=mc.subject_faculty_id,
                    co_faculty_id=_co_teacher_for(co_teachers, mc),
                    status="pending",
                ))
                new_labels.append(f"{mc.subject} ({mc.date} {mc.hour})")
        if old_labels != new_labels:
            diff["missed_classes"] = {"old": old_labels, "new": new_labels}

    if resubmit_in.removed_document_ids:
        removed = []
        for doc_id in resubmit_in.removed_document_ids:
            doc = doc_repo.get(db, doc_id)
            if doc and doc.claim_id == claim_id:
                removed.append(doc.document_type)
                db.delete(doc)
        if removed:
            diff["documents_removed"] = removed

    reviewer_id = claim.last_revised_by
    reviewer_stage = claim.last_revised_stage

    # Reset EVERY participant and entry back to pending — the same state they
    # get at creation.
    #
    # This only happened when the student supplied new missed_classes (which
    # deletes and recreates the entries). Resubmitting a corrected *reason*
    # left the previously-rejected entries rejected, so the subject faculty's
    # pending list was empty and they got a permanent 403 at the very stage
    # the claim had just been sent back to. The claim could never leave
    # subject_faculty again.
    for participant in claim.participants:
        participant.status = "pending"
        db.add(participant)
        for entry in participant.entries:
            entry.status = "pending"
            entry.feedback = None
            db.add(entry)

    claim.status = "submitted"
    claim.current_workflow_stage = "initial_review"
    claim.revision_reason = None
    db.add(claim)
    db.commit()
    db.refresh(claim)

    diff_parts = []
    if "date_range" in diff:
        diff_parts.append(f"date range: '{diff['date_range']['old']}' -> '{diff['date_range']['new']}'")
    if "reason" in diff:
        diff_parts.append("reason updated")
    if "missed_classes" in diff:
        diff_parts.append("missed classes updated")
    if "documents_removed" in diff:
        diff_parts.append(f"{len(diff['documents_removed'])} document(s) removed")
    diff_summary = "; ".join(diff_parts) if diff_parts else "no fields changed"

    notify_ids = set()
    if reviewer_id:
        notify_ids.add(reviewer_id)

    if claim.submission_type == "individual":
        for candidate in db.query(User).filter(User.role_tags_str.like("%Class Teacher%")).all():
            if faculty_scope.is_class_teacher_for(db, candidate.id, claim.programme, claim.semester, claim.section):
                notify_ids.add(candidate.id)
    else:
        for candidate in db.query(User).filter(User.role_tags_str.like("%Club Faculty Coordinator%")).all():
            if faculty_scope.is_club_faculty_coordinator_for(db, candidate.id, claim.club_id):
                notify_ids.add(candidate.id)

    for uid in notify_ids:
        notification_engine.send_notification(
            db, user_id=uid, title=f"Claim {claim.reference_number} resubmitted",
            content=f"The claim was resubmitted after being sent back at the {reviewer_stage or 'review'} stage. Changes: {diff_summary}.",
            source_module="claims", entity_type="claim", entity_id=claim.id,
            email_recipient=True,
        )

    return _to_claim_out(claim, ReviewerDirectory(db))


# 4c. List Supporting Documents — every reviewer who can see the claim can
# see its documents (previously no reviewer role could see any document).
@router.get("/{claim_id}/documents", response_model=List[SupportingDocumentOut])
def list_claim_documents(claim_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_claim(claim_id, db, current_user)  # reuses the exact same visibility rule, raises 403/404 as needed
    return doc_repo.get_by_claim(db, claim_id=claim_id)


# 5. Supporting Documents — real upload via the Storage Engine (Phase 1C/5).
# Previously the medical-certificate file input on the frontend wasn't wired
# to any handler at all; selecting a file silently did nothing.
@router.post("/{claim_id}/documents", response_model=SupportingDocumentOut)
async def upload_supporting_document(
    claim_id: str,
    # Constrained, not free text. The comment here used to claim these were
    # the two accepted values while the signature accepted any string at all.
    document_type: Literal["medical_certificate", "pre_approval_form", "supporting_evidence"] = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.submitted_by != current_user.id and current_user.primary_role != "super_admin":
        raise HTTPException(status_code=403, detail="Only the claim's submitter may attach supporting documents")

    stored_path = await storage_engine.upload_file(file, folder=f"claims/{claim_id}")
    doc = SupportingDocument(
        id=f"doc_{uuid.uuid4().hex[:12]}",
        claim_id=claim_id,
        document_type=document_type,
        file_url=stored_path,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{claim_id}/documents/{document_id}/download-url")
def get_supporting_document_url(
    claim_id: str, document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = doc_repo.get(db, document_id)
    if not doc or doc.claim_id != claim_id:
        raise HTTPException(status_code=404, detail="Document not found")
    # Reuse the same access rule as viewing the claim itself.
    get_claim(claim_id, db, current_user)
    return {"url": storage_engine.get_signed_url(doc.file_url)}


# 6. AI Engine — faculty-facing reason summarization (bounded, advisory-only,
# in v1; the open-ended Student AI Assistant stays claims.student_ai_assistant
# / coming_soon, see backend/app/core/capabilities.py).
@router.get("/{claim_id}/ai-summary")
def get_claim_ai_summary(
    claim_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:review_faculty"])),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return {"summary": ai_engine.summarize_claim_reason(claim.reason or "")}


# 7. Reports Engine — attendance claims summary (one of the two v1 report
# types named in the Claims PRD; gated to faculty/admin, matching the PRD's
# framing that these are operational reports, not student-facing).
@router.get("/reports/attendance-summary")
def get_attendance_summary_report(
    academic_year: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["reports:view"])),
):
    return reporting_engine.generate_attendance_report(db, academic_year=academic_year)
