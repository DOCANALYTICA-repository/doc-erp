from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user, get_resolved_permissions
from app.core import faculty_scope
from app.repositories.faculty_assignment import faculty_assignment_repo
from app.repositories.club import (
    club_repo, member_repo, event_repo, budget_repo, reimbursement_repo, sponsorship_repo,
    recruitment_drive_repo, recruitment_application_repo, announcement_repo,
    annual_plan_repo, club_document_repo, event_attendance_repo, hierarchy_repo,
)
from app.repositories.faculty import task_repo
from app.schemas.club import (
    ClubOut, ClubDetailOut, ClubMemberOut, EventOut, EventCreate, BudgetOut, ReimbursementOut, ReimbursementCreate,
    SponsorshipOut, SponsorshipCreate,
    RecruitmentDriveOut, RecruitmentDriveCreate, RecruitmentApplicationOut, RecruitmentApplicationCreate,
    RecruitmentApplicationUpdate, AnnouncementOut, AnnouncementCreate,
    AnnualPlanOut, AnnualPlanCreate, AnnualPlanUpdate, AnnualPlanReviewAction,
    ClubDocumentOut, PermissionTemplateAssign,
    ClubSettingsUpdate, ClubHierarchyLevelOut, ClubHierarchyLevelCreate, ClubHierarchyLevelUpdate,
    MyClubOut, AwaitingReviewPlanOut, ClubBootstrap, ClubCapabilities, ClubCounters,
    ClubHierarchyMemberAssign, ClubTaskCreate, ClubTaskReviewAction,
    EventAttendanceRecord, EventAttendanceOut,
)
from app.schemas.task import TaskOut
from app.models.user import User
from sqlalchemy import func
from app.models.club import AnnualPlan, Budget, Club, Event, EventAttendance, ClubHierarchyLevel, Reimbursement
from app.models.faculty import Task
from app.services.engines.reporting import reporting_engine
from app.services.engines.storage import storage_engine
from app.services.engines.notification import notification_engine
from app.services.engines.club_hierarchy import club_hierarchy_engine
from app.services.engines.task import task_engine
import uuid

router = APIRouter()

#: Sentinel for "not looked up yet", distinct from a legitimate None.
_UNSET = object()


class ClubViewerFacts:
    """The handful of facts every club authorization rule is built from.

    Each is fetched AT MOST ONCE and only if something actually asks for it.

    This exists because resolving the seven capability flags used to re-run the
    same two lookups five and six times over — the membership row and the
    club's hierarchy levels — so simply opening a workspace cost 25 queries,
    most of them identical. A route that needs only the membership still pays
    for only the membership.

    Deliberately NOT cached across requests: it is built per call, so a write
    earlier in the same request is never masked by a stale read.
    """

    def __init__(self, db: Session, user: User, club_id: str):
        self._db = db
        self._user = user
        self._club_id = club_id
        self._membership = _UNSET
        self._levels = _UNSET
        self._permissions = _UNSET
        self._is_coordinator = _UNSET

    @property
    def is_super_admin(self) -> bool:
        return self._user.primary_role == "super_admin"

    @property
    def is_faculty(self) -> bool:
        return self._user.primary_role == "faculty"

    @property
    def permissions(self) -> set:
        if self._permissions is _UNSET:
            self._permissions = get_resolved_permissions(self._user)
        return self._permissions

    @property
    def membership(self):
        if self._membership is _UNSET:
            self._membership = member_repo.get_by_student_and_club(
                self._db, student_id=self._user.id, club_id=self._club_id
            )
        return self._membership

    @property
    def is_active_member(self) -> bool:
        return self.membership is not None and self.membership.status == "active"

    @property
    def levels(self) -> list:
        if self._levels is _UNSET:
            self._levels = hierarchy_repo.get_by_club(self._db, club_id=self._club_id)
        return self._levels

    @property
    def is_club_coordinator(self) -> bool:
        if self._is_coordinator is _UNSET:
            self._is_coordinator = faculty_scope.is_club_faculty_coordinator_for(
                self._db, self._user.id, self._club_id
            )
        return self._is_coordinator

    @property
    def is_department_reviewer(self) -> bool:
        return "*" in self.permissions or any(
            p in self.permissions for p in DEPARTMENT_WIDE_REVIEW_PERMISSIONS
        )

    def rank(self) -> Optional[int]:
        """The member's level_order.

        A LOWER level_order is a HIGHER rank (10 = President, 40 = Member),
        which is why is_top_rank uses min() and is_bottom_rank uses max().

        A member with no level assigned is treated as bottom rank — the most
        restrictive default, matching club_hierarchy_engine.
        """
        membership = self.membership
        if membership is None:
            return None
        if membership.hierarchy_level and membership.hierarchy_level.level_order is not None:
            return membership.hierarchy_level.level_order
        orders = [l.level_order for l in self.levels if l.level_order is not None]
        return max(orders) if orders else None

    @property
    def is_top_rank(self) -> bool:
        orders = [l.level_order for l in self.levels if l.level_order is not None]
        if not orders:
            return False
        return self.rank() == min(orders)

    @property
    def is_bottom_rank(self) -> bool:
        orders = [l.level_order for l in self.levels if l.level_order is not None]
        if not orders:
            return True
        return self.rank() == max(orders)


def _require_active_club_member(db: Session, current_user: User, club_id: str) -> None:
    """
    Every write scoped to a specific club must verify the caller actually
    belongs to THAT club — holding a generic permission string (e.g.
    "events:create" from being President of a different club) is not
    enough. super_admin bypasses this, matching every other endpoint.
    """
    if current_user.primary_role == "super_admin":
        return
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if not membership or membership.status != "active":
        raise HTTPException(status_code=403, detail="You are not an active member of this club")


# Department-wide plan reviewers. These roles sit ABOVE any single club in the
# annual-plan approval chain, so they must be able to read every club — they
# are deliberately not scoped in faculty_scope.py either.
DEPARTMENT_WIDE_REVIEW_PERMISSIONS = (
    "clubs:approve_plan_cultural_coordinator",
    "clubs:approve_plan_hod",
)


