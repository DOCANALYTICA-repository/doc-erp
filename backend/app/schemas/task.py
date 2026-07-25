from typing import Optional
from pydantic import BaseModel

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: str
    priority: str = "medium"
    status: Optional[str] = "pending"
    source_module: str

class TaskCreate(TaskBase):
    assignee_id: str

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None

class TaskOut(TaskBase):
    id: str
    assignee_id: str
    creator_id: str
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None

    class Config:
        from_attributes = True
