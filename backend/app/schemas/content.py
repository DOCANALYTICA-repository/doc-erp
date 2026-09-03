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


class PublicProgrammeOut(BaseModel):
    """What the PUBLIC /content/courses returns.

    Distinct from ProgrammeOut, which is the admin/storage shape: outcomes and
    careers are comma-joined strings in the database and real lists on the
    wire. Without a response_model the generated OpenAPI schema described the
    storage shape, and the frontend was typed against strings it then called
    .map() on.
    """
    id: str
    name: str
    description: Optional[str] = None
    brochure_url: Optional[str] = None
    outcomes: List[str] = []
    careers: List[str] = []


class PublicGalleryImageOut(BaseModel):
    id: str
    title: str
    url: str
    caption: Optional[str] = None


class PublicStatisticsOut(BaseModel):
    total_students: int
    faculty_count: int
    number_of_clubs: int
    years_established: int
    founded_year: int


class ShowcaseClubOut(BaseModel):
    id: str
    name: str
    category: str
    logo: Optional[str] = None
    description: Optional[str] = None
    contact_email: Optional[str] = None


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
