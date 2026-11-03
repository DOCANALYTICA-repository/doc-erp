"""Yellow forms: club co-curricular attendance claims.

Two documents, filed by a club, in order:

  1. PreApprovalForm — the event and the students expected to miss class,
     approved by the club's Faculty Coordinator and then the Associate HOD,
     before the event starts.
  2. ClubClaimSheet — filed once the event is over, against exactly one
     approved pre-approval: per student, the dates and periods missed and
     their current attendance with and without claims. The Claims
     Coordinator's approval forwards it to the attendance office.

Dates are ISO "YYYY-MM-DD" strings, the codebase's convention.
"""
from typing import List

from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base, TimestampMixin


class PreApprovalForm(Base, TimestampMixin):
    __tablename__ = "pre_approval_forms"

    id = Column(String, primary_key=True, index=True)
    reference_number = Column(String, unique=True, index=True, nullable=False)  # PAF-2026-1A2B3C
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False, index=True)
    academic_year = Column(String, nullable=False)
    event_name = Column(String, nullable=False)
    event_description = Column(String, nullable=True)
    venue = Column(String, nullable=True)
    event_start_date = Column(String, nullable=False)
    event_end_date = Column(String, nullable=False)
    # draft, faculty_coordinator_review, associate_hod_review, approved, returned, rejected
    status = Column(String, default="draft", nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    submitted_at = Column(String, nullable=True)

    faculty_coordinator_approved_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    faculty_coordinator_approved_at = Column(String, nullable=True)
    associate_hod_approved_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    associate_hod_approved_at = Column(String, nullable=True)

    # Set by the last revise/reject; review_comments is cleared on resubmission.
    review_comments = Column(String, nullable=True)
    last_reviewed_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    last_reviewed_stage = Column(String, nullable=True)

    club = relationship("Club")
    creator = relationship("User", foreign_keys=[created_by])
    fc_approver = relationship("User", foreign_keys=[faculty_coordinator_approved_by])
    ahod_approver = relationship("User", foreign_keys=[associate_hod_approved_by])
    last_reviewer = relationship("User", foreign_keys=[last_reviewed_by])
    students = relationship(
        "PreApprovalStudent", back_populates="pre_approval", cascade="all, delete-orphan",
        order_by="(PreApprovalStudent.position, PreApprovalStudent.created_at, PreApprovalStudent.id)",
    )
    claim_sheet = relationship("ClubClaimSheet", back_populates="pre_approval", uselist=False)


class PreApprovalStudent(Base, TimestampMixin):
    __tablename__ = "pre_approval_students"
    __table_args__ = (
        UniqueConstraint("pre_approval_id", "register_number", name="uq_pre_approval_students_register_number"),
    )

    id = Column(String, primary_key=True, index=True)
    pre_approval_id = Column(String, ForeignKey("pre_approval_forms.id"), nullable=False, index=True)
    # Linked when a user with enrollment_no == register_number exists; a
    # student without an account can still be listed.
    student_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    register_number = Column(String, nullable=False)
    student_name = Column(String, nullable=False)
    class_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    # The club's own row order (the claim sheet's S.No follows it).
    position = Column(Integer, default=0, nullable=False)

    pre_approval = relationship("PreApprovalForm", back_populates="students")
    student = relationship("User")


class ClubClaimSheet(Base, TimestampMixin):
    __tablename__ = "club_claim_sheets"

    id = Column(String, primary_key=True, index=True)
    reference_number = Column(String, unique=True, index=True, nullable=False)  # YF-2026-1A2B3C
    # UNIQUE: at most one claim sheet per pre-approval.
    pre_approval_id = Column(String, ForeignKey("pre_approval_forms.id"), nullable=False, unique=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False, index=True)
    # draft, claims_coordinator_review, approved (= forwarded to the attendance office), returned, rejected
    status = Column(String, default="draft", nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    submitted_at = Column(String, nullable=True)
    late_submission_flag = Column(Boolean, default=False, nullable=False)
    reviewed_by = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    reviewed_at = Column(String, nullable=True)
    review_comments = Column(String, nullable=True)

    pre_approval = relationship("PreApprovalForm", back_populates="claim_sheet")
    club = relationship("Club")
    creator = relationship("User", foreign_keys=[created_by])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    students = relationship(
        "ClubClaimStudent", back_populates="sheet", cascade="all, delete-orphan",
        order_by="(ClubClaimStudent.position, ClubClaimStudent.created_at, ClubClaimStudent.id)",
    )


class ClubClaimStudent(Base, TimestampMixin):
    __tablename__ = "club_claim_students"
    __table_args__ = (
        UniqueConstraint("sheet_id", "pre_approval_student_id", name="uq_club_claim_students_pre_approval_student"),
    )

    id = Column(String, primary_key=True, index=True)
    sheet_id = Column(String, ForeignKey("club_claim_sheets.id"), nullable=False, index=True)
    pre_approval_student_id = Column(String, ForeignKey("pre_approval_students.id"), nullable=False, index=True)
    student_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    # Snapshots of the pre-approved row, so the sheet reads the same whatever
    # happens to the student's account later. Role may be overridden.
    register_number = Column(String, nullable=False)
    student_name = Column(String, nullable=False)
    class_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    # Entered by the club: the portal holds no attendance data of its own.
    attendance_with_claims = Column(Float, nullable=True)
    attendance_without_claims = Column(Float, nullable=True)
    position = Column(Integer, default=0, nullable=False)

    sheet = relationship("ClubClaimSheet", back_populates="students")
    pre_approval_student = relationship("PreApprovalStudent")
    student = relationship("User")
    entries = relationship(
        "ClubClaimEntry", back_populates="claim_student", cascade="all, delete-orphan",
        order_by="ClubClaimEntry.date",
    )


class ClubClaimEntry(Base, TimestampMixin):
    """One date a student missed, and which periods."""
    __tablename__ = "club_claim_entries"
    __table_args__ = (
        UniqueConstraint("claim_student_id", "date", name="uq_club_claim_entries_date"),
    )

    id = Column(String, primary_key=True, index=True)
    claim_student_id = Column(String, ForeignKey("club_claim_students.id"), nullable=False, index=True)
    date = Column(String, nullable=False)
    # Comma-separated period ids from CLAIM_SHEET_PERIODS, in vocabulary order.
    periods = Column(String, nullable=False)

    claim_student = relationship("ClubClaimStudent", back_populates="entries")

    @property
    def periods_list(self) -> List[str]:
        return [p for p in (self.periods or "").split(",") if p]
