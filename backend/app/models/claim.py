from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class Claim(Base, TimestampMixin):
    __tablename__ = "claims"

    id = Column(String, primary_key=True, index=True)
    reference_number = Column(String, unique=True, index=True, nullable=False) # e.g. ACP-2026-000421
    category = Column(String, nullable=False) # medical, co_curricular
    academic_year = Column(String, nullable=False)
    semester = Column(String, nullable=False)
    programme = Column(String, nullable=False)
    section = Column(String, nullable=False)
    submission_type = Column(String, default="individual", nullable=False) # individual, club
    club_id = Column(String, ForeignKey("clubs.id"), nullable=True)  # required when submission_type == "club" — scopes visibility to that club's Faculty Coordinator
    submitted_by = Column(String, ForeignKey("users.id"), nullable=False)
    submission_date = Column(String, nullable=False)
    date_range = Column(String, nullable=False)
    reason = Column(String, nullable=True)
    status = Column(String, default="draft", nullable=False) # draft, submitted, under_review, approved, closed, rejected, returned
    late_submission_flag = Column(Boolean, default=False, nullable=False)
    current_workflow_stage = Column(String, default="initial_review", nullable=False) # initial_review, subject_faculty, course_coordinator, attendance_office, closed

    # Revise/resubmit tracking — set whenever a stage revises or rejects the
    # claim; cleared on resubmission. Lets the frontend show WHY a claim was
    # sent back and lets the resubmit endpoint know who to notify.
    revision_reason = Column(String, nullable=True)
    last_revised_by = Column(String, ForeignKey("users.id"), nullable=True)
    last_revised_stage = Column(String, nullable=True)  # initial_review, subject_faculty, course_coordinator

    # Relationships
    submitter = relationship("User", foreign_keys=[submitted_by])
    club = relationship("Club", foreign_keys=[club_id])
    participants = relationship("ClaimParticipant", back_populates="claim", cascade="all, delete-orphan")
    documents = relationship("SupportingDocument", back_populates="claim", cascade="all, delete-orphan")


class ClaimParticipant(Base, TimestampMixin):
    __tablename__ = "claim_participants"

    id = Column(String, primary_key=True, index=True)
    claim_id = Column(String, ForeignKey("claims.id"), nullable=False)
    student_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending", nullable=False) # pending, approved, rejected

    # Relationships
    claim = relationship("Claim", back_populates="participants")
    student = relationship("User", foreign_keys=[student_id])
    entries = relationship("AttendanceEntry", back_populates="participant", cascade="all, delete-orphan")


class AttendanceEntry(Base, TimestampMixin):
    __tablename__ = "attendance_entries"

    id = Column(String, primary_key=True, index=True)
    claim_participant_id = Column(String, ForeignKey("claim_participants.id"), nullable=False)
    subject = Column(String, nullable=False)
    date = Column(String, nullable=False)
    hour = Column(String, nullable=False) # e.g. "09:00 AM - 10:00 AM"
    subject_faculty_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending", nullable=False) # pending, approved, rejected
    feedback = Column(String, nullable=True)

    # Relationships
    participant = relationship("ClaimParticipant", back_populates="entries")
    subject_faculty = relationship("User", foreign_keys=[subject_faculty_id])


class SupportingDocument(Base, TimestampMixin):
    __tablename__ = "supporting_documents"

    id = Column(String, primary_key=True, index=True)
    claim_id = Column(String, ForeignKey("claims.id"), nullable=False)
    document_type = Column(String, nullable=False) # medical_certificate, pre_approval_form
    file_url = Column(String, nullable=False)

    # Relationships
    claim = relationship("Claim", back_populates="documents")


class TimetableSession(Base, TimestampMixin):
    __tablename__ = "timetable_sessions"

    id = Column(String, primary_key=True, index=True)
    day_of_week = Column(String, nullable=False) # Monday, Tuesday...
    subject = Column(String, nullable=False)
    hour = Column(String, nullable=False)
    faculty_id = Column(String, ForeignKey("users.id"), nullable=False)
    programme = Column(String, nullable=False)
    semester = Column(String, nullable=False)
    section = Column(String, nullable=False)

    # Relationships
    faculty = relationship("User", foreign_keys=[faculty_id])

    @property
    def faculty_name(self) -> str:
        """Who actually teaches this slot.

        A plain property rather than a schema-level join: with
        from_attributes=True, TimetableSessionOut picks it up with no endpoint
        changes at all. Callers MUST selectinload(TimetableSession.faculty) or
        this becomes one SELECT per slot.
        """
        return self.faculty.name if self.faculty else ""
