from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin

class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(String, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    source_module = Column(String, nullable=False) # clubs, claims, faculty, system
    task_id = Column(String, ForeignKey("tasks.id"), nullable=True)

    # What this notification is ABOUT, so a card can navigate to it.
    #
    # Without these a claims notification named a reference number in prose
    # and the user went looking for it by hand — the notification told you
    # something happened and then abandoned you.
    entity_type = Column(String, nullable=True)  # claim, annual_plan, task, meeting, club
    entity_id = Column(String, nullable=True)

    # Relationships
    user = relationship("User")
    task = relationship("Task", back_populates="stream_updates")
