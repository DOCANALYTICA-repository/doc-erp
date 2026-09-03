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
    success = notification_engine.mark_as_read(db, notification_id=notification_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}