def _is_department_wide_reviewer(current_user: User) -> bool:
    perms = get_resolved_permissions(current_user)
    return "*" in perms or any(p in perms for p in DEPARTMENT_WIDE_REVIEW_PERMISSIONS)


def _require_club_reader(db: Session, current_user: User, club_id: str) -> None:
    """Read access to a club's workspace.

    Granted to: an active member, the club's assigned Faculty Coordinator, a
    department-wide plan reviewer (Cultural Coordinator / HOD), or super_admin.

    This exists because _require_active_club_member is a pure ClubMember
    lookup, and a Faculty Coordinator is by definition NOT a member of the club
    they oversee. Gating reads on membership produced a precise inversion: the
    only user permitted to EDIT a club's hierarchy was the only faculty user
    forbidden from READING it — and, worse, the coordinator got 403 on
    /annual-plans, the list containing the very plan he had to approve. He
    could therefore never learn the plan_id that the review endpoint requires.

    Writes keep _require_active_club_member: a coordinator oversees the club,
    they do not draft its events, plans or budgets.
    """
    if current_user.primary_role == "super_admin":
        return
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if membership and membership.status == "active":
        return
    if faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, club_id):
        return
    if _is_department_wide_reviewer(current_user):
        return
    raise HTTPException(
        status_code=403,
        detail="You do not have access to this club's workspace",
    )


def _require_club_head_or_admin(db: Session, current_user: User, club_id: str) -> None:
    """
    Permission Template assignment (Clubs PRD §17: "Club Head... including
    permission assignment, subject to faculty oversight") — allowed for the
    club's President/Club Head, any faculty coordinator with plan-approval
    authority, or super_admin.
    """
    if current_user.primary_role == "super_admin":
        return
    if current_user.primary_role == "faculty":
        perms = get_resolved_permissions(current_user)
        if "clubs:approve_plan" in perms:
            return
        raise HTTPException(status_code=403, detail="Not enough permissions")
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if not membership or membership.status != "active":
        raise HTTPException(status_code=403, detail="You are not an active member of this club")
    if not club_hierarchy_engine.is_top_level(db, membership) and membership.permission_template != "Club Head":
        raise HTTPException(status_code=403, detail="Only the Club Head may assign permission templates")


def _require_task_assigner(db: Session, current_user: User, club_id: str) -> None:
    """Task-assignment permission = any hierarchy level except the bottom
    rank (per product decision — "anyone with a tag other than associate,
    the lowest level")."""
    if current_user.primary_role == "super_admin":
        return
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if not membership or membership.status != "active":
        raise HTTPException(status_code=403, detail="You are not an active member of this club")
    if club_hierarchy_engine.is_bottom_level(db, membership):
        raise HTTPException(status_code=403, detail="Members at the base level cannot assign tasks")


def _require_club_faculty_coordinator_or_admin(db: Session, current_user: User, club_id: str) -> None:
    if current_user.primary_role == "super_admin":
        return
    if not faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, club_id):
        raise HTTPException(status_code=403, detail="You are not the assigned Faculty Coordinator for this club")


# Annual Plan approval workflow (Clubs PRD §24.3)
ANNUAL_PLAN_STAGE_PERMISSIONS = {
    "faculty_coordinator_review": "clubs:approve_plan_faculty_coordinator",
    "cultural_coordinator_review": "clubs:approve_plan_cultural_coordinator",
    "hod_review": "clubs:approve_plan_hod",
}
ANNUAL_PLAN_NEXT_STAGE = {
    "faculty_coordinator_review": "cultural_coordinator_review",
    "cultural_coordinator_review": "hod_review",
    "hod_review": "approved",
}


# 1. Club Profiles
@router.get("", response_model=List[ClubOut])
def get_clubs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return club_repo.get_multi(db)

