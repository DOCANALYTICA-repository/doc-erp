from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.faculty import Note, Document, Meeting, Task, Reminder
from app.repositories.base import BaseRepository

class NoteRepository(BaseRepository[Note]):
    def get_by_owner(self, db: Session, *, owner_id: str) -> List[Note]:
        return db.query(Note).filter(Note.owner_id == owner_id).all()

    def get_pinned_by_owner(self, db: Session, *, owner_id: str) -> List[Note]:
        return db.query(Note).filter(
            Note.owner_id == owner_id,
            Note.is_pinned == True
        ).all()

class DocumentRepository(BaseRepository[Document]):
    def get_by_owner(self, db: Session, *, owner_id: str) -> List[Document]:
        return db.query(Document).filter(
            Document.owner_id == owner_id,
            Document.is_link_revoked == False
        ).all()

    def get_by_shared_link(self, db: Session, *, shared_link: str) -> Optional[Document]:
        return db.query(Document).filter(
            Document.shared_link == shared_link,
            Document.is_link_revoked == False
        ).first()

class MeetingRepository(BaseRepository[Meeting]):
    def get_by_organizer(self, db: Session, *, organizer_id: str) -> List[Meeting]:
        return db.query(Meeting).filter(Meeting.organizer_id == organizer_id).all()

    def get_upcoming_meetings(self, db: Session) -> List[Meeting]:
        return db.query(Meeting).filter(Meeting.status == "scheduled").all()

class TaskRepository(BaseRepository[Task]):
    def get_by_assignee(self, db: Session, *, assignee_id: str) -> List[Task]:
        return db.query(Task).filter(Task.assignee_id == assignee_id).all()

    def get_by_creator(self, db: Session, *, creator_id: str) -> List[Task]:
        return db.query(Task).filter(Task.creator_id == creator_id).all()

    def get_by_source(self, db: Session, *, source: str) -> List[Task]:
        return db.query(Task).filter(Task.source_module == source).all()

class ReminderRepository(BaseRepository[Reminder]):
    def get_by_owner(self, db: Session, *, owner_id: str) -> List[Reminder]:
        return db.query(Reminder).filter(Reminder.owner_id == owner_id).all()

note_repo = NoteRepository(Note)
document_repo = DocumentRepository(Document)
meeting_repo = MeetingRepository(Meeting)
task_repo = TaskRepository(Task)
reminder_repo = ReminderRepository(Reminder)
