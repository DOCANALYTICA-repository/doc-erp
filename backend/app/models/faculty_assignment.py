from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin


class FacultyAssignment(Base, TimestampMixin):
    """Scopes a faculty role tag (Class Teacher, Course Coordinator, Club
    Faculty Coordinator) to the specific class/programme/club it actually
    covers. Holding the tag on User.role_tags_str still answers "can this
    faculty member ever act in this capacity"; a row here answers "is THIS
    specific claim/club actually theirs" — see app/core/faculty_scope.py."""
    __tablename__ = "faculty_assignments"

    id = Column(String, primary_key=True, index=True)
    faculty_id = Column(String, ForeignKey("users.id"), nullable=False)
    role_tag = Column(String, nullable=False)  # Class Teacher, Course Coordinator, Club Faculty Coordinator
    programme = Column(String, nullable=True)  # Class Teacher + Course Coordinator
    semester = Column(String, nullable=True)   # Class Teacher only
    section = Column(String, nullable=True)    # Class Teacher only; NULL = matches any section
    club_id = Column(String, ForeignKey("clubs.id"), nullable=True)  # Club Faculty Coordinator only
    status = Column(String, default="active", nullable=False)  # active, revoked

    faculty = relationship("User")
    club = relationship("Club")
