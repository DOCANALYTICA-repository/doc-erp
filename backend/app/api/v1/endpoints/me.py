"""Endpoints about the current user, across every module.

The platform was organised by module — Clubs, Claims, Faculty — and a person's
work is not. This router is where cross-module, person-centred views live.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import get_current_user
from app.models.user import User
from app.schemas.action_queue import ActionQueue
from app.services.engines.action_queue import action_queue_engine

router = APIRouter()


@router.get("/action-queue", response_model=ActionQueue)
def get_my_action_queue(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Everything waiting on this user, from every module, most urgent first.

    Nobody logs in wanting "the Clubs module" — they log in because something
    needs them. Every input for this already existed in the database and
    nothing aggregated it, which is the deeper reason the Faculty Coordinator
    never approved his club's annual plan: not that he could not navigate to
    it, but that nothing ever told him it was there.
    """
    return action_queue_engine.build(db, current_user)
