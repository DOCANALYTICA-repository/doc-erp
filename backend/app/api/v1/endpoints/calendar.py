from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user
from app.models.user import User
from app.services.engines.calendar import calendar_engine

router = APIRouter()

@router.get("")
def get_unified_calendar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Powers Faculty's unified calendar (PRD: teaching timetable + department
    meetings + club meetings + department events + personal tasks) and
    Clubs' shared calendar integration. Academic context (for timetable
    sessions) defaults to the current user's own profile rather than
    requiring the caller to know/pass it.
    """
    academic_context: Optional[dict] = None
    if current_user.programme and current_user.semester and current_user.section:
        academic_context = {
            "programme": current_user.programme,
            "semester": current_user.semester,
            "section": current_user.section,
        }
    return calendar_engine.get_unified_events(
        db,
        user_id=current_user.id,
        user_role=current_user.primary_role,
        academic_context=academic_context,
        current_user=current_user,
    )
