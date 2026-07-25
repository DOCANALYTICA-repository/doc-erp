import uuid
from sqlalchemy.orm import Session
from app.models.notification import Notification

class NotificationEngine:
    def send_notification(
        self,
        db: Session,
        *,
        user_id: str,
        title: str,
        content: str,
        source_module: str,
        task_id: str = None
    ) -> Notification:
        """
        Dispatches a system or workspace-level notification to a user.
        Can be easily extended to email / SMS channels in production.
        """
        notification_in = {
            "id": f"notif_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "title": title,
            "content": content,
            "source_module": source_module,
            "task_id": task_id,
            "is_read": False
        }
        
        db_notif = Notification(**notification_in)
        db.add(db_notif)
        db.commit()
        db.refresh(db_notif)
        return db_notif

    def mark_as_read(self, db: Session, *, notification_id: str) -> bool:
        db_notif = db.query(Notification).filter(Notification.id == notification_id).first()
        if db_notif:
            db_notif.is_read = True
            db.add(db_notif)
            db.commit()
            return True
        return False

    def get_unread_for_user(self, db: Session, *, user_id: str) -> list[Notification]:
        return db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).all()

notification_engine = NotificationEngine()
