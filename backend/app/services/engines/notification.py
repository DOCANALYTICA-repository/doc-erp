"""In-app notifications, and delivering the ones that need acting on by email."""
import logging
import uuid

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.services.engines.email import OutboundEmail, email_engine

logger = logging.getLogger("doc_portal.notifications")


def notification_link_path(notification: Notification) -> str | None:
    """Where this notification's subject actually lives in the app.

    Mirrors the client's destinationFor(). Both exist because a notification
    that names a reference number in prose and stops there leaves the reader
    to go hunting.
    """
    entity_type, entity_id = notification.entity_type, notification.entity_id
    if not entity_type or not entity_id:
        return None
    return {
        "claim": f"/app/claims/my_claims?claim={entity_id}",
        "annual_plan": "/app/clubs/annual-plan",
        "club": f"/app/clubs/dashboard?club={entity_id}",
        "task": "/app/faculty/tasks",
        "meeting": "/app/faculty/meetings",
    }.get(entity_type)


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
        #: Whether this warrants reaching the person outside the app. False
        #: for purely informational updates, which would otherwise train
        #: people to filter the ones that matter.
        email_recipient: bool = False,
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

        if email_recipient:
            self._email_if_wanted(db, db_notif)

        return db_notif

    def _email_if_wanted(self, db: Session, notification: Notification) -> None:
        """Deliver outside the app, if this user wants that.

        Wrapped end to end: a notification row that was written successfully
        must not be undone because a mail server was unreachable. The engine
        already swallows its own failures; this guards the lookup too.
        """
        try:
            user = db.query(User).filter(User.id == notification.user_id).first()
            if user is None or not user.email:
                return
            if not user.email_on_action_required:
                return

            email_engine.send(OutboundEmail(
                to=user.email,
                subject=notification.title,
                body=notification.content or notification.title,
                link_path=notification_link_path(notification),
            ))
        except Exception:  # noqa: BLE001 — delivery must never fail the caller
            logger.exception("notification_email_failed notification=%s", notification.id)

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
