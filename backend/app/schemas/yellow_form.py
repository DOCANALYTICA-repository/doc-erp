from datetime import date
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator, model_validator

from app.core.yellow_form_workflow import PERIOD_IDS

#: Longest event a single pre-approval may cover (end - start, in days).
MAX_EVENT_DAYS = 30


def _text(min_length: int, max_length: int):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


def event_window_error(start: date, end: date) -> Optional[str]:
    if end < start:
        return "The event cannot end before it starts."
    if (end - start).days > MAX_EVENT_DAYS:
        return f"A pre-approval can cover at most {MAX_EVENT_DAYS} days — split longer events into separate forms."
    return None


def duplicate_register_number_error(students) -> Optional[str]:
    seen = set()
    for s in students:
        if s.register_number in seen:
            return f"Register number {s.register_number} is listed more than once."
        seen.add(s.register_number)
    return None


class PreApprovalStudentIn(BaseModel):
    #: Upper-cased, so "21com5a001" is the same student as "21COM5A001".
    register_number: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=20)]
    student_name: _text(1, 120)
    class_name: _text(1, 60)
    role: _text(1, 80)


class PreApprovalStudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    student_id: Optional[str] = None
    register_number: str
    student_name: str
    class_name: str
    role: str


class PreApprovalCreate(BaseModel):
    event_name: _text(1, 150)
    event_description: Optional[_text(0, 2000)] = None
    venue: Optional[_text(0, 150)] = None
    event_start_date: date
    event_end_date: date
    academic_year: Optional[_text(0, 20)] = None
    students: List[PreApprovalStudentIn] = []

    @model_validator(mode="after")
    def _check(self):
        error = event_window_error(self.event_start_date, self.event_end_date) \
            or duplicate_register_number_error(self.students)
        if error:
            raise ValueError(error)
        return self


class PreApprovalUpdate(BaseModel):
    """Every field optional. The merged result is validated by the endpoint,
    since a new end date alone can only be checked against the stored start."""
    event_name: Optional[_text(1, 150)] = None
    event_description: Optional[_text(0, 2000)] = None
    venue: Optional[_text(0, 150)] = None
    event_start_date: Optional[date] = None
    event_end_date: Optional[date] = None
    academic_year: Optional[_text(0, 20)] = None
    #: When present, REPLACES the list.
    students: Optional[List[PreApprovalStudentIn]] = None


class ReviewAction(BaseModel):
    action: Literal["approve", "revise", "reject"]
    #: Required (non-blank) for revise and reject; the endpoint answers 400.
    comments: Optional[str] = None


class PreApprovalOut(BaseModel):
    id: str
    reference_number: str
    club_id: str
    club_name: str
    academic_year: str
    event_name: str
    event_description: Optional[str] = None
    venue: Optional[str] = None
    event_start_date: str
    event_end_date: str
    status: str
    status_label: str
    created_by: str
    created_by_name: str
    submitted_at: Optional[str] = None
    faculty_coordinator_approved_by: Optional[str] = None
    faculty_coordinator_approved_by_name: Optional[str] = None
    faculty_coordinator_approved_at: Optional[str] = None
    associate_hod_approved_by: Optional[str] = None
    associate_hod_approved_by_name: Optional[str] = None
    associate_hod_approved_at: Optional[str] = None
    review_comments: Optional[str] = None
    last_reviewed_by_name: Optional[str] = None
    last_reviewed_stage: Optional[str] = None
    students: List[PreApprovalStudentOut] = []
    student_count: int = 0
    #: The last day either approval can be given (event_start_date - 1 day).
    approval_deadline: str
    is_expired: bool = False
    event_completed: bool = False
    #: Who the form is waiting on, by name, e.g. "Dr. Reynal (Faculty Coordinator)".
    pending_with: Optional[str] = None
    claim_sheet_id: Optional[str] = None
    claim_sheet_status: Optional[str] = None
    claim_sheet_reference: Optional[str] = None
    # Per-viewer. The UI renders actions from these and nothing else.
    viewer_can_edit: bool = False
    viewer_can_submit: bool = False
    #: Why an editable form cannot be submitted (the club has no Faculty Coordinator).
    submit_blocked_reason: Optional[str] = None
    viewer_can_delete: bool = False
    viewer_can_review: bool = False
    viewer_can_file_claim_sheet: bool = False


