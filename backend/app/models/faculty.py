import json
from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class Note(Base, TimestampMixin):
    __tablename__ = "notes"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(String, nullable=True)
    is_pinned = Column(Boolean, default=False, nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    tags = Column(String, default="", nullable=False) # e.g. "syllabus,exam"

    # Relationships
    owner = relationship("User", back_populates="notes")


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    folder_path = Column(String, default="/", nullable=False) # e.g. "/Meetings"
    tags = Column(String, default="", nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    shared_link = Column(String, nullable=True)
    is_link_revoked = Column(Boolean, default=False, nullable=False)

    # Relationships
    owner = relationship("User", back_populates="documents")


class Meeting(Base, TimestampMixin):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    type = Column(String, default="department", nullable=False) # department, club, external
    date = Column(String, nullable=False) # ISO date string
    time = Column(String, nullable=False) # e.g. "10:00 AM"
    duration = Column(String, nullable=True) # e.g. "1 hour"
    venue = Column(String, nullable=False)
    organizer_id = Column(String, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="scheduled", nullable=False) # scheduled, completed, cancelled
    minutes = Column(String, nullable=True)
    decisions = Column(String, nullable=True)
    action_items = Column(String, nullable=True)
    club_id = Column(String, ForeignKey("clubs.id"), nullable=True)

    # Relationships
    organizer = relationship("User", back_populates="created_meetings")
    club = relationship("Club")

    @property
    def decisions_list(self) -> list[str]:
        """Decisions as a real list.

        Stored as JSON. Older rows used a comma-joined string, which could not
        distinguish ONE decision containing a comma ("Approved a budget of
        Rs 40,000") from TWO decisions — it silently split the text in half on
        display. Those rows are still read correctly by the fallback below.
        """
        raw = (self.decisions or "").strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(d) for d in parsed]
            except (ValueError, TypeError):
                pass
        # Legacy comma-joined format.
        return [d.strip() for d in raw.split(",") if d.strip()]

    @property
    def action_items_list(self) -> list[dict]:
        raw = (self.action_items or "").strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (ValueError, TypeError):
            return []


class Reminder(Base, TimestampMixin):
    """Faculty PRD v1 workspace — no model existed for this at all before
    Phase 6; Reminders were named but never implemented anywhere."""
    __tablename__ = "reminders"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    reminder_type = Column(String, default="one_time", nullable=False)  # one_time, recurring, due_date
    due_date = Column(String, nullable=False)
    status = Column(String, default="scheduled", nullable=False)  # scheduled, active, completed, archived

    owner = relationship("User")


class DashboardWidgetPreference(Base, TimestampMixin):
    """Minimum-viable Workspace Engine (v1 scope: order + show/hide only —
    drag-and-drop/collapse is faculty.dashboard_customization_advanced,
    flagged coming_soon)."""
    __tablename__ = "dashboard_widget_preferences"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    widget_key = Column(String, nullable=False)  # e.g. "todays_schedule", "tasks", "notes"
    order = Column(String, nullable=False, default="0")
    visible = Column(Boolean, default=True, nullable=False)

    owner = relationship("User")


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    due_date = Column(String, nullable=False)
    priority = Column(String, default="medium", nullable=False) # low, medium, high
    status = Column(String, default="pending", nullable=False) # pending, in_progress, completed, archived
    source_module = Column(String, nullable=False) # faculty, clubs, claims
    assignee_id = Column(String, ForeignKey("users.id"), nullable=False)
    creator_id = Column(String, ForeignKey("users.id"), nullable=False)
    related_entity_type = Column(String, nullable=True) # e.g., "meeting", "club"
    related_entity_id = Column(String, nullable=True)

    # Relationships
    assignee = relationship("User", foreign_keys=[assignee_id], back_populates="assigned_tasks")
    creator = relationship("User", foreign_keys=[creator_id], back_populates="created_tasks")
    stream_updates = relationship("Notification", back_populates="task", cascade="all, delete-orphan")
