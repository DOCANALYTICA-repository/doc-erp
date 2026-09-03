from datetime import datetime
from typing import Optional

from pydantic import BaseModel

class NotificationOut(BaseModel):
    id: str
    user_id: str
    title: str
    content: Optional[str] = None
    is_read: bool
    source_module: str
    task_id: Optional[str] = None

    # What this is about, so the card links to it instead of describing it.
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
