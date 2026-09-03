from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db_readonly as get_db  # read-only: no BEGIN/ROLLBACK round trips
from app.core.rbac import get_current_user
from app.models.user import User
from app.core import visibility
from app.schemas.user import UserDirectoryOut

router = APIRouter()

@router.get("/directory", response_model=List[UserDirectoryOut])
def get_faculty_directory(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Faculty Directory (Phase 6) — previously 100% hardcoded static JSX on
    the frontend with zero backing endpoint anywhere. Search by name,
    designation, or role tags per the Faculty PRD.
    """
    query = db.query(User).filter(User.primary_role == "faculty")
    if q:
        term = f"%{q}%"
        query = query.filter(
            (User.name.ilike(term)) | (User.designation.ilike(term)) | (User.role_tags_str.ilike(term))
        )
    faculty = query.order_by(User.name).all()

    # A student looking up who teaches what does not need every faculty
    # member's personal phone number and office hours. Colleagues do.
    if visibility.is_faculty_side(current_user):
        return faculty

    return [
        UserDirectoryOut(
            id=u.id,
            name=u.name,
            email=u.email,
            designation=u.designation,
            role_tags_str=u.role_tags_str or "",
            bio=u.bio,
            availability_status=u.availability_status or "available",
        )
        for u in faculty
    ]
