"""Department content that used to be hardcoded in Python.

get_public_statistics() returned the literals 2500 / 85 / 12 / 55; the three
course descriptions were a hardcoded list whose brochure_urls pointed at PDFs
that exist nowhere in the repository; and all four gallery photographs were
picsum.photos placeholders.

get_club_showcase() was already correctly DB-backed, and is the pattern these
follow.
"""
from sqlalchemy import Boolean, Column, Integer, String

from app.models.base import Base, TimestampMixin


class Programme(Base, TimestampMixin):
    """A degree programme the department offers, as shown on the public site."""
    __tablename__ = "programmes"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Nullable on purpose. A link to a brochure that does not exist is worse
    # than no link: the previous hardcoded list advertised three PDFs that
    # were never in the repository, so every one of them 404'd.
    brochure_url = Column(String, nullable=True)

    # Comma-separated, matching the existing convention in this schema
    # (User.role_tags_str, Meeting.decisions).
    outcomes = Column(String, default="", nullable=False)
    careers = Column(String, default="", nullable=False)

    display_order = Column(Integer, default=0, nullable=False)
    is_published = Column(Boolean, default=True, nullable=False)

    @property
    def outcomes_list(self) -> list[str]:
        return [o.strip() for o in (self.outcomes or "").split(",") if o.strip()]

    @property
    def careers_list(self) -> list[str]:
        return [c.strip() for c in (self.careers or "").split(",") if c.strip()]


class GalleryImage(Base, TimestampMixin):
    """A photograph on the public gallery."""
    __tablename__ = "gallery_images"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    caption = Column(String, nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    is_published = Column(Boolean, default=True, nullable=False)
