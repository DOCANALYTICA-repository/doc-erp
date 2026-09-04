from typing import Dict, List, Optional
from pydantic import BaseModel, EmailStr

class Token(BaseModel):
    access_token: str
    token_type: str

    # Optional so any caller still reading only access_token keeps working.
    # The access token now lives 30 minutes rather than 8 days, so a client
    # that ignores this will be signed out on the half hour.
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class NotificationPreferences(BaseModel):
    """What this person wants to hear about outside the app."""
    email_on_action_required: bool = True
    email_daily_digest: bool = False

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class UserBase(BaseModel):
    email: EmailStr
    name: str
    primary_role: str
    status: str = "active"
    role_tags_str: str = ""
    programme: Optional[str] = None
    semester: Optional[str] = None
    section: Optional[str] = None
    enrollment_no: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    office_location: Optional[str] = None
    office_hours: Optional[str] = None
    bio: Optional[str] = None
    availability_status: str = "available"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    role_tags_str: Optional[str] = None
    status: Optional[str] = None
    programme: Optional[str] = None
    semester: Optional[str] = None
    section: Optional[str] = None
    enrollment_no: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    office_location: Optional[str] = None
    office_hours: Optional[str] = None
    bio: Optional[str] = None
    availability_status: Optional[str] = None

class UserOut(UserBase):
    id: str

    class Config:
        from_attributes = True

class UserProfileOut(UserOut):
    """
    Response shape for GET /auth/me only. Carries the resolved permission
    set and the platform capability map in the SAME payload the frontend
    already fetches at session hydrate, so the frontend never needs (and
    must never re-introduce) its own copy of either registry.
    """
    permissions: List[str]
    capabilities: Dict[str, str]

class UserDirectoryOut(BaseModel):
    """Public-within-the-platform faculty directory entry (Phase 6)."""
    id: str
    name: str
    email: str
    designation: Optional[str] = None
    role_tags_str: str = ""
    phone: Optional[str] = None
    office_location: Optional[str] = None
    office_hours: Optional[str] = None
    bio: Optional[str] = None
    availability_status: str = "available"

    class Config:
        from_attributes = True
