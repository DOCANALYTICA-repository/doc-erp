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
    participants: List[ClaimParticipantOut] = []

    class Config:
        from_attributes = True

class SupportingDocumentOut(BaseModel):
    id: str
    claim_id: str
    document_type: str
    file_url: str

    class Config:
        from_attributes = True

class TimetableSessionOut(BaseModel):
    id: str
    day_of_week: str
    subject: str
    hour: str
    faculty_id: str
    programme: str
    semester: str
    section: str

    class Config:
        from_attributes = True
