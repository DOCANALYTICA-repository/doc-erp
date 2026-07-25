from sqlalchemy import Column, String, Boolean
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True) # UUID or email-based unique identifier
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    primary_role = Column(String, default="student", nullable=False) # student, faculty, super_admin
    status = Column(String, default="active", nullable=False) # active, inactive, archived
    role_tags_str = Column(String, default="", nullable=False) # e.g. "Club President,Class Teacher"

    # Academic profile (students) — nullable since faculty/admin accounts
    # won't have these; required at the application layer for students.
    # Unblocks: real programme/semester/section on Claims (no more hardcoded
    # literals), and duplicate-claim detection needing a real section to compare.
    programme = Column(String, nullable=True)          # e.g. "B.Com (Hons)"
    semester = Column(String, nullable=True)            # e.g. "5"
    section = Column(String, nullable=True)             # e.g. "A"
    enrollment_no = Column(String, nullable=True, unique=True)

    # Faculty Directory fields (per Faculty PRD's own field list)
    designation = Column(String, nullable=True)         # e.g. "Assistant Professor"
    phone = Column(String, nullable=True)
    office_location = Column(String, nullable=True)
    office_hours = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    availability_status = Column(String, default="available", nullable=False)  # available, busy, on_leave

    # Relationships
    memberships = relationship("ClubMember", back_populates="student", cascade="all, delete-orphan")
    assigned_tasks = relationship("Task", foreign_keys="[Task.assignee_id]", back_populates="assignee")
    created_tasks = relationship("Task", foreign_keys="[Task.creator_id]", back_populates="creator")
    created_meetings = relationship("Meeting", back_populates="organizer")
    notes = relationship("Note", back_populates="owner", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")

    @property
    def role_tags_list(self) -> list[str]:
        if not self.role_tags_str:
            return []
        return [t.strip() for t in self.role_tags_str.split(",") if t.strip()]

    @property
    def is_active(self) -> bool:
        return self.status == "active"
