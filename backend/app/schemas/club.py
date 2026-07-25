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
    club_id: str
    role: str
    status: str
    academic_year: str
    join_date: Optional[str] = None

    class Config:
        from_attributes = True

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
