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

    # Relationships
    student = relationship("User", back_populates="memberships")
    club = relationship("Club", back_populates="members")


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