@router.get("/my-memberships", response_model=List[MyClubOut])
def get_my_club_memberships(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every club this user can open a workspace for, and in what capacity.

    Three sources, unioned:
      1. active student memberships,
      2. faculty coordinator assignments — faculty_scope.get_club_coordinator_club_ids()
         has existed since Phase 7 with ZERO call sites repo-wide, which is
         precisely why a Faculty Coordinator's selector came back empty and he
         could never reach the club whose plan he was supposed to approve,
      3. department-wide reviewers (Cultural Coordinator, HOD), who oversee
         every club.

    Filtered in SQL rather than by post-filtering club_repo.get_multi(): that
    call was LIMIT 100 with no ORDER BY, so a user whose only membership was
    club #101 got an empty selector and no error at all.
    """
    def _with_relationship(clubs, relationship: str) -> List[MyClubOut]:
        return [
            MyClubOut(**ClubOut.model_validate(c).model_dump(), relationship=relationship)
            for c in clubs
        ]

    if current_user.primary_role == "super_admin":
        return _with_relationship(
            db.query(Club).order_by(Club.name).all(), "super_admin"
        )

    if _is_department_wide_reviewer(current_user):
        return _with_relationship(
            db.query(Club).order_by(Club.name).all(), "reviewer"
        )

    memberships = member_repo.get_student_memberships(db, student_id=current_user.id)
    member_club_ids = {m.club_id for m in memberships if m.status == "active"}
    coordinator_club_ids = set(
        faculty_scope.get_club_coordinator_club_ids(db, current_user.id)
    )

    club_ids = member_club_ids | coordinator_club_ids
    if not club_ids:
        return []

    clubs = db.query(Club).filter(Club.id.in_(club_ids)).order_by(Club.name).all()
    return [
        MyClubOut(
            **ClubOut.model_validate(c).model_dump(),
            # Membership wins when someone is somehow both: it is the strictly
            # more capable relationship.
            relationship="member" if c.id in member_club_ids else "faculty_coordinator",
        )
        for c in clubs
    ]


@router.get("/annual-plans/awaiting-my-review", response_model=List[AwaitingReviewPlanOut])
def list_plans_awaiting_my_review(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """The reviewer's inbox.

    MUST stay above the /{club_id} catch-all below, or "annual-plans" is
    matched as a club id and this route never runs.

    No route anywhere listed plans by status or by reviewer, so a reviewer's
    only route to a pending plan was to already know which club it was in and
    navigate there — which is the real reason BLK-01 was invisible. Nothing
    ever told the coordinator there was a plan waiting.
    """
    perms = get_resolved_permissions(current_user)
    is_admin = "*" in perms

    # Invert ANNUAL_PLAN_STAGE_PERMISSIONS: which statuses may THIS user act on?
    actionable_statuses = [
        status for status, permission in ANNUAL_PLAN_STAGE_PERMISSIONS.items()
        if is_admin or permission in perms
    ]
    if not actionable_statuses:
        return []

    query = (
        db.query(AnnualPlan, Club.name)
        .join(Club, Club.id == AnnualPlan.club_id)
        .filter(AnnualPlan.status.in_(actionable_statuses))
    )

    # The faculty-coordinator stage is club-scoped; the later stages are
    # department-wide. Scope in SQL so the inbox count is honest — a reviewer
    # must not see a row they will be refused on.
    if not is_admin:
        coordinator_club_ids = faculty_scope.get_club_coordinator_club_ids(db, current_user.id)
        query = query.filter(
            (AnnualPlan.status != "faculty_coordinator_review")
            | (AnnualPlan.club_id.in_(coordinator_club_ids) if coordinator_club_ids else False)
        )

    rows = query.order_by(AnnualPlan.academic_year.desc()).all()
    return [
        AwaitingReviewPlanOut(
            **AnnualPlanOut.model_validate(plan).model_dump(), club_name=club_name
        )
        for plan, club_name in rows
    ]

def _viewer_capabilities(db: Session, current_user: User, club_id: str) -> dict:
    def check(fn) -> bool:
        try:
            fn(db, current_user, club_id)
            return True
        except HTTPException:
            return False

    return {
        "viewer_can_edit_hierarchy": check(_require_club_faculty_coordinator_or_admin),
        "viewer_can_manage_settings": check(_require_club_head_or_admin),
        "viewer_can_assign_tasks": check(_require_task_assigner),
    }


# Which tabs each relationship may see.
#
# The server owns this, not the client. A Faculty Coordinator is not a member:
# they oversee the club, they do not draft its events or request its
# reimbursements. Rendering those tabs for them means rendering six buttons
# that the backend will 403 — the UI promising something the API refuses.
MEMBER_ONLY_TABS = frozenset({"recruitment", "reimbursements", "sponsorships"})

ALL_CLUB_TABS = [
    "dashboard", "members", "structure", "tasks", "recruitment", "events",
    "announcements", "budget", "reimbursements", "sponsorships", "annual-plan",
    "documents", "reports", "analytics", "settings",
]


def _club_capabilities(db: Session, current_user: User, club_id: str) -> ClubCapabilities:
    """Resolve all seven flags from ONE shared set of facts.

    This used to call the seven _require_* gates and catch their exceptions,
    which meant re-running the same membership and hierarchy lookups five and
    six times each — 25 queries to open a workspace, most of them identical.
    """
    facts = ClubViewerFacts(db, current_user, club_id)

    is_head = (
        facts.is_super_admin
        or (facts.is_faculty and "clubs:approve_plan" in facts.permissions)
        or (
            facts.is_active_member
            and (facts.is_top_rank or facts.membership.permission_template == "Club Head")
        )
    )

    can_read = (
        facts.is_super_admin
        or facts.is_active_member
        or facts.is_club_coordinator
        or facts.is_department_reviewer
    )

    return ClubCapabilities(
        can_read=can_read,
        can_write=facts.is_super_admin or facts.is_active_member,
        can_edit_hierarchy=facts.is_super_admin or facts.is_club_coordinator,
        can_manage_settings=is_head,
        can_assign_tasks=(
            facts.is_super_admin or (facts.is_active_member and not facts.is_bottom_rank)
        ),
        can_approve_plan=_can_approve_any_plan_stage(db, current_user, club_id),
        can_manage_members=is_head,
    )


def _can_approve_any_plan_stage(db: Session, current_user: User, club_id: str) -> bool:
    """Is this user the reviewer for THIS club's plan at its CURRENT stage?

    Not "do they hold an approver permission somewhere" — a coordinator of a
    different club holds the same permission string and must not see an
    approve button here.
    """
    perms = get_resolved_permissions(current_user)
    if "*" in perms:
        return True

    plans = annual_plan_repo.get_by_club(db, club_id=club_id)
    for plan in plans:
        required = ANNUAL_PLAN_STAGE_PERMISSIONS.get(plan.status)
        if not required or required not in perms:
            continue
        if plan.status == "faculty_coordinator_review":
            if not faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, club_id):
                continue
        return True
    return False


def _visible_tabs(relationship: str, caps: ClubCapabilities) -> List[str]:
    if relationship in ("member", "super_admin"):
        return list(ALL_CLUB_TABS)
    # Coordinators and department reviewers get everything they can actually
    # act on or audit, minus the member-only operational tabs.
    return [t for t in ALL_CLUB_TABS if t not in MEMBER_ONLY_TABS]


def _club_relationship(db: Session, current_user: User, club_id: str) -> str:
    if current_user.primary_role == "super_admin":
        return "super_admin"
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if membership and membership.status == "active":
        return "member"
    if faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, club_id):
        return "faculty_coordinator"
    return "reviewer"


@router.get("/{club_id}/bootstrap", response_model=ClubBootstrap)
def get_club_bootstrap(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Everything the Clubs workspace needs to render its shell, in one request.

    Mounting the workspace previously issued thirteen requests. Of those
    payloads exactly three are used by more than one tab — the club itself,
    the member roster and the hierarchy — so this returns those plus the
    resolved capabilities, the tab list and the counters that feed the
    dashboard tiles. Everything else stays a lazy per-tab fetch.

    counters exists so the dashboard can show "3 members, 2 events, Rs 15,000
    spent" without pulling five full lists to count their lengths.
    """
    _require_club_reader(db, current_user, club_id)

    club = club_repo.get(db, club_id)
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    relationship = _club_relationship(db, current_user, club_id)
    caps = _club_capabilities(db, current_user, club_id)

    members = member_repo.get_club_members(db, club_id=club_id)
    hierarchy = club_hierarchy_engine.ensure_default_hierarchy(db, club_id)
    budgets = db.query(Budget).filter(Budget.club_id == club_id).all()

    counters = ClubCounters(
        members=sum(1 for m in members if m.status == "active"),
        events=db.query(func.count(Event.id)).filter(Event.club_id == club_id).scalar() or 0,
        open_tasks=db.query(func.count(Task.id)).filter(
            Task.related_entity_type == "club",
            Task.related_entity_id == club_id,
            Task.status != "completed",
        ).scalar() or 0,
        pending_reimbursements=db.query(func.count(Reimbursement.id)).filter(
            Reimbursement.club_id == club_id, Reimbursement.status == "pending",
        ).scalar() or 0,
        budget_allocated=sum(b.allocated_amount or 0 for b in budgets),
        budget_spent=sum(b.spent_amount or 0 for b in budgets),
        plans_awaiting_me=sum(
            1 for p in annual_plan_repo.get_by_club(db, club_id=club_id)
            if p.status in ANNUAL_PLAN_STAGE_PERMISSIONS
        ) if caps.can_approve_plan else 0,
    )

    detail = ClubDetailOut(
        **ClubOut.model_validate(club).model_dump(),
        viewer_can_edit_hierarchy=caps.can_edit_hierarchy,
        viewer_can_manage_settings=caps.can_manage_settings,
        viewer_can_assign_tasks=caps.can_assign_tasks,
    )

    return ClubBootstrap(
        club=detail,
        relationship=relationship,
        capabilities=caps,
        visible_tabs=_visible_tabs(relationship, caps),
        counters=counters,
        hierarchy=hierarchy,
        members=members,
    )


@router.get("/{club_id}", response_model=ClubDetailOut)
def get_club(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    club = club_repo.get(db, club_id)
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    _require_club_reader(db, current_user, club_id)
    caps = _viewer_capabilities(db, current_user, club_id)
    return ClubDetailOut(**ClubOut.model_validate(club).model_dump(), **caps)

# 2. Members
@router.get("/{club_id}/members", response_model=List[ClubMemberOut])
def get_club_members(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return member_repo.get_club_members(db, club_id=club_id)

# 3. Events
@router.get("/{club_id}/events", response_model=List[EventOut])
def get_club_events(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return db.query(event_repo.model).filter(event_repo.model.club_id == club_id).all()

@router.post("/{club_id}/events", response_model=EventOut)
def create_club_event(
    club_id: str,
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["events:create"]))
):
    _require_active_club_member(db, current_user, club_id)
    event_dict = event_in.dict()
    event_dict["id"] = f"evt_{uuid.uuid4().hex[:12]}"
    event_dict["club_id"] = club_id
    created = event_repo.create(db, obj_in=event_dict)

    # Cross-module regression fix (Phase 7): event proposals used to be
    # created with zero signal to anyone who needed to act on them. Scoped
    # to THIS club's assigned coordinator(s) — a global tag scan used to
    # notify every Club Faculty Coordinator system-wide, regardless of club.
    club = club_repo.get(db, club_id)
    for assignment in faculty_assignment_repo.get_active_by_club_and_tag(
        db, club_id=club_id, role_tag=faculty_scope.CLUB_FACULTY_COORDINATOR
    ):
        notification_engine.send_notification(
            db, user_id=assignment.faculty_id, title="New event proposal",
            content=f"{club.name if club else club_id} proposed a new event: {created.title}.",
            source_module="clubs", entity_type="club", entity_id=club_id,
            # The coordinator has to approve this before the event can run.
            email_recipient=True,
        )
    return created

# 4. Budget
@router.get("/{club_id}/budgets", response_model=List[BudgetOut])
def get_club_budgets(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return db.query(budget_repo.model).filter(budget_repo.model.club_id == club_id).all()

# 5. Reimbursement
@router.get("/{club_id}/reimbursements", response_model=List[ReimbursementOut])
def get_club_reimbursements(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return reimbursement_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/reimbursements", response_model=ReimbursementOut)
def request_reimbursement(
    club_id: str,
    reimb_in: ReimbursementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["reimbursement:request"]))
):
    _require_active_club_member(db, current_user, club_id)
    reimb_dict = reimb_in.dict()
    reimb_dict["id"] = f"reimb_{uuid.uuid4().hex[:12]}"
    reimb_dict["club_id"] = club_id
    reimb_dict["requested_by"] = current_user.id
    reimb_dict["status"] = "pending"
    return reimbursement_repo.create(db, obj_in=reimb_dict)

# 6. Sponsorship
@router.get("/{club_id}/sponsorships", response_model=List[SponsorshipOut])
def get_club_sponsorships(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return sponsorship_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/sponsorships", response_model=SponsorshipOut)
def create_sponsorship(
    club_id: str,
    spons_in: SponsorshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["sponsorship:manage"]))
):
    _require_active_club_member(db, current_user, club_id)
    spons_dict = spons_in.dict()
    spons_dict["id"] = f"spons_{uuid.uuid4().hex[:12]}"
    spons_dict["club_id"] = club_id
    return sponsorship_repo.create(db, obj_in=spons_dict)

# 7. Reports Engine — club performance report (one of the 7 v1 report types
# named in the Clubs PRD; the other 6 are new Phase 4 build-out, not just
# wiring, since the engine only implements this one today).
@router.get("/{club_id}/reports/performance")
def get_club_performance_report(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_club_performance_report(db, club_id=club_id)

# 8. Recruitment (Phase 4 — new; PRD: "replaces Google Forms" for recruitment)
@router.get("/{club_id}/recruitment-drives", response_model=List[RecruitmentDriveOut])
def get_recruitment_drives(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Recruitment drives for a club.

    Deliberately the one club read that is not fully gated: recruitment only
    works if people outside the club can see that it is happening. Non-readers
    get the OPEN drives only — a draft or closed drive, and the internal
    fields the club uses to run it, stay inside the club.
    """
    drives = recruitment_drive_repo.get_by_club(db, club_id=club_id)
    try:
        _require_club_reader(db, current_user, club_id)
    except HTTPException:
        return [d for d in drives if d.status == "open"]
    return drives

@router.post("/{club_id}/recruitment-drives", response_model=RecruitmentDriveOut)
def create_recruitment_drive(
    club_id: str, drive_in: RecruitmentDriveCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _require_active_club_member(db, current_user, club_id)
    drive_dict = drive_in.dict()
    drive_dict["id"] = f"drive_{uuid.uuid4().hex[:12]}"
    drive_dict["club_id"] = club_id
    return recruitment_drive_repo.create(db, obj_in=drive_dict)

@router.post("/recruitment-drives/{drive_id}/apply", response_model=RecruitmentApplicationOut)
def apply_to_recruitment_drive(
    drive_id: str, app_in: RecruitmentApplicationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    drive = recruitment_drive_repo.get(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Recruitment drive not found")
    if drive.status != "open":
        raise HTTPException(status_code=400, detail="This recruitment drive is not currently accepting applications")
    app_dict = app_in.dict()
    app_dict["id"] = f"rapp_{uuid.uuid4().hex[:12]}"
    app_dict["drive_id"] = drive_id
    app_dict["applicant_id"] = current_user.id
    app_dict["status"] = "applied"
    return recruitment_application_repo.create(db, obj_in=app_dict)

@router.get("/recruitment-drives/{drive_id}/applications", response_model=List[RecruitmentApplicationOut])
def list_recruitment_applications(
    drive_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    drive = recruitment_drive_repo.get(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Recruitment drive not found")
    _require_club_reader(db, current_user, drive.club_id)
    return recruitment_application_repo.get_by_drive(db, drive_id=drive_id)

@router.put("/recruitment-applications/{application_id}", response_model=RecruitmentApplicationOut)
def update_recruitment_application_status(
    application_id: str, update_in: RecruitmentApplicationUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    application = recruitment_application_repo.get(db, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    drive = recruitment_drive_repo.get(db, application.drive_id)
    _require_active_club_member(db, current_user, drive.club_id)
    return recruitment_application_repo.update(db, db_obj=application, obj_in=update_in.model_dump(exclude_unset=True))

# 9. Announcements (Phase 4 — new)
@router.get("/{club_id}/announcements", response_model=List[AnnouncementOut])
def get_club_announcements(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return announcement_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/announcements", response_model=AnnouncementOut)
def create_club_announcement(
    club_id: str, ann_in: AnnouncementCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _require_active_club_member(db, current_user, club_id)
    ann_dict = ann_in.dict()
    ann_dict["id"] = f"ann_{uuid.uuid4().hex[:12]}"
    ann_dict["club_id"] = club_id
    ann_dict["author_id"] = current_user.id
    return announcement_repo.create(db, obj_in=ann_dict)


# 10. Annual Planning Workspace (Clubs PRD §24) — new in Phase 4 remainder
@router.get("/{club_id}/annual-plans", response_model=List[AnnualPlanOut])
def list_annual_plans(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return annual_plan_repo.get_by_club(db, club_id=club_id)


@router.post("/{club_id}/annual-plans", response_model=AnnualPlanOut)
def create_annual_plan(
    club_id: str,
    plan_in: AnnualPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["annual_plan:manage"])),
):
    _require_active_club_member(db, current_user, club_id)
    existing = annual_plan_repo.get_current(db, club_id=club_id, academic_year=plan_in.academic_year)
    if existing:
        raise HTTPException(status_code=400, detail="An annual plan already exists for this academic year")
    plan_dict = plan_in.dict()
    plan_dict["id"] = f"aplan_{uuid.uuid4().hex[:12]}"
    plan_dict["club_id"] = club_id
    plan_dict["submitted_by"] = current_user.id
    plan_dict["status"] = "draft"
    return annual_plan_repo.create(db, obj_in=plan_dict)


@router.put("/annual-plans/{plan_id}", response_model=AnnualPlanOut)
def update_annual_plan(
    plan_id: str,
    plan_in: AnnualPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["annual_plan:manage"])),
):
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    if plan.status != "draft":
        raise HTTPException(status_code=400, detail="Only a Draft annual plan may be edited")
    _require_active_club_member(db, current_user, plan.club_id)
    return annual_plan_repo.update(db, db_obj=plan, obj_in=plan_in.model_dump(exclude_unset=True))


def _notify_club_leadership(db: Session, *, club_id: str, title: str, content: str) -> None:
    club_hierarchy_engine.notify_club_leadership(db, club_id=club_id, title=title, content=content)


def _notify_plan_reviewers(db: Session, *, plan, stage: str) -> None:
    """Tell the people who must ACT on a plan that it is now theirs.

    Nothing did this. Submitting a plan notified the CLUB — the people who had
    just submitted it — and the reviewer was told nothing at all. That is the
    root cause the field audit found behind BLK-01: the Faculty Coordinator's
    problem was never that he could not navigate to the plan, it was that
    nothing ever told him it existed.

    Scoped the same way the review endpoint authorizes, so nobody is emailed
    about a plan they would be refused on.
    """
    required = ANNUAL_PLAN_STAGE_PERMISSIONS.get(stage)
    if not required:
        return

    club = club_repo.get(db, plan.club_id)
    club_name = club.name if club else plan.club_id

    if stage == "faculty_coordinator_review":
        # One specific person: the club's assigned coordinator.
        assignments = faculty_assignment_repo.get_active_by_club_and_tag(
            db, club_id=plan.club_id, role_tag=faculty_scope.CLUB_FACULTY_COORDINATOR,
        )
        recipient_ids = [a.faculty_id for a in assignments]
    else:
        # Department-wide stages: everyone holding the stage's permission.
        recipient_ids = [
            u.id for u in db.query(User).filter(User.primary_role == "faculty").all()
            if required in get_resolved_permissions(u)
        ]

    for user_id in dict.fromkeys(recipient_ids):
        notification_engine.send_notification(
            db, user_id=user_id,
            title=f"{club_name} annual plan needs your approval",
            content=(
                f"The {plan.academic_year} annual plan for {club_name} has reached "
                f"{stage.replace('_', ' ')} and is waiting on you."
            ),
            source_module="clubs",
            entity_type="annual_plan",
            entity_id=plan.id,
            email_recipient=True,
        )


@router.post("/annual-plans/{plan_id}/submit", response_model=AnnualPlanOut)
def submit_annual_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["annual_plan:manage"])),
):
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    if plan.status != "draft":
        raise HTTPException(status_code=400, detail="Only a Draft annual plan may be submitted for review")
    _require_active_club_member(db, current_user, plan.club_id)
    updated = annual_plan_repo.update(db, db_obj=plan, obj_in={
        "status": "faculty_coordinator_review", "review_comments": None,
    })
    _notify_club_leadership(
        db, club_id=plan.club_id, title="Annual Plan submitted for review",
        content="The annual plan has moved to Faculty Coordinator review.",
    )
    _notify_plan_reviewers(db, plan=updated, stage="faculty_coordinator_review")
    return updated


@router.post("/annual-plans/{plan_id}/review", response_model=AnnualPlanOut)
def review_annual_plan(
    plan_id: str,
    review_in: AnnualPlanReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Advances or rejects an Annual Plan at whichever review stage it's
    currently sitting in. Which permission is required depends on the
    CURRENT stage (Draft -> Faculty Coordinator -> Cultural Coordinator ->
    HOD -> Approved), matching Clubs PRD §24.3 exactly rather than gating
    every stage behind one shared "approver" permission.
    """
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    required_permission = ANNUAL_PLAN_STAGE_PERMISSIONS.get(plan.status)
    if not required_permission:
        raise HTTPException(status_code=400, detail=f"Annual plan in status '{plan.status}' is not awaiting review")

    perms = get_resolved_permissions(current_user)
    if "*" not in perms and required_permission not in perms:
        raise HTTPException(status_code=403, detail=f"Not enough permissions. Missing: {required_permission}")

    # A Faculty Coordinator is scoped to one specific club — without this
    # check, a coordinator of ANY club could approve/reject THIS club's
    # plan just by holding the global tag. Cultural Coordinator/HOD stages
    # stay unscoped (department/college-wide), matching current behavior.
    if plan.status == "faculty_coordinator_review" and "*" not in perms:
        if not faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, plan.club_id):
            raise HTTPException(status_code=403, detail="You are not the assigned Faculty Coordinator for this club")

    if review_in.action == "reject":
        updated = annual_plan_repo.update(db, db_obj=plan, obj_in={
            "status": "draft", "review_comments": review_in.comments,
        })
        _notify_club_leadership(
            db, club_id=plan.club_id, title="Annual Plan returned to Draft",
            content=review_in.comments or "The annual plan was returned for revisions.",
        )
        return updated

    if review_in.action != "approve":
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    next_stage = ANNUAL_PLAN_NEXT_STAGE[plan.status]
    updated = annual_plan_repo.update(db, db_obj=plan, obj_in={
        "status": next_stage, "review_comments": review_in.comments,
    })
    _notify_club_leadership(
        db, club_id=plan.club_id, title=f"Annual Plan advanced to {next_stage.replace('_', ' ').title()}",
        content=review_in.comments or "The annual plan moved to the next review stage.",
    )
    # The NEXT reviewer has to be told too, or the plan simply stops here.
    _notify_plan_reviewers(db, plan=updated, stage=next_stage)
    return updated


@router.post("/annual-plans/{plan_id}/lock", response_model=AnnualPlanOut)
def lock_annual_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["clubs:approve_plan_hod"])),
):
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    if plan.status != "approved":
        raise HTTPException(status_code=400, detail="Only an Approved annual plan may be locked")
    return annual_plan_repo.update(db, db_obj=plan, obj_in={"status": "locked"})


