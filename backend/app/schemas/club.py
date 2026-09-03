from typing import List, Literal, Optional
from pydantic import BaseModel, Field

class ClubBase(BaseModel):
    name: str
    category: str
    # On ClubBase rather than ClubOut deliberately: it then flows through
    # ClubOut, ClubDetailOut, GET /clubs and my-memberships alike. The column
    # existed and was populated the whole time; only the schema omitted it,
    # so the club header rendered a broken image on every tab, 100% of the
    # time, against the real backend. The dev mock supplied `logo`, which is
    # exactly why nobody caught it.
    logo: Optional[str] = None
    description: Optional[str] = None
    brand_colors: Optional[str] = "#000000"
    contact_email: Optional[str] = None
    status: Optional[str] = "active"

class ClubCreate(ClubBase):
    pass

class ClubOut(ClubBase):
    id: str

    class Config:
        from_attributes = True

class MyClubOut(ClubOut):
    """A club in the user's own selector, plus WHY it is there.

    The relationship drives the UI: a faculty_coordinator is not a member and
    must not be shown member-only tabs or write actions, and a department-wide
    reviewer is looking at a club they oversee rather than one they belong to.
    Without this the selector could only say "here are some clubs".
    """
    relationship: str  # member | faculty_coordinator | reviewer | super_admin


