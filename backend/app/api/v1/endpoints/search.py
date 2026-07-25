from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user
from app.models.user import User
from app.services.engines.search import search_engine

router = APIRouter()

@router.get("/")
def global_search(q: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return search_engine.global_search(db, query=q, user_id=current_user.id)