# 11. Documents Workspace + tag-filtered Knowledge Base (Clubs PRD §28-29) — new
@router.get("/{club_id}/documents", response_model=List[ClubDocumentOut])
def list_club_documents(
    club_id: str, category: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return club_document_repo.get_by_club(db, club_id=club_id, category=category)


@router.get("/{club_id}/knowledge-base", response_model=List[ClubDocumentOut])
def get_club_knowledge_base(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """
    Minimal Knowledge Base (Clubs PRD §29): a tag-filtered view over the
    same Documents Workspace records — any document tagged
    "knowledge-base" surfaces here, rather than a separate content store.
    """
    _require_club_reader(db, current_user, club_id)
    return club_document_repo.get_knowledge_base(db, club_id=club_id)


@router.post("/{club_id}/documents", response_model=ClubDocumentOut)
async def upload_club_document(
    club_id: str,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    category: str = Form("Templates"),
    tags: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["documents:manage_club"])),
):
    _require_active_club_member(db, current_user, club_id)
    stored_path = await storage_engine.upload_file(file, folder=f"club_documents/{club_id}")
    doc_dict = {
        "id": f"cdoc_{uuid.uuid4().hex[:12]}",
        "club_id": club_id,
        "uploaded_by": current_user.id,
        "name": name or file.filename or "Untitled",
        "file_url": stored_path,
        "category": category,
        "tags": tags,
        "version": "1",
        "previous_version_id": None,
    }
    return club_document_repo.create(db, obj_in=doc_dict)


