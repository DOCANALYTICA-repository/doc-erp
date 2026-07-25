from typing import List, Optional
from pydantic import BaseModel, EmailStr

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class UserBase(BaseModel):
    email: EmailStr
    name: str
    primary_role: str
    status: str = "active"
    role_tags_str: str = ""

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    role_tags_str: Optional[str] = None
    status: Optional[str] = None

class UserOut(UserBase):
    id: str

    class Config:
        from_attributes = True
