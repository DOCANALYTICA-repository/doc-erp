"""Endpoints about the current user, across every module.

The platform was organised by module — Clubs, Claims, Faculty — and a person's
work is not. This router is where cross-module, person-centred views live.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user
from app.models.user import User
from app.schemas.action_queue import ActionQueue
from app.schemas.pipeline import Pipeline
from app.schemas.user import NotificationPreferences
from app.services.digest import send_daily_digests
from app.services.engines.action_queue import action_queue_engine
from app.services.engines.pipeline import pipeline_engine

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


@router.get("/notification-preferences", response_model=NotificationPreferences)
def get_notification_preferences(current_user: User = Depends(get_current_user)):
    return NotificationPreferences(
        email_on_action_required=current_user.email_on_action_required,
        email_daily_digest=current_user.email_daily_digest,
    )


@router.put("/notification-preferences", response_model=NotificationPreferences)
def update_notification_preferences(
    body: NotificationPreferences,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Let people turn email off.

    A system that emails you about things you did not ask to hear about, with
    no way to stop it, gets filtered wholesale — including the messages that
    actually needed you.
    """
    user = db.query(User).filter(User.id == current_user.id).first()
    user.email_on_action_required = body.email_on_action_required
    user.email_daily_digest = body.email_daily_digest
    db.add(user)
    db.commit()
    db.refresh(user)
    return NotificationPreferences(
        email_on_action_required=user.email_on_action_required,
        email_daily_digest=user.email_daily_digest,
    )


@router.post("/send-daily-digests")
def trigger_daily_digests(
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["rbac:assign_roles"])),
):
    """Run the digest.

    An endpoint rather than an in-process timer: a timer inside a web worker
    fires once PER WORKER, so a three-worker deployment sends three copies of
    every digest. Point a scheduler at this instead.
    """
    return send_daily_digests(db)


@router.get("/pipeline", response_model=Pipeline)
def get_workflow_pipeline(
    db: Session = Depends(get_db),
    # Department oversight, not personal work: whoever approves plans or
    # coordinates a programme is who this is for.
    current_user: User = Depends(PermissionChecker(
        ["claims:approve_coordinator", "clubs:approve_plan", "rbac:assign_roles"],
        require_all=False,
    )),
):
    """Where every item in both workflows is stuck, and for how long.

    The claim state machine and the annual-plan state machine both worked and
    neither was visible in aggregate: you could ask how ONE claim was doing,
    and nothing could tell you that six had been sitting at subject-faculty
    review for a fortnight.

    SLA days are per STAGE, because that is where work stalls — and the stage
    that stalls is the one with many possible reviewers and therefore nobody
    who feels responsible.
    """
    return pipeline_engine.build(db, current_user)
