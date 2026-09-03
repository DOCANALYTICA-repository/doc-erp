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
        task_id: str = None,
        entity_type: str = None,
        entity_id: str = None,
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
            "entity_type": entity_type,
            "entity_id": entity_id,
            "is_read": False
        }
        
        db_notif = Notification(**notification_in)
        db.add(db_notif)
        db.commit()
        db.refresh(db_notif)
        return db_notif

    def mark_as_read(self, db: Session, *, notification_id: str, user_id: str) -> bool:
        """Mark one notification read. user_id is REQUIRED and is part of the
        lookup, not a check performed afterwards.

        Without it this was an IDOR: the endpoint injected current_user and
        never used it, so any authenticated user could mark any other user's
        notification read by id — silently suppressing someone else's approval
        prompts. The caller returns 404 rather than 403 on a miss, so the
        response cannot be used to probe which ids exist.
        """
        db_notif = db.query(Notification).filter(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        ).first()
        if db_notif:
            db_notif.is_read = True
            db.add(db_notif)
            db.commit()
            return True
        return False

    def get_unread_for_user(self, db: Session, *, user_id: str, limit: int = 50) -> list[Notification]:
        return db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False
        ).order_by(Notification.created_at.desc()).limit(limit).all()

    def mark_all_read_for_user(self, db: Session, *, user_id: str) -> int:
        updated = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
        ).update({Notification.is_read: True}, synchronize_session=False)
        db.commit()
        return updated

    def unread_count_for_user(self, db: Session, *, user_id: str) -> int:
        return db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.is_read == False,
        ).count()

notification_engine = NotificationEngine()
