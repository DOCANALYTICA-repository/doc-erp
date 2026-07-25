from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user
from app.models.user import User
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
    return query.all()
