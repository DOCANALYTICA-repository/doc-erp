from typing import List, Optional

from pydantic import BaseModel, Field


class ProgrammeIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    brochure_url: Optional[str] = None
    outcomes: Optional[List[str]] = None
    careers: Optional[List[str]] = None
    display_order: Optional[int] = None
    is_published: Optional[bool] = None


class ProgrammeOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    brochure_url: Optional[str] = None
    outcomes: str = ""
    careers: str = ""
    display_order: int = 0
    is_published: bool = True

    class Config:
        from_attributes = True


class GalleryImageIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    url: Optional[str] = None
    caption: Optional[str] = None
    display_order: Optional[int] = None
    is_published: Optional[bool] = None


class GalleryImageOut(BaseModel):
    id: str
    title: str
    url: str
    caption: Optional[str] = None
    display_order: int = 0
    is_published: bool = True

    class Config:
        from_attributes = True