class ClubMemberOut(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    club_id: str
    role: str
    status: str
    academic_year: str
    join_date: Optional[str] = None
    permission_template: Optional[str] = None
    hierarchy_level_id: Optional[str] = None

    class Config:
        from_attributes = True


class PermissionTemplateAssign(BaseModel):
    # Club Head, Documentation Head, Events Head, Sponsorship Head, Finance Head, or null to clear
    permission_template: Optional[str] = None

class ClubDetailOut(ClubOut):
    """Returned only by GET /clubs/{club_id} — per-viewer capability flags,
    computed server-side so the frontend never has to re-derive hierarchy/
    scope logic itself."""
    viewer_can_edit_hierarchy: bool = False
    viewer_can_manage_settings: bool = False
    viewer_can_assign_tasks: bool = False

class ClubCapabilities(BaseModel):
    """Everything the viewer is allowed to DO in this club, resolved server-side.

    Generalizes the three viewer_can_* flags on ClubDetailOut into the full
    set. The frontend must never re-derive scope logic — that is how the UI
    ends up rendering six buttons the backend will refuse.
    """
    can_read: bool = False
    can_write: bool = False              # active member: create events, plans, requests
    can_edit_hierarchy: bool = False     # the club's assigned Faculty Coordinator
    can_manage_settings: bool = False    # club head
    can_assign_tasks: bool = False
    can_approve_plan: bool = False       # a reviewer at the plan's current stage
    can_manage_members: bool = False


class ClubCounters(BaseModel):
    """Dashboard tile numbers, so the shell does not fetch five lists to count them."""
    members: int = 0
    events: int = 0
    open_tasks: int = 0
    pending_reimbursements: int = 0
    budget_allocated: float = 0.0
    budget_spent: float = 0.0
    plans_awaiting_me: int = 0


class ClubBootstrap(BaseModel):
    """One request per workspace mount.

    Mounting the Clubs workspace used to issue THIRTEEN requests. Of those
    payloads exactly three are needed by more than one tab, so the right shape
    is a small composed shell plus a lazy fetch per tab — not one mega-endpoint
    that re-sends everything.

    visible_tabs is the important field: the server decides what a coordinator
    versus a member may see, which is what stops the UI offering actions the
    backend will 403.
    """
    club: ClubDetailOut
    relationship: str
    capabilities: ClubCapabilities
    visible_tabs: List[str]
    counters: ClubCounters
    hierarchy: List["ClubHierarchyLevelOut"] = []
    members: List["ClubMemberOut"] = []


class EventAttendanceRecord(BaseModel):
    """One student's attendance at one event.

    A real model, not List[dict]: the endpoint indexed r["student_id"]
    directly, so a malformed record was a 500 rather than a 422 naming the
    field.
    """
    student_id: str = Field(min_length=1)
    attended: Literal["present", "absent"] = "present"


class EventAttendanceOut(BaseModel):
    student_id: str
    student_name: Optional[str] = None
    attended: str


class ClubSettingsUpdate(BaseModel):
    contact_email: Optional[str] = None

class ClubHierarchyLevelBase(BaseModel):
    level_order: int
    title: str

class ClubHierarchyLevelCreate(ClubHierarchyLevelBase):
    pass

class ClubHierarchyLevelUpdate(BaseModel):
    level_order: Optional[int] = None
    title: Optional[str] = None

class ClubHierarchyLevelOut(ClubHierarchyLevelBase):
    id: str
    club_id: str

    class Config:
        from_attributes = True

class ClubHierarchyMemberAssign(BaseModel):
    hierarchy_level_id: str

class ClubTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: str
    priority: str = "medium"
    assignee_id: str

class ClubTaskReviewAction(BaseModel):
    action: str  # approve, reject
    comments: Optional[str] = None

class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    date: str
    venue: str
    budget: float = 0.0
    status: Optional[str] = "draft"

class EventCreate(EventBase):
    club_id: str

class EventOut(EventBase):
    id: str
    club_id: str

    class Config:
        from_attributes = True

class BudgetBase(BaseModel):
    academic_year: str
    allocated_amount: float
    spent_amount: float = 0.0

class BudgetOut(BudgetBase):
    id: str
    club_id: str

    class Config:
        from_attributes = True

class ReimbursementBase(BaseModel):
    amount: float
    receipt_url: Optional[str] = None

class ReimbursementCreate(ReimbursementBase):
    club_id: str
    event_id: Optional[str] = None

class ReimbursementOut(ReimbursementBase):
    id: str
    club_id: str
    requested_by: str
    status: str

    class Config:
        from_attributes = True

class SponsorshipBase(BaseModel):
    sponsor_name: str
    amount: float
    status: str
    contract_url: Optional[str] = None

class SponsorshipCreate(SponsorshipBase):
    club_id: str

class SponsorshipOut(SponsorshipBase):
    id: str
    club_id: str

    class Config:
        from_attributes = True

class RecruitmentDriveBase(BaseModel):
    title: str
    recruitment_period: str
    eligibility: Optional[str] = None
    positions_available: Optional[str] = None
    status: Optional[str] = "open"

class RecruitmentDriveCreate(RecruitmentDriveBase):
    club_id: str

class RecruitmentDriveOut(RecruitmentDriveBase):
    id: str
    club_id: str

    class Config:
        from_attributes = True

class RecruitmentApplicationBase(BaseModel):
    motivation_statement: Optional[str] = None

class RecruitmentApplicationCreate(RecruitmentApplicationBase):
    pass

class RecruitmentApplicationUpdate(BaseModel):
    status: str  # Applied, Shortlisted, Interview Scheduled, Interview Completed, Selected, Rejected, Joined

class RecruitmentApplicationOut(RecruitmentApplicationBase):
    id: str
    drive_id: str
    applicant_id: str
    status: str

    class Config:
        from_attributes = True

class AnnouncementBase(BaseModel):
    title: str
    body: str
    announcement_type: str = "general"

class AnnouncementCreate(AnnouncementBase):
    club_id: str

class AnnouncementOut(AnnouncementBase):
    id: str
    club_id: str
    author_id: str

    class Config:
        from_attributes = True


class AnnualPlanBase(BaseModel):
    academic_year: str
    vision: Optional[str] = None
    objectives: Optional[str] = None
    major_initiatives: Optional[str] = None
    tentative_event_calendar: Optional[str] = None
    budget_allocation: float = 0.0
    expected_outcomes: Optional[str] = None
    strategic_priorities: Optional[str] = None
    key_deadlines: Optional[str] = None

class AnnualPlanCreate(AnnualPlanBase):
    pass

class AnnualPlanUpdate(BaseModel):
    vision: Optional[str] = None
    objectives: Optional[str] = None
    major_initiatives: Optional[str] = None
    tentative_event_calendar: Optional[str] = None
    budget_allocation: Optional[float] = None
    expected_outcomes: Optional[str] = None
    strategic_priorities: Optional[str] = None
    key_deadlines: Optional[str] = None

class AnnualPlanReviewAction(BaseModel):
    action: str  # "approve" or "reject"
    comments: Optional[str] = None

class AnnualPlanOut(AnnualPlanBase):
    id: str
    club_id: str
    status: str
    review_comments: Optional[str] = None
    submitted_by: str

    class Config:
        from_attributes = True


class AwaitingReviewPlanOut(AnnualPlanOut):
    """One row of a reviewer's inbox.

    Carries club_name so the inbox renders without a second fetch per row.
    """
    club_name: str = ""


class ClubDocumentOut(BaseModel):
    id: str
    club_id: str
    uploaded_by: str
    name: str
    file_url: str
    category: str
    tags: str
    version: str
    previous_version_id: Optional[str] = None

    class Config:
        from_attributes = True


# ClubBootstrap forward-references ClubHierarchyLevelOut and ClubMemberOut,
# both defined below it in this module.
ClubBootstrap.model_rebuild()
