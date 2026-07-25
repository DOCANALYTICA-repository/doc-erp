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

    class Config:
        from_attributes = True
