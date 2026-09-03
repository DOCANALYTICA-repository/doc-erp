from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user
from app.schemas.notification import NotificationOut
from app.models.user import User
from app.services.engines.notification import notification_engine

router = APIRouter()

@router.get("", response_model=List[NotificationOut])
def get_user_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return notification_engine.get_unread_for_user(db, user_id=current_user.id)

@router.post("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 404 rather than 403 on someone else's notification: a 403 would confirm
    # the id exists, which is exactly what an enumeration attempt wants.
    success = notification_engine.mark_as_read(
        db, notification_id=notification_id, user_id=current_user.id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    updated = notification_engine.mark_all_read_for_user(db, user_id=current_user.id)
    return {"status": "success", "marked_read": updated}


@router.get("/unread-count")
def get_unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Server-supplied unread count.

    The badge used to test `!n.is_read` on a list the server had already
    filtered to unread — tautological, and it drifted the moment anything
    was marked read without a refetch.
    """
    return {"unread": notification_engine.unread_count_for_user(db, user_id=current_user.id)}
