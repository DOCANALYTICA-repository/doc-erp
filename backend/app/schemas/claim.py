from typing import List, Optional
from pydantic import BaseModel

class AttendanceEntryBase(BaseModel):
    subject: str
    date: str
    hour: str
    subject_faculty_id: str

class AttendanceEntryCreate(AttendanceEntryBase):
    pass

class AttendanceEntryOut(AttendanceEntryBase):
    id: str
    claim_participant_id: str
    status: str
    feedback: Optional[str] = None

    class Config:
        from_attributes = True

class ClaimParticipantOut(BaseModel):
    id: str
    claim_id: str
    student_id: str
    status: str
    entries: List[AttendanceEntryOut] = []

    class Config:
        from_attributes = True

class ClaimBase(BaseModel):
    category: str # medical, co_curricular
    academic_year: str
    semester: str
    programme: str
    section: str
    submission_type: str = "individual"
    club_id: Optional[str] = None  # required when submission_type == "club"
    date_range: str
    reason: Optional[str] = None

class ClaimCreate(ClaimBase):
    missed_classes: List[AttendanceEntryCreate]
    student_ids: Optional[List[str]] = None # For club co-curricular group submissions

class ClaimOut(ClaimBase):
    id: str
    reference_number: str
    submitted_by: str
    submitter_name: str = "Unknown"  # populated by the endpoint via Claim.submitter, never client-supplied
    submission_date: str
    status: str
    late_submission_flag: bool
    current_workflow_stage: str
    revision_reason: Optional[str] = None
    last_revised_by: Optional[str] = None
    last_revised_stage: Optional[str] = None
    participants: List[ClaimParticipantOut] = []

    class Config:
        from_attributes = True

class ClaimResubmit(BaseModel):
    """PUT /claims/{claim_id}/resubmit body — edits a returned claim in
    place. Only fields the student actually changed need be supplied."""
    date_range: Optional[str] = None
    reason: Optional[str] = None
    missed_classes: Optional[List[AttendanceEntryCreate]] = None
    removed_document_ids: Optional[List[str]] = None

class SupportingDocumentOut(BaseModel):
    id: str
    claim_id: str
    document_type: str
    file_url: str

    class Config:
        from_attributes = True

class DuplicateClaimWarning(BaseModel):
    """Soft warning only — per the Claims PRD, duplicate detection must
    never block submission, only surface a warning."""
    has_potential_duplicate: bool
    message: Optional[str] = None

class TimetableSessionBase(BaseModel):
    day_of_week: str
    subject: str
    hour: str
    faculty_id: str
    programme: str
    semester: str
    section: str

class TimetableSessionCreate(TimetableSessionBase):
    pass

class TimetableSessionOut(TimetableSessionBase):
    id: str

    class Config:
        from_attributes = True
