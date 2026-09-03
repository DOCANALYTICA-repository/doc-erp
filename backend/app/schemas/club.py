from typing import List, Optional
from pydantic import BaseModel

class ClubBase(BaseModel):
    name: str
    category: str
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
