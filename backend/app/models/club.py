from sqlalchemy import Column, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class Club(Base, TimestampMixin):
    __tablename__ = "clubs"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    category = Column(String, nullable=False)
    logo = Column(String, nullable=True)
    description = Column(String, nullable=True)
    brand_colors = Column(String, default="#000000", nullable=False)
    contact_email = Column(String, nullable=True)
    status = Column(String, default="active", nullable=False) # active, archived

    # Relationships
    members = relationship("ClubMember", back_populates="club", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="club", cascade="all, delete-orphan")
    budgets = relationship("Budget", back_populates="club", cascade="all, delete-orphan")
    reimbursements = relationship("Reimbursement", back_populates="club", cascade="all, delete-orphan")
    sponsorships = relationship("Sponsorship", back_populates="club", cascade="all, delete-orphan")


class ClubMember(Base, TimestampMixin):
    __tablename__ = "club_members"

    id = Column(String, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("users.id"), nullable=False)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    role = Column(String, default="Member", nullable=False) # Club President, Core Member, Member
    status = Column(String, default="active", nullable=False) # active, alumni
    academic_year = Column(String, nullable=False) # e.g. "2025-2026"
    join_date = Column(String, nullable=True)
    # Permission Templates (Clubs PRD §17) — Club Head, Documentation Head,
    # Events Head, Sponsorship Head, Finance Head, or None (plain member).
    # Assigned by Club Head / faculty / super_admin; layered on top of the
    # member's global role_tags rather than replacing them.
    permission_template = Column(String, nullable=True)

    # Relationships
    student = relationship("User", back_populates="memberships")
    club = relationship("Club", back_populates="members")

    @property
    def student_name(self) -> str | None:
        """Lets ClubMemberOut (from_attributes=True) expose the member's
        real name without every caller having to join/hydrate it manually."""
        return self.student.name if self.student else None


class Event(Base, TimestampMixin):
    __tablename__ = "events"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    date = Column(String, nullable=False) # ISO formatted date
    venue = Column(String, nullable=False)
    budget = Column(Float, default=0.0, nullable=False)
    status = Column(String, default="draft", nullable=False) # draft, pending_approval, approved, executed, cancelled

    # Relationships
    club = relationship("Club", back_populates="events")
    reimbursements = relationship("Reimbursement", back_populates="event")


class Budget(Base, TimestampMixin):
    __tablename__ = "budgets"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    academic_year = Column(String, nullable=False)
    allocated_amount = Column(Float, default=0.0, nullable=False)
    spent_amount = Column(Float, default=0.0, nullable=False)

    # Relationships
    club = relationship("Club", back_populates="budgets")


class Reimbursement(Base, TimestampMixin):
    __tablename__ = "reimbursements"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    event_id = Column(String, ForeignKey("events.id"), nullable=True)
    requested_by = Column(String, ForeignKey("users.id"), nullable=False)
    amount = Column(Float, default=0.0, nullable=False)
    status = Column(String, default="pending", nullable=False) # pending, approved, paid, rejected
    receipt_url = Column(String, nullable=True)

    # Relationships
    club = relationship("Club", back_populates="reimbursements")
    event = relationship("Event", back_populates="reimbursements")
    requestor = relationship("User")


class Sponsorship(Base, TimestampMixin):
    __tablename__ = "sponsorships"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    sponsor_name = Column(String, nullable=False)
    amount = Column(Float, default=0.0, nullable=False)
    status = Column(String, default="lead", nullable=False) # lead, committed, received
    contract_url = Column(String, nullable=True)

    # Relationships
    club = relationship("Club", back_populates="sponsorships")


class RecruitmentDrive(Base, TimestampMixin):
    """Clubs PRD v1 — 'replaces Google Forms' for recruitment. Had no model
    or endpoints at all before Phase 4."""
    __tablename__ = "recruitment_drives"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    title = Column(String, nullable=False)
    recruitment_period = Column(String, nullable=False)  # e.g. "Aug 2026"
    eligibility = Column(String, nullable=True)
    positions_available = Column(String, nullable=True)
    status = Column(String, default="open", nullable=False)  # open, closed, archived

    club = relationship("Club")
    applications = relationship("RecruitmentApplication", back_populates="drive", cascade="all, delete-orphan")


class RecruitmentApplication(Base, TimestampMixin):
    __tablename__ = "recruitment_applications"

    id = Column(String, primary_key=True, index=True)
    drive_id = Column(String, ForeignKey("recruitment_drives.id"), nullable=False)
    applicant_id = Column(String, ForeignKey("users.id"), nullable=False)
    motivation_statement = Column(String, nullable=True)
    # Applied, Shortlisted, Interview Scheduled, Interview Completed, Selected, Rejected, Joined
    status = Column(String, default="applied", nullable=False)

    drive = relationship("RecruitmentDrive", back_populates="applications")
    applicant = relationship("User")


class Announcement(Base, TimestampMixin):
    __tablename__ = "announcements"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    # general, recruitment, event, meeting, deadline, congratulations, emergency
    announcement_type = Column(String, default="general", nullable=False)

    club = relationship("Club")
    author = relationship("User")


class AnnualPlan(Base, TimestampMixin):
    """Clubs PRD §24 — one official Annual Plan per club per academic year,
    carrying its own multi-stage approval workflow. Had no model at all
    before Phase 4 remainder."""
    __tablename__ = "annual_plans"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    academic_year = Column(String, nullable=False)

    vision = Column(String, nullable=True)
    objectives = Column(String, nullable=True)
    major_initiatives = Column(String, nullable=True)
    tentative_event_calendar = Column(String, nullable=True)
    budget_allocation = Column(Float, default=0.0, nullable=False)
    expected_outcomes = Column(String, nullable=True)
    strategic_priorities = Column(String, nullable=True)
    key_deadlines = Column(String, nullable=True)

    # draft, faculty_coordinator_review, cultural_coordinator_review,
    # hod_review, approved, locked
    status = Column(String, default="draft", nullable=False)
    review_comments = Column(String, nullable=True)
    submitted_by = Column(String, ForeignKey("users.id"), nullable=False)

    club = relationship("Club")
    submitter = relationship("User")


class ClubDocument(Base, TimestampMixin):
    """Clubs PRD §28 Documents Workspace + §29 Knowledge Base (the KB is a
    tag-filtered view over these same records, not a separate store —
    a document tagged "knowledge-base" surfaces there)."""
    __tablename__ = "club_documents"

    id = Column(String, primary_key=True, index=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=False)
    uploaded_by = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    # Annual Plans, Reports, Meeting Documents, Policies, Templates,
    # Recruitment Material, Financial Documents, Brand Assets, Presentations
    category = Column(String, default="Templates", nullable=False)
    tags = Column(String, default="", nullable=False)  # comma-separated
    version = Column(String, default="1", nullable=False)
    previous_version_id = Column(String, ForeignKey("club_documents.id"), nullable=True)

    club = relationship("Club")
    uploader = relationship("User")


class EventAttendance(Base, TimestampMixin):
    """Backs the Clubs Attendance Report (PRD §47.2) — per-member attendance
    at a club event, since no such record existed anywhere before."""
    __tablename__ = "event_attendance"

    id = Column(String, primary_key=True, index=True)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    student_id = Column(String, ForeignKey("users.id"), nullable=False)
    attended = Column(String, default="present", nullable=False)  # present, absent

    event = relationship("Event")
    student = relationship("User")
