from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class FacultyAssignmentBase(BaseModel):
    faculty_id: str
    role_tag: str  # Class Teacher, Course Coordinator, Club Faculty Coordinator
    programme: Optional[str] = None
    semester: Optional[str] = None
    section: Optional[str] = None
    club_id: Optional[str] = None

class FacultyAssignmentCreate(FacultyAssignmentBase):
    pass

class FacultyAssignmentOut(FacultyAssignmentBase):
    id: str
    status: str

    class Config:
        from_attributes = True

class NoteBase(BaseModel):
    title: str
    content: Optional[str] = None
    is_pinned: Optional[bool] = False
    is_favorite: Optional[bool] = False
    tags: Optional[str] = ""

class NoteCreate(NoteBase):
    pass

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    tags: Optional[str] = None

class NoteOut(NoteBase):
    id: str
    owner_id: str

    class Config:
        from_attributes = True

class DocumentBase(BaseModel):
    name: str
    file_url: str
    folder_path: Optional[str] = "/"
    tags: Optional[str] = ""
    is_favorite: Optional[bool] = False

class DocumentCreate(DocumentBase):
    pass

class DocumentOut(DocumentBase):
    id: str
    owner_id: str
    shared_link: Optional[str] = None
    is_link_revoked: bool

    class Config:
        from_attributes = True

class MeetingBase(BaseModel):
    title: str
    type: str = "department" # department, club, external
    date: str
    time: str
    duration: Optional[str] = None
    venue: str
    status: Optional[str] = "scheduled"

class MeetingCreate(MeetingBase):
    club_id: Optional[str] = None

class MeetingActionItem(BaseModel):
    """A real model, not List[dict].

    task.py indexed item["title"] and item["assignee_id"] directly, so an
    action item missing either was a 500 rather than a 422 telling the user
    which field they left out.
    """
    title: str = Field(min_length=1)
    assignee_id: str = Field(min_length=1)
    due_date: Optional[str] = None


class MeetingOut(MeetingBase):
    id: str
    organizer_id: str
    minutes: Optional[str] = None
    club_id: Optional[str] = None

    # Real lists rather than the raw storage strings. The columns hold JSON;
    # these come from Meeting.decisions_list / action_items_list, which also
    # read the legacy comma-joined format correctly.
    decisions: List[str] = Field(default_factory=list, validation_alias="decisions_list")
    action_items: List[MeetingActionItem] = Field(
        default_factory=list, validation_alias="action_items_list"
    )

    # populate_by_name so the field can still be set by its own name in tests
    # and by any caller constructing this directly.
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class MeetingMinutesUpdate(BaseModel):
    minutes: str
    decisions: List[str]
    action_items: List[MeetingActionItem] = []

class ReminderBase(BaseModel):
    title: str
    description: Optional[str] = None
    reminder_type: str = "one_time"  # one_time, recurring, due_date
    due_date: str

class ReminderCreate(ReminderBase):
    pass

class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    reminder_type: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None  # scheduled, active, completed, archived

class ReminderOut(ReminderBase):
    id: str
    owner_id: str
    status: str

    class Config:
        from_attributes = True

class DashboardWidgetPreferenceItem(BaseModel):
    widget_key: str
    order: str
    visible: bool = True

class DashboardWidgetPreferenceOut(DashboardWidgetPreferenceItem):
    id: str
    owner_id: str

    class Config:
        from_attributes = True