class ClaimSheetEntryIn(BaseModel):
    date: date
    periods: List[str]

    @field_validator("periods")
    @classmethod
    def _known_periods(cls, periods: List[str]) -> List[str]:
        if not periods:
            raise ValueError("Pick at least one period for each date.")
        if len(set(periods)) != len(periods):
            raise ValueError("A period is listed more than once for the same date.")
        unknown = [p for p in periods if p not in PERIOD_IDS]
        if unknown:
            raise ValueError(f"Unknown period(s): {', '.join(unknown)}. Expected one of: {', '.join(PERIOD_IDS)}.")
        return sorted(periods, key=PERIOD_IDS.index)


class ClaimSheetStudentIn(BaseModel):
    pre_approval_student_id: str
    attendance_with_claims: Optional[float] = None
    attendance_without_claims: Optional[float] = None
    #: Overrides the pre-approved role on this sheet; blank keeps it.
    role: Optional[_text(0, 80)] = None
    entries: List[ClaimSheetEntryIn] = []


class ClaimSheetUpsert(BaseModel):
    #: REPLACES the sheet's student list.
    students: List[ClaimSheetStudentIn] = []


class ClaimSheetEntryOut(BaseModel):
    id: str
    date: str
    periods: List[str]


class ClaimSheetStudentOut(BaseModel):
    id: str
    pre_approval_student_id: str
    student_id: Optional[str] = None
    register_number: str
    student_name: str
    class_name: str
    role: str
    attendance_with_claims: Optional[float] = None
    attendance_without_claims: Optional[float] = None
    entries: List[ClaimSheetEntryOut] = []


class PreApprovalSummary(BaseModel):
    """The pre-approved list a claim sheet is filed against."""
    reference_number: str
    faculty_coordinator_approved_by_name: Optional[str] = None
    faculty_coordinator_approved_at: Optional[str] = None
    associate_hod_approved_by_name: Optional[str] = None
    associate_hod_approved_at: Optional[str] = None
    students: List[PreApprovalStudentOut] = []


class ClaimSheetOut(BaseModel):
    id: str
    reference_number: str
    pre_approval_id: str
    pre_approval_reference: str
    club_id: str
    club_name: str
    event_name: str
    event_start_date: str
    event_end_date: str
    status: str
    status_label: str
    created_by: str
    created_by_name: str
    submitted_at: Optional[str] = None
    late_submission_flag: bool = False
    reviewed_by: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_comments: Optional[str] = None
    students: List[ClaimSheetStudentOut] = []
    student_count: int = 0
    #: Number of (student, date) lines — the rows of the exported sheet.
    row_count: int = 0
    pre_approval: PreApprovalSummary
    #: Other students' attendance is null for this viewer: only the people
    #: filing, overseeing or reviewing the sheet see everyone's figures.
    attendance_redacted: bool = False
    viewer_can_edit: bool = False
    viewer_can_submit: bool = False
    viewer_can_delete: bool = False
    viewer_can_review: bool = False
    viewer_can_export: bool = False


class YellowFormBundle(BaseModel):
    pre_approvals: List[PreApprovalOut] = []
    claim_sheets: List[ClaimSheetOut] = []


class EligibleStudentOut(BaseModel):
    student_id: str
    #: The student's enrollment number; "" when their account has none.
    register_number: str
    student_name: str
    class_name_suggestion: str
    default_role: str


class StudentLookupOut(BaseModel):
    found: bool
    student_id: Optional[str] = None
    register_number: str
    student_name: Optional[str] = None
    class_name_suggestion: Optional[str] = None
