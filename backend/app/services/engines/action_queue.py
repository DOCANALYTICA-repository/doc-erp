"""Aggregates everything waiting on one person into a single prioritised list.

Every input here already existed and nothing joined them up. A reviewer had to
know which club a plan was in and navigate there to find it; a claim awaiting
their approval was three clicks inside a module they might not think to open.

Ordering is by urgency then age: the oldest overdue thing is the thing most
likely to be blocking somebody else.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, selectinload

from app.core import clock, faculty_scope, yellow_form_access
from app.core import yellow_form_workflow as yf_workflow
from app.core.config import settings
from app.core.rbac import get_resolved_permissions
from app.models.claim import AttendanceEntry, Claim
from app.models.club import AnnualPlan, Club, ClubMember, Reimbursement
from app.models.faculty import Meeting, Task
from app.models.user import User
from app.models.yellow_form import ClubClaimSheet, PreApprovalForm
from app.schemas.action_queue import ActionItem, ActionQueue
from app.services.engines.pipeline import CLAIM_SHEET_STAGE_SLA_DAYS, yellow_form_href

# Mirrors clubs.ANNUAL_PLAN_STAGE_PERMISSIONS. Imported lazily inside the
# function to avoid a circular import through the endpoints package.
URGENCY_RANK = {"overdue": 0, "today": 1, "soon": 2, "normal": 3}


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _urgency_for(due: Optional[date], today: date) -> str:
    if due is None:
        return "normal"
    delta = (due - today).days
    if delta < 0:
        return "overdue"
    if delta == 0:
        return "today"
    if delta <= 3:
        return "soon"
    return "normal"


class ActionQueueEngine:
    def build(self, db: Session, user: User) -> ActionQueue:
        today = datetime.now(timezone.utc).date()
        items: List[ActionItem] = []

        items += self._claims_awaiting(db, user)
        items += self._plans_awaiting(db, user)
        items += self._tasks_due(db, user, today)
        items += self._meetings_without_minutes(db, user, today)
        items += self._reimbursements_awaiting(db, user)
        # Yellow-form deadlines are IST calendar days.
        ist_today = clock.today()
        items += self._yellow_forms_awaiting_review(db, user, ist_today)
        items += self._yellow_forms_for_club(db, user, ist_today)

        items.sort(key=lambda i: (URGENCY_RANK.get(i.urgency, 3), i.due_date or "9999-12-31"))

        counts: dict = {}
        for item in items:
            counts[item.kind] = counts.get(item.kind, 0) + 1

        return ActionQueue(items=items, total=len(items), counts_by_kind=counts)

    # ---- claims -----------------------------------------------------------

    def _claims_awaiting(self, db: Session, user: User) -> List[ActionItem]:
        if user.primary_role not in ("faculty", "super_admin"):
            return []

        permissions = get_resolved_permissions(user)
        tags = set(user.role_tags_list)
        is_admin = user.primary_role == "super_admin"
        found: dict = {}

        def add(claim: Claim, why: str):
            if claim.id in found:
                return
            found[claim.id] = ActionItem(
                id=f"claim:{claim.id}",
                kind="claim_review",
                title=f"Claim {claim.reference_number} needs your review",
                subtitle=why,
                entity_type="claim",
                entity_id=claim.id,
                href=f"/app/claims/review_queue?claim={claim.id}",
                urgency="soon" if claim.late_submission_flag else "normal",
                waiting_since=claim.submission_date,
                can_approve_inline=True,
                approve_href=f"/claims/{claim.id}/approve-stage?action=approve",
            )

        if is_admin or "Class Teacher" in tags:
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage == "initial_review",
                Claim.submission_type == "individual",
            ).all():
                if is_admin or faculty_scope.is_class_teacher_for(
                    db, user.id, c.programme, c.semester, c.section
                ):
                    add(c, "Awaiting Class Teacher review")

        if is_admin or "Club Faculty Coordinator" in tags:
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage == "initial_review",
                Claim.submission_type == "club",
            ).all():
                if is_admin or faculty_scope.is_club_faculty_coordinator_for(db, user.id, c.club_id):
                    add(c, "Awaiting Faculty Coordinator review")

        if is_admin or "claims:review_faculty" in permissions:
            entries = db.query(AttendanceEntry).options(
                selectinload(AttendanceEntry.participant)
            ).filter(
                or_(AttendanceEntry.subject_faculty_id == user.id, AttendanceEntry.co_faculty_id == user.id),
                AttendanceEntry.status == "pending",
            ).all()
            for entry in entries:
                claim = entry.participant.claim if entry.participant else None
                if claim and claim.current_workflow_stage == "subject_faculty":
                    add(claim, "Your attendance entry is pending")

        if is_admin or {"Course Coordinator", "HOD"} & tags:
            # course_coordinator ONLY. A claim at attendance_office has been
            # approved and forwarded out of this system; listing it as an
            # action item asked the coordinator to do something about a claim
            # they had already finished with.
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage == "course_coordinator"
            ).all():
                if is_admin or "HOD" in tags or faculty_scope.is_course_coordinator_for(
                    db, user.id, c.programme
                ):
                    add(c, "Awaiting Course Coordinator approval")

        return list(found.values())

    # ---- annual plans -----------------------------------------------------

    def _plans_awaiting(self, db: Session, user: User) -> List[ActionItem]:
        from app.api.v1.endpoints.clubs import ANNUAL_PLAN_STAGE_PERMISSIONS

        permissions = get_resolved_permissions(user)
        is_admin = "*" in permissions

        actionable = [
            status for status, needed in ANNUAL_PLAN_STAGE_PERMISSIONS.items()
            if is_admin or needed in permissions
        ]
        if not actionable:
            return []

        rows = (
            db.query(AnnualPlan, Club.name)
            .join(Club, Club.id == AnnualPlan.club_id)
            .filter(AnnualPlan.status.in_(actionable))
            .all()
        )

        items = []
        for plan, club_name in rows:
            if plan.status == "faculty_coordinator_review" and not is_admin:
                if not faculty_scope.is_club_faculty_coordinator_for(db, user.id, plan.club_id):
                    continue
            items.append(ActionItem(
                id=f"plan:{plan.id}",
                kind="annual_plan_review",
                title=f"{club_name} annual plan needs your approval",
                subtitle=plan.status.replace("_", " ").title(),
                entity_type="annual_plan",
                entity_id=plan.id,
                href=f"/app/clubs/annual-plan?club={plan.club_id}",
                urgency="soon",
                can_approve_inline=True,
                approve_href=f"/clubs/annual-plans/{plan.id}/review",
            ))
        return items

    # ---- tasks ------------------------------------------------------------

    def _tasks_due(self, db: Session, user: User, today: date) -> List[ActionItem]:
        tasks = db.query(Task).filter(
            Task.assignee_id == user.id,
            Task.status != "completed",
        ).all()

        items = []
        for t in tasks:
            due = _parse_date(t.due_date)
            urgency = _urgency_for(due, today)
            # Only surface what is actually near or past its date; a task due
            # next month is not something that "needs you" today.
            if urgency == "normal":
                continue
            items.append(ActionItem(
                id=f"task:{t.id}",
                kind="task_due",
                title=t.title,
                subtitle=t.description or "",
                entity_type="task",
                entity_id=t.id,
                href="/app/faculty/tasks",
                urgency=urgency,
                due_date=t.due_date,
            ))
        return items

    # ---- meetings ---------------------------------------------------------

    def _meetings_without_minutes(self, db: Session, user: User, today: date) -> List[ActionItem]:
        """A meeting that happened and has no record of what was decided.

        The endpoint to record them is fully implemented and wired into the
        task engine; it simply had no UI, so every meeting stayed permanently
        'scheduled'.
        """
        meetings = db.query(Meeting).filter(
            Meeting.organizer_id == user.id,
            Meeting.status != "cancelled",
        ).all()

        items = []
        for m in meetings:
            when = _parse_date(m.date)
            if when is None or when > today:
                continue
            if m.minutes and m.minutes.strip():
                continue
            items.append(ActionItem(
                id=f"meeting:{m.id}",
                kind="meeting_without_minutes",
                title=f"Record minutes for “{m.title}”",
                subtitle=f"Met on {m.date} at {m.venue}",
                entity_type="meeting",
                entity_id=m.id,
                href=f"/app/faculty/meetings?meeting={m.id}",
                urgency=_urgency_for(when, today),
                due_date=m.date,
                waiting_since=m.date,
            ))
        return items

    # ---- reimbursements ---------------------------------------------------

    def _reimbursements_awaiting(self, db: Session, user: User) -> List[ActionItem]:
        permissions = get_resolved_permissions(user)
        if "*" not in permissions and "reimbursement:approve" not in permissions:
            return []

        club_ids = faculty_scope.get_club_coordinator_club_ids(db, user.id)
        if "*" in permissions:
            rows = db.query(Reimbursement, Club.name).join(
                Club, Club.id == Reimbursement.club_id
            ).filter(Reimbursement.status == "pending").all()
        elif club_ids:
            rows = db.query(Reimbursement, Club.name).join(
                Club, Club.id == Reimbursement.club_id
            ).filter(
                Reimbursement.status == "pending",
                Reimbursement.club_id.in_(club_ids),
            ).all()
        else:
            return []

        return [
            ActionItem(
                id=f"reimb:{r.id}",
                kind="reimbursement_review",
                title=f"Reimbursement of Rs {r.amount:,.0f} awaiting approval",
                subtitle=club_name,
                entity_type="reimbursement",
                entity_id=r.id,
                href=f"/app/clubs/reimbursements?club={r.club_id}",
                urgency="normal",
            )
            for r, club_name in rows
        ]

    # ---- yellow forms -----------------------------------------------------

    def _yellow_forms_awaiting_review(self, db: Session, user: User, today: date) -> List[ActionItem]:
        """Pre-approvals and claim sheets at a stage this user reviews.

        Scoped in SQL exactly as GET /yellow-forms/queue is: a Faculty
        Coordinator only for their own clubs, and never a pre-approval whose
        event has started, since nobody can approve it any more.
        """
        permissions = get_resolved_permissions(user)
        is_admin = "*" in permissions
        items: List[ActionItem] = []

        conditions = []
        for spec in yf_workflow.PRE_APPROVAL_STAGES.values():
            if not (is_admin or spec.permission in permissions):
                continue
            condition = PreApprovalForm.status == spec.id
            if spec.scope_check is not None and not is_admin:
                club_ids = faculty_scope.get_club_coordinator_club_ids(db, user.id)
                if not club_ids:
                    continue
                condition = and_(condition, PreApprovalForm.club_id.in_(club_ids))
            conditions.append(condition)

        if conditions:
            rows = (
                db.query(PreApprovalForm, Club.name)
                .join(Club, Club.id == PreApprovalForm.club_id)
                .filter(or_(*conditions), PreApprovalForm.event_start_date > today.isoformat())
                .all()
            )
            for form, club_name in rows:
                deadline = _parse_date(form.event_start_date) - timedelta(days=1)
                stage_label = yf_workflow.PRE_APPROVAL_STAGES[form.status].label
                items.append(ActionItem(
                    id=f"pre_approval:{form.id}",
                    kind="pre_approval_review",
                    title=f"{club_name} pre-approval needs your approval",
                    subtitle=f"“{form.event_name}” — awaiting {stage_label} approval",
                    entity_type="pre_approval",
                    entity_id=form.id,
                    href=yellow_form_href(form.id),
                    urgency=_urgency_for(deadline, today),
                    due_date=deadline.isoformat(),
                    waiting_since=form.submitted_at,
                ))

        sheet_spec = yf_workflow.CLAIM_SHEET_STAGES["claims_coordinator_review"]
        if is_admin or sheet_spec.permission in permissions:
            rows = (
                db.query(ClubClaimSheet, PreApprovalForm.event_name, Club.name)
                .join(PreApprovalForm, PreApprovalForm.id == ClubClaimSheet.pre_approval_id)
                .join(Club, Club.id == ClubClaimSheet.club_id)
                .filter(ClubClaimSheet.status == sheet_spec.id)
                .all()
            )
            # Due by the pipeline's SLA for this stage, so the inbox and the
            # escalation list agree on what is overdue.
            sla = timedelta(days=CLAIM_SHEET_STAGE_SLA_DAYS[sheet_spec.id])
            for sheet, event_name, club_name in rows:
                submitted = _parse_date(sheet.submitted_at)
                due = submitted + sla if submitted else None
                late = " · filed late" if sheet.late_submission_flag else ""
                items.append(ActionItem(
                    id=f"claim_sheet:{sheet.id}",
                    kind="claim_sheet_review",
                    title=f"{club_name} claim sheet needs your review",
                    subtitle=f"{sheet.reference_number} · “{event_name}”{late}",
                    entity_type="claim_sheet",
                    entity_id=sheet.id,
                    href=yellow_form_href(sheet.id),
                    urgency=_urgency_for(due, today),
                    due_date=due.isoformat() if due else None,
                    waiting_since=sheet.submitted_at,
                ))

        return items

    def _yellow_forms_for_club(self, db: Session, user: User, today: date) -> List[ActionItem]:
        """What a club's filers have to do next: file the claim sheet for a
        pre-approved event that is over, or fix what a reviewer sent back.

        Only for clubs this user may file for (yellow_form_access.can_file) —
        a bottom-rank member can read the club's forms but has nothing to do.
        """
        if user.primary_role == "super_admin":
            club_ids = None
        elif user.primary_role == "faculty":
            club_ids = faculty_scope.get_club_coordinator_club_ids(db, user.id)
        else:
            club_ids = [
                club_id for (club_id,) in db.query(ClubMember.club_id)
                .filter(ClubMember.student_id == user.id, ClubMember.status == "active")
            ]
        if club_ids is not None and not club_ids:
            return []

        today_iso = today.isoformat()
        forms = (
            db.query(PreApprovalForm, Club.name, ClubClaimSheet.id)
            .join(Club, Club.id == PreApprovalForm.club_id)
            .outerjoin(ClubClaimSheet, ClubClaimSheet.pre_approval_id == PreApprovalForm.id)
            .filter(or_(
                and_(
                    PreApprovalForm.status == "approved",
                    PreApprovalForm.event_end_date <= today_iso,
                    # A draft sheet is not filed: only the club can see it.
                    or_(ClubClaimSheet.id.is_(None), ClubClaimSheet.status == "draft"),
                ),
                # A returned form whose event has started can no longer be resubmitted.
                and_(PreApprovalForm.status == "returned", PreApprovalForm.event_start_date > today_iso),
            ))
        )
        sheets = (
            db.query(ClubClaimSheet, PreApprovalForm.event_name, Club.name)
            .join(PreApprovalForm, PreApprovalForm.id == ClubClaimSheet.pre_approval_id)
            .join(Club, Club.id == ClubClaimSheet.club_id)
            .filter(ClubClaimSheet.status == "returned")
        )
        if club_ids is not None:
            forms = forms.filter(PreApprovalForm.club_id.in_(club_ids))
            sheets = sheets.filter(ClubClaimSheet.club_id.in_(club_ids))

        filer: dict = {}

        def can_file(club_id: str) -> bool:
            if club_id not in filer:
                filer[club_id] = yellow_form_access.can_file(db, user, club_id)
            return filer[club_id]

        items: List[ActionItem] = []
        for form, club_name, draft_sheet_id in forms.all():
            if not can_file(form.club_id):
                continue
            href = f"/app/clubs/yellow-forms?club={form.club_id}&open={draft_sheet_id or form.id}"
            if form.status == "approved":
                due = _parse_date(form.event_end_date) + timedelta(days=settings.CLAIM_SUBMISSION_SLA_DAYS)
                state = (
                    "its claim sheet is a draft, not yet submitted" if draft_sheet_id
                    else "the event is over and was pre-approved"
                )
                items.append(ActionItem(
                    id=f"claim_sheet_due:{form.id}",
                    kind="claim_sheet_due",
                    title=f"File the claim sheet for “{form.event_name}”",
                    subtitle=f"{club_name} · {state} ({form.reference_number})",
                    entity_type="pre_approval",
                    entity_id=form.id,
                    href=href,
                    urgency=_urgency_for(due, today),
                    due_date=due.isoformat(),
                    waiting_since=form.event_end_date,
                ))
            else:
                deadline = _parse_date(form.event_start_date) - timedelta(days=1)
                items.append(ActionItem(
                    id=f"returned:{form.id}",
                    kind="yellow_form_returned",
                    title=f"Pre-approval for “{form.event_name}” was sent back",
                    subtitle=f"{club_name} · {form.review_comments or 'See the reviewer’s comments'}",
                    entity_type="pre_approval",
                    entity_id=form.id,
                    href=href,
                    urgency=_urgency_for(deadline, today),
                    due_date=deadline.isoformat(),
                ))

        for sheet, event_name, club_name in sheets.all():
            if not can_file(sheet.club_id):
                continue
            items.append(ActionItem(
                id=f"returned:{sheet.id}",
                kind="yellow_form_returned",
                title=f"Claim sheet for “{event_name}” was sent back",
                subtitle=f"{club_name} · {sheet.review_comments or 'See the reviewer’s comments'}",
                entity_type="claim_sheet",
                entity_id=sheet.id,
                href=f"/app/clubs/yellow-forms?club={sheet.club_id}&open={sheet.id}",
                urgency="soon",
                waiting_since=sheet.reviewed_at,
            ))

        return items


action_queue_engine = ActionQueueEngine()