@router.post("/documents/{document_id}/new-version", response_model=ClubDocumentOut)
async def upload_new_document_version(
    document_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["documents:manage_club"])),
):
    previous = club_document_repo.get(db, document_id)
    if not previous:
        raise HTTPException(status_code=404, detail="Document not found")
    _require_active_club_member(db, current_user, previous.club_id)
    stored_path = await storage_engine.upload_file(file, folder=f"club_documents/{previous.club_id}")
    doc_dict = {
        "id": f"cdoc_{uuid.uuid4().hex[:12]}",
        "club_id": previous.club_id,
        "uploaded_by": current_user.id,
        "name": previous.name,
        "file_url": stored_path,
        "category": previous.category,
        "tags": previous.tags,
        "version": str(int(previous.version) + 1),
        "previous_version_id": previous.id,
    }
    return club_document_repo.create(db, obj_in=doc_dict)


@router.get("/documents/{document_id}/versions", response_model=List[ClubDocumentOut])
def get_document_versions(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    doc = club_document_repo.get(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _require_club_reader(db, current_user, doc.club_id)
    return club_document_repo.get_versions(db, document_id=document_id)


@router.get("/documents/{document_id}/download-url")
def get_club_document_download_url(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    doc = club_document_repo.get(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _require_club_reader(db, current_user, doc.club_id)
    return {"url": storage_engine.get_signed_url(doc.file_url)}


# 12. Event Attendance — backs the Attendance Report (Clubs PRD §47.2)
@router.post("/{club_id}/events/{event_id}/attendance")
def mark_event_attendance(
    club_id: str,
    event_id: str,
    records: List[EventAttendanceRecord],
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["events:create"])),
):
    """Record who attended an event.

    UPSERT, not insert. This used to create a new row unconditionally, so
    correcting one student's attendance — or simply saving the register twice —
    left two contradictory rows for the same person. Both fed the attendance
    analytics and the attendance report, which are the two shipped features
    that depend on this data, so the numbers drifted the first time anyone
    edited a register.
    """
    _require_active_club_member(db, current_user, club_id)

    event = event_repo.get(db, event_id)
    if not event or event.club_id != club_id:
        raise HTTPException(status_code=404, detail="Event not found")

    # Only actual members of the club can be marked as attending its event.
    member_ids = {
        m.student_id for m in member_repo.get_club_members(db, club_id=club_id)
        if m.status == "active"
    }
    unknown = {r.student_id for r in records} - member_ids
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"Not active members of this club: {', '.join(sorted(unknown))}",
        )

    existing = {
        row.student_id: row
        for row in db.query(EventAttendance).filter(EventAttendance.event_id == event_id).all()
    }

    updated = 0
    created = 0
    for record in records:
        row = existing.get(record.student_id)
        if row is not None:
            if row.attended != record.attended:
                row.attended = record.attended
                db.add(row)
                updated += 1
            continue
        db.add(EventAttendance(
            id=f"att_{uuid.uuid4().hex[:12]}",
            event_id=event_id,
            student_id=record.student_id,
            attended=record.attended,
        ))
        created += 1

    db.commit()
    return {"created": created, "updated": updated, "total": len(records)}


@router.get("/{club_id}/events/{event_id}/attendance", response_model=List[EventAttendanceOut])
def get_event_attendance(
    club_id: str, event_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    # The club_id in the path was never checked against the event's own club,
    # so a member of club A could read club B's attendance simply by putting
    # their own club_id in front of B's event_id and sailing past the gate.
    event = event_repo.get(db, event_id)
    if not event or event.club_id != club_id:
        raise HTTPException(status_code=404, detail="Event not found")

    # Names, not just ids — a register of opaque student ids is unusable, and
    # the client should not have to fetch the roster to caption it.
    names = {
        m.student_id: m.student_name
        for m in member_repo.get_club_members(db, club_id=club_id)
    }
    return [
        EventAttendanceOut(
            student_id=r.student_id,
            student_name=names.get(r.student_id),
            attended=r.attended,
        )
        for r in event_attendance_repo.get_by_event(db, event_id=event_id)
    ]


# 13. Reports Engine — the remaining 6 of 7 v1 report types (Clubs PRD §47.2)
@router.get("/{club_id}/reports/monthly")
def get_monthly_club_report(
    club_id: str, month: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_monthly_club_report(db, club_id=club_id, month=month)


@router.get("/{club_id}/reports/annual")
def get_annual_club_report(
    club_id: str, academic_year: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_annual_club_report(db, club_id=club_id, academic_year=academic_year)


@router.get("/{club_id}/reports/budget-summary")
def get_budget_summary_report(
    club_id: str, academic_year: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_budget_summary_report(db, club_id=club_id, academic_year=academic_year)


@router.get("/{club_id}/reports/sponsorship-summary")
def get_sponsorship_summary_report(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_sponsorship_summary_report(db, club_id=club_id)


@router.get("/{club_id}/reports/attendance")
def get_club_attendance_report(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_attendance_report(db, club_id=club_id)


@router.get("/{club_id}/reports/contribution")
def get_contribution_report(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_contribution_report(db, club_id=club_id)


# 14. Analytics Workspace — 9 widgets in PRD §48.2 priority order
@router.get("/{club_id}/analytics")
def get_club_analytics(
    club_id: str, academic_year: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_club_reader(db, current_user, club_id)
    return reporting_engine.generate_club_analytics(db, club_id=club_id, academic_year=academic_year)


# 15. Club Settings — permission template assignment (Clubs PRD §17)
@router.put("/{club_id}/members/{member_id}/permission-template", response_model=ClubMemberOut)
def assign_permission_template(
    club_id: str,
    member_id: str,
    assignment: PermissionTemplateAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_head_or_admin(db, current_user, club_id)
    member = member_repo.get(db, member_id)
    if not member or member.club_id != club_id:
        raise HTTPException(status_code=404, detail="Club member not found")
    valid_templates = {
        "Club Head", "Documentation Head", "Events Head", "Sponsorship Head", "Finance Head", None,
    }
    if assignment.permission_template not in valid_templates:
        raise HTTPException(status_code=400, detail="Invalid permission template")
    updated = member_repo.update(db, db_obj=member, obj_in={"permission_template": assignment.permission_template})
    notification_engine.send_notification(
        db, user_id=member.student_id, title="Club permission template updated",
        content=f"You have been assigned the '{assignment.permission_template or 'Member'}' permission template.",
        source_module="clubs", entity_type="club", entity_id=club_id,
    )
    return updated


# 16. Club Settings — official contact email (no endpoint updated any Club
# field before this; Club.contact_email already existed in the schema but
# had no write path or UI).
@router.put("/{club_id}/settings", response_model=ClubDetailOut)
def update_club_settings(
    club_id: str,
    settings_in: ClubSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_head_or_admin(db, current_user, club_id)
    club = club_repo.get(db, club_id)
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    updated = club_repo.update(db, db_obj=club, obj_in=settings_in.model_dump(exclude_unset=True))
    # Returns the DETAIL shape, matching GET /clubs/{id}. Returning the
    # narrower ClubOut meant the viewer_can_* capability flags vanished from
    # client state the moment anyone saved settings.
    caps = _viewer_capabilities(db, current_user, club_id)
    return ClubDetailOut(**ClubOut.model_validate(updated).model_dump(), **caps)


# 17. Configurable Club Hierarchy (org-chart / structure)
@router.get("/{club_id}/hierarchy", response_model=List[ClubHierarchyLevelOut])
def get_club_hierarchy(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return club_hierarchy_engine.ensure_default_hierarchy(db, club_id)


@router.post("/{club_id}/hierarchy/levels", response_model=ClubHierarchyLevelOut)
def create_hierarchy_level(
    club_id: str,
    level_in: ClubHierarchyLevelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_faculty_coordinator_or_admin(db, current_user, club_id)
    level = ClubHierarchyLevel(
        id=f"chl_{uuid.uuid4().hex[:12]}", club_id=club_id,
        level_order=level_in.level_order, title=level_in.title,
    )
    db.add(level)
    db.commit()
    db.refresh(level)
    return level


@router.put("/{club_id}/hierarchy/levels/{level_id}", response_model=ClubHierarchyLevelOut)
def update_hierarchy_level(
    club_id: str,
    level_id: str,
    level_in: ClubHierarchyLevelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_faculty_coordinator_or_admin(db, current_user, club_id)
    level = db.query(ClubHierarchyLevel).filter(
        ClubHierarchyLevel.id == level_id, ClubHierarchyLevel.club_id == club_id
    ).first()
    if not level:
        raise HTTPException(status_code=404, detail="Hierarchy level not found")
    update_data = level_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(level, field, value)
    db.add(level)
    if "title" in update_data:
        # Cascade the rename to every member's denormalized display `.role`
        # cache so it never goes stale.
        for member in member_repo.get_club_members(db, club_id=club_id):
            if member.hierarchy_level_id == level_id:
                member.role = update_data["title"]
                db.add(member)
    db.commit()
    db.refresh(level)
    return level


@router.delete("/{club_id}/hierarchy/levels/{level_id}")
def delete_hierarchy_level(
    club_id: str,
    level_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_faculty_coordinator_or_admin(db, current_user, club_id)
    level = db.query(ClubHierarchyLevel).filter(
        ClubHierarchyLevel.id == level_id, ClubHierarchyLevel.club_id == club_id
    ).first()
    if not level:
        raise HTTPException(status_code=404, detail="Hierarchy level not found")
    still_assigned = any(
        m.hierarchy_level_id == level_id for m in member_repo.get_club_members(db, club_id=club_id)
    )
    if still_assigned:
        raise HTTPException(status_code=400, detail="Reassign members off this position before deleting it")
    db.delete(level)
    db.commit()
    return {"status": "success"}


@router.put("/{club_id}/members/{member_id}/hierarchy-level", response_model=ClubMemberOut)
def assign_member_hierarchy_level(
    club_id: str,
    member_id: str,
    assignment: ClubHierarchyMemberAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_head_or_admin(db, current_user, club_id)
    member = member_repo.get(db, member_id)
    if not member or member.club_id != club_id:
        raise HTTPException(status_code=404, detail="Club member not found")
    level = db.query(ClubHierarchyLevel).filter(
        ClubHierarchyLevel.id == assignment.hierarchy_level_id, ClubHierarchyLevel.club_id == club_id
    ).first()
    if not level:
        raise HTTPException(status_code=404, detail="Hierarchy level not found")
    updated = member_repo.update(db, db_obj=member, obj_in={
        "hierarchy_level_id": level.id, "role": level.title,
    })
    return updated


# 18. Club Task Manager — thin wrapper over the existing, already-built
# TaskEngine/Task model (source_module="clubs"); this is also what makes
# the Contribution Report (already querying source_module=="clubs") start
# populating instead of being silently empty.
@router.get("/{club_id}/tasks", response_model=List[TaskOut])
def get_club_tasks(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_club_reader(db, current_user, club_id)
    return task_repo.get_by_related_entity(db, related_entity_type="club", related_entity_id=club_id)


@router.post("/{club_id}/tasks", response_model=TaskOut)
def create_club_task(
    club_id: str,
    task_in: ClubTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_task_assigner(db, current_user, club_id)
    assignee_membership = member_repo.get_by_student_and_club(db, student_id=task_in.assignee_id, club_id=club_id)
    if not assignee_membership or assignee_membership.status != "active":
        raise HTTPException(status_code=400, detail="Assignee must be an active member of this club")
    return task_engine.create_task(
        db, title=task_in.title, description=task_in.description, due_date=task_in.due_date,
        priority=task_in.priority, assignee_id=task_in.assignee_id, creator_id=current_user.id,
        source_module="clubs", related_entity_type="club", related_entity_id=club_id,
    )


@router.post("/{club_id}/tasks/{task_id}/review", response_model=TaskOut)
def review_club_task(
    club_id: str,
    task_id: str,
    review_in: ClubTaskReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Officer validation gate — prevents an assignee from unilaterally
    marking their own work complete, since that number feeds the
    Contribution Report/Leaderboard. Assignee marks pending_review via the
    existing generic PUT /tasks/{id}; only a non-bottom-rank member (or the
    task's creator) may approve/reject it here."""
    _require_task_assigner(db, current_user, club_id)
    task = db.query(Task).filter(
        Task.id == task_id, Task.related_entity_type == "club", Task.related_entity_id == club_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "pending_review":
        raise HTTPException(status_code=400, detail="This task is not awaiting review")
    if review_in.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    task.status = "completed" if review_in.action == "approve" else "in_progress"
    db.add(task)
    db.commit()
    db.refresh(task)
    notification_engine.send_notification(
        db, user_id=task.assignee_id,
        title=f"Task {'approved' if review_in.action == 'approve' else 'sent back'}",
        content=review_in.comments or f"Your task '{task.title}' was {task.status}.",
        source_module="clubs", task_id=task.id, entity_type="task", entity_id=task.id,
    )
    return task
