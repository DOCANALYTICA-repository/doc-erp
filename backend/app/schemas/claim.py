from typing import List, Literal, Optional
from pydantic import BaseModel, model_validator

class AttendanceEntryBase(BaseModel):
    subject: str
    course_code: Optional[str] = None
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
    # On Out only — the same reasoning as TimetableSessionOut.faculty_name: a
    # client must never be able to POST a faculty NAME.
    subject_faculty_name: str = ""
    # Also Out only, and not even an id on Create: the server copies the
    # co-teacher from the timetable so a student cannot choose their approver.
    co_faculty_id: Optional[str] = None
    co_faculty_name: Optional[str] = None

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

class PendingApprovalOut(BaseModel):
    """One decision a claim is still waiting on.

    The stepper could say WHICH DESK a claim sat on but never WHO, and at the
    subject-faculty stage that is the only useful question — the claim waits
    on every subject faculty member independently, so "under review" could
    mean one signature outstanding or four.
    """
    stage: str
    role: str
    faculty_id: Optional[str] = None
    #: Absent when the role is unfilled — an unassigned Class Teacher is a
    #: real state, and naming nobody is better than naming the wrong person.
    faculty_name: Optional[str] = None
    #: Subject-faculty stage, co-taught hour only: the other teacher, either
    #: of whom may sign. One signature clears the hour.
    co_faculty_id: Optional[str] = None
    co_faculty_name: Optional[str] = None
    #: Subject-faculty stage only: which hour this signature is for.
    subject: Optional[str] = None
    course_code: Optional[str] = None


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
    # Exact values only, so "Co_Curricular" or "Club" cannot slip past the
    # submit route's guards.
    category: Literal["medical", "co_curricular"]
    submission_type: Literal["individual", "club"] = "individual"
    missed_classes: List[AttendanceEntryCreate]
    #: Legacy. Only the submitter's own id is accepted: other students are
    #: claimed for by their club's yellow form.
    student_ids: Optional[List[str]] = None

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
    #: Who still has to act, in the order the workflow needs them. Empty once
    #: the claim has stopped moving.
    pending_approvals: List[PendingApprovalOut] = []

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
    course_code: Optional[str] = None
    hour: str
    batch: Optional[str] = None  # NULL = the whole class
    faculty_id: str
    co_faculty_id: Optional[str] = None  # second teacher of a co-taught slot
    programme: str
    semester: str
    section: str

class TimetableSessionCreate(TimetableSessionBase):
    @model_validator(mode="after")
    def _co_teacher_is_someone_else(self):
        if self.co_faculty_id and self.co_faculty_id == self.faculty_id:
            raise ValueError("co_faculty_id must be a different teacher from faculty_id")
        return self

class TimetableSessionOut(TimetableSessionBase):
    id: str
    # On Out only, NOT on TimetableSessionBase — that class is also
    # TimetableSessionCreate, so putting it there would have clients POSTing a
    # faculty name. Without this the claim form showed a subject and an hour
    # and no way to tell whose class it was; the dev mock supplied the field
    # under a different key ("faculty"), which is what hid the divergence.
    faculty_name: str = ""
    co_faculty_name: Optional[str] = None

    class Config:
        from_attributes = True
