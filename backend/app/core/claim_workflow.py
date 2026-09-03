"""The claim workflow as a declarative table.

approve_claim_stage was a 130-line if/elif chain, and three of the defects
found in it were the same defect wearing different hats: a branch that forgot
to honour `action`, a branch that forgot super_admin, and a branch that forgot
to record the revision. Each was patched individually; none of them could
happen if the stages were data rather than control flow.

This is the idiom clubs.py already got right for annual plans
(ANNUAL_PLAN_STAGE_PERMISSIONS / ANNUAL_PLAN_NEXT_STAGE), applied to the
harder of the two workflows.

The same table is served as JSON at GET /claims/workflow, so the frontend
stepper stops hardcoding its own copy of the stage labels.
"""
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from sqlalchemy.orm import Session

from app.core import faculty_scope
from app.models.claim import Claim
from app.models.user import User

# The action a reviewer takes.
APPROVE = "approve"
REVISE = "revise"
REJECT = "reject"
ACTIONS = (APPROVE, REVISE, REJECT)


@dataclass(frozen=True)
class StageSpec:
    """Everything true about one stage of the claim workflow."""

    id: str
    label: str
    club_label: Optional[str] = None

    #: Any ONE of these permissions admits a reviewer to this stage.
    required_permissions: tuple = ()

    #: Extra, claim-specific check beyond the permission string. Returns True
    #: if this user is scoped for THIS claim. super_admin never reaches it.
    scope_check: Optional[Callable[[Session, User, Claim], bool]] = None

    #: Human-readable reason used when authorization fails.
    denial: str = "You may not act at this stage"

    #: Where an approval goes next.
    on_approve: Optional[str] = None

    #: True when this stage has many independent reviewers (subject faculty),
    #: so an approval advances the claim only once every entry is resolved.
    is_parallel: bool = False

    #: Status set alongside on_approve.
    approve_status: Optional[str] = None

    #: A stage nobody can act on.
    is_terminal: bool = False


def _class_teacher_scoped(db: Session, user: User, claim: Claim) -> bool:
    return faculty_scope.is_class_teacher_for(
        db, user.id, claim.programme, claim.semester, claim.section
    )


def _club_coordinator_scoped(db: Session, user: User, claim: Claim) -> bool:
    return faculty_scope.is_club_faculty_coordinator_for(db, user.id, claim.club_id)


def _initial_reviewer_scoped(db: Session, user: User, claim: Claim) -> bool:
    """The first stage has two different reviewers depending on how the claim
    was submitted: a Class Teacher for an individual claim, the club's Faculty
    Coordinator for a club claim."""
    if claim.submission_type == "club":
        return (
            "claims:review_faculty_coordinator" in _perms(user)
            and _club_coordinator_scoped(db, user, claim)
        )
    return (
        "claims:review_class_teacher" in _perms(user)
        and _class_teacher_scoped(db, user, claim)
    )


def _course_coordinator_scoped(db: Session, user: User, claim: Claim) -> bool:
    """HOD is department-wide; a Course Coordinator is scoped to a programme."""
    tags = set(user.role_tags_list)
    if "HOD" in tags:
        return True
    if "Course Coordinator" in tags:
        return faculty_scope.is_course_coordinator_for(db, user.id, claim.programme)
    return False


def _perms(user: User) -> set:
    # Imported lazily: rbac imports models, and this module is imported by the
    # endpoints that rbac's dependencies also touch.
    from app.core.rbac import get_resolved_permissions
    return get_resolved_permissions(user)


STAGES: dict = {
    "initial_review": StageSpec(
        id="initial_review",
        label="Class Teacher review",
        club_label="Club Faculty Coordinator review",
        required_permissions=("claims:review_class_teacher", "claims:review_faculty_coordinator"),
        scope_check=_initial_reviewer_scoped,
        denial="Only the assigned Class Teacher or Club Faculty Coordinator may act at this stage",
        on_approve="subject_faculty",
        approve_status="under_review",
    ),
    "subject_faculty": StageSpec(
        id="subject_faculty",
        label="Subject faculty review",
        required_permissions=("claims:review_faculty",),
        denial="Only Subject Faculty may act at this stage",
        on_approve="course_coordinator",
        is_parallel=True,
    ),
    "course_coordinator": StageSpec(
        id="course_coordinator",
        label="Course Coordinator / HOD review",
        required_permissions=("claims:approve_coordinator",),
        scope_check=_course_coordinator_scoped,
        denial="You are not the assigned Course Coordinator for this programme",
        on_approve="attendance_office",
        approve_status="approved",
    ),
    "attendance_office": StageSpec(
        id="attendance_office",
        label="Attendance office update",
        required_permissions=("claims:approve_coordinator",),
        scope_check=_course_coordinator_scoped,
        denial="You are not the assigned Course Coordinator for this programme",
        # The last acting stage: approving here CLOSES the claim.
        on_approve="closed",
        approve_status="closed",
    ),
    "closed": StageSpec(
        id="closed",
        label="Closed",
        is_terminal=True,
        denial="This claim is already closed",
    ),
}

#: Display order, for the stepper and for progress calculations.
STAGE_ORDER: List[str] = [
    "initial_review", "subject_faculty", "course_coordinator",
    "attendance_office", "closed",
]


def may_act(db: Session, user: User, claim: Claim, spec: StageSpec) -> bool:
    """Is this user a reviewer for this claim at this stage?

    super_admin bypasses both the permission and the scope check — that bypass
    is the whole reason it exists, and forgetting it at one stage is what left
    an admin unable to rescue a claim stuck behind an unavailable reviewer.
    """
    if user.primary_role == "super_admin":
        return True
    if spec.is_terminal:
        return False

    permissions = _perms(user)
    if not any(p in permissions for p in spec.required_permissions):
        return False
    if spec.scope_check is not None:
        return spec.scope_check(db, user, claim)
    return True


def label_for(spec: StageSpec, submission_type: str) -> str:
    return spec.club_label if (submission_type == "club" and spec.club_label) else spec.label


def as_json() -> dict:
    """The workflow, for the client.

    ClaimStatusStepper hardcoded its own stage list and labels, which is how
    it came to hardcode 'approved' onto stage 3 as a workaround for a backend
    bug. One source of truth removes the temptation.
    """
    return {
        "stage_order": STAGE_ORDER,
        "actions": list(ACTIONS),
        "stages": [
            {
                "id": spec.id,
                "label": spec.label,
                "club_label": spec.club_label or spec.label,
                "is_terminal": spec.is_terminal,
                "is_parallel": spec.is_parallel,
                "next_on_approve": spec.on_approve,
            }
            for spec in (STAGES[s] for s in STAGE_ORDER)
        ],
    }
