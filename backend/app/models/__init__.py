from app.models.base import Base
from app.models.user import User
from app.models.club import (
    Club, ClubMember, Event, Budget, Reimbursement, Sponsorship, RecruitmentDrive, RecruitmentApplication,
    Announcement, AnnualPlan, ClubDocument, EventAttendance,
)
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.models.faculty import Note, Document, Meeting, Task, Reminder, DashboardWidgetPreference
from app.models.notification import Notification
from app.models.faculty_assignment import FacultyAssignment
from app.models.club import ClubHierarchyLevel
from app.models.content import Programme, GalleryImage
from app.models.refresh_token import RefreshToken

# Must come last: it attaches indexes to tables that the imports above define.
from app.models.indexes import register_indexes

register_indexes()

__all__ = [
    "Base",
    "User",
    "Club",
    "ClubMember",
    "Event",
    "Budget",
    "Reimbursement",
    "Sponsorship",
    "RecruitmentDrive",
    "RecruitmentApplication",
    "Announcement",
    "AnnualPlan",
    "ClubDocument",
    "EventAttendance",
    "Claim",
    "ClaimParticipant",
    "AttendanceEntry",
    "SupportingDocument",
    "TimetableSession",
    "Note",
    "Document",
    "Meeting",
    "Task",
    "Reminder",
    "DashboardWidgetPreference",
    "Notification",
    "FacultyAssignment",
    "ClubHierarchyLevel",
    "Programme",
    "GalleryImage",
    "RefreshToken",
]
