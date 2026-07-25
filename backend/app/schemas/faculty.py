from typing import List, Optional
from pydantic import BaseModel

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

class MeetingOut(MeetingBase):
    id: str
    organizer_id: str
    minutes: Optional[str] = None
    decisions: Optional[str] = None
    action_items: Optional[str] = None
    club_id: Optional[str] = None

    class Config:
        from_attributes = True

class MeetingMinutesUpdate(BaseModel):
    minutes: str
    decisions: List[str]
    action_items: List[dict] # list of {"title": str, "assignee_id": str, "due_date": str}

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
