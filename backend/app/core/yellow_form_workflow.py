"""The two yellow-form workflows as declarative tables.

Same idiom as app/core/claim_workflow.py: each review stage is data — who may
act, how they are scoped, where an approval goes, which fields record it — and
the endpoints are the three steps true of every stage (look up the spec,
authorize, apply). A stage cannot forget super_admin or forget to record who
approved, because neither is written per stage.

  Pre-approval:  draft -> Faculty Coordinator -> Associate HOD -> approved
  Claim sheet:   draft -> Claims Coordinator -> approved (forwarded to the
                 attendance office, which does not use this system)

Revise sends either document back to the club ("returned", editable and
resubmittable); reject is terminal. Both need a reason.

Served as JSON at GET /yellow-forms/workflow so the frontend stepper never
keeps its own copy of the labels.
"""
from dataclasses import dataclass
from typing import Callable, List, Optional

from sqlalchemy.orm import Session

from app.core import faculty_scope
from app.models.user import User

APPROVE = "approve"
REVISE = "revise"
REJECT = "reject"
ACTIONS = (APPROVE, REVISE, REJECT)

#: The claim sheet's period columns, exactly as the department's template has
#: them. Extending the vocabulary is a one-line change here; the frontend reads
#: it from as_json().
CLAIM_SHEET_PERIODS: List[dict] = [
    {"id": "7AM", "label": "7:00 AM", "column": "Period 7AM"},
    {"id": "8AM", "label": "8:00 AM", "column": "Period 8AM"},
    {"id": "9AM", "label": "9:00 AM", "column": "Period 9AM"},
    {"id": "9_45AM", "label": "9:45 AM", "column": "Period 9_45AM"},
    {"id": "10_45AM", "label": "10:45 AM", "column": "Period 10_45AM"},
]
PERIOD_IDS: List[str] = [p["id"] for p in CLAIM_SHEET_PERIODS]

#: Statuses in which the club may still edit and (re)submit.
EDITABLE_STATUSES = ("draft", "returned")

#: Pre-approval statuses that become "expired" once the event has started:
#: nothing can move them forward any more.
PRE_APPROVAL_OPEN_STATUSES = ("draft", "faculty_coordinator_review", "associate_hod_review", "returned")


@dataclass(frozen=True)
class StageSpec:
    id: str
    label: str
    permission: str
    on_approve: str
    denial: str
    #: Extra per-document check beyond the permission. super_admin never reaches it.
    scope_check: Optional[Callable[[Session, User, object], bool]] = None
    #: Columns an approval at this stage records (who, and on which date).
    approved_by_field: Optional[str] = None
    approved_at_field: Optional[str] = None


def _club_coordinator_scoped(db: Session, user: User, form) -> bool:
    return faculty_scope.is_club_faculty_coordinator_for(db, user.id, form.club_id)


PRE_APPROVAL_STAGES: dict = {
    "faculty_coordinator_review": StageSpec(
        id="faculty_coordinator_review",
        label="Club Faculty Coordinator",
        permission="yellow_forms:approve_faculty_coordinator",
        scope_check=_club_coordinator_scoped,
        on_approve="associate_hod_review",
        denial="You are not the assigned Faculty Coordinator for this club",
        approved_by_field="faculty_coordinator_approved_by",
        approved_at_field="faculty_coordinator_approved_at",
    ),
    "associate_hod_review": StageSpec(
        id="associate_hod_review",
        label="Associate HOD",
        permission="yellow_forms:approve_associate_hod",
        on_approve="approved",
        denial="Only the Associate HOD can give final pre-approval",
        approved_by_field="associate_hod_approved_by",
        approved_at_field="associate_hod_approved_at",
    ),
}
PRE_APPROVAL_ORDER: List[str] = ["draft", "faculty_coordinator_review", "associate_hod_review", "approved"]

CLAIM_SHEET_STAGES: dict = {
    "claims_coordinator_review": StageSpec(
        id="claims_coordinator_review",
        label="Claims Coordinator",
        permission="yellow_forms:review_claim_sheet",
        on_approve="approved",
        denial="Only the Claims Coordinator can review claim sheets",
        approved_by_field="reviewed_by",
        approved_at_field="reviewed_at",
    ),
}
CLAIM_SHEET_ORDER: List[str] = ["draft", "claims_coordinator_review", "approved"]

PRE_APPROVAL_STATUS_LABELS: dict = {
    "draft": "Draft",
    "faculty_coordinator_review": "With Faculty Coordinator",
    "associate_hod_review": "With Associate HOD",
    "approved": "Pre-approved",
    "returned": "Returned to club",
    "rejected": "Rejected",
}
CLAIM_SHEET_STATUS_LABELS: dict = {
    "draft": "Draft",
    "claims_coordinator_review": "With Claims Coordinator",
    "approved": "Approved — forwarded to attendance office",
    "returned": "Returned to club",
    "rejected": "Rejected",
}


def _perms(user: User) -> set:
    # Imported lazily for the same reason as claim_workflow._perms.
    from app.core.rbac import get_resolved_permissions
    return get_resolved_permissions(user)


def may_act(db: Session, user: User, obj, spec: StageSpec) -> bool:
    """Is this user the reviewer for this document at this stage?

    super_admin bypasses both the permission and the scope check.
    """
    if user.primary_role == "super_admin":
        return True
    if spec.permission not in _perms(user):
        return False
    if spec.scope_check is not None:
        return spec.scope_check(db, user, obj)
    return True


def _stages_json(order: List[str], stages: dict, status_labels: dict) -> List[dict]:
    """One entry per step of the happy path, aligned with stage_order."""
    return [
        {
            "id": step,
            "label": stages[step].label if step in stages else status_labels[step],
            "is_review": step in stages,
        }
        for step in order
    ]


def as_json() -> dict:
    return {
        "actions": list(ACTIONS),
        "periods": CLAIM_SHEET_PERIODS,
        "pre_approval": {
            "stage_order": PRE_APPROVAL_ORDER,
            "stages": _stages_json(PRE_APPROVAL_ORDER, PRE_APPROVAL_STAGES, PRE_APPROVAL_STATUS_LABELS),
            "status_labels": PRE_APPROVAL_STATUS_LABELS,
        },
        "claim_sheet": {
            "stage_order": CLAIM_SHEET_ORDER,
            "stages": _stages_json(CLAIM_SHEET_ORDER, CLAIM_SHEET_STAGES, CLAIM_SHEET_STATUS_LABELS),
            "status_labels": CLAIM_SHEET_STATUS_LABELS,
        },
    }
