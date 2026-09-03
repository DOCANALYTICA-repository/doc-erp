"""The shape of "what needs me".

Nobody logs in wanting "the Clubs module" — they log in because something needs
them. Every input for this already existed in the database and nothing
aggregated it, which is the real reason BLK-01 went unnoticed for so long: the
Faculty Coordinator's problem was never navigation, it was that nothing ever
told him a plan was waiting.
"""
from typing import List, Literal, Optional

from pydantic import BaseModel

ActionKind = Literal[
    "claim_review",
    "annual_plan_review",
    "task_due",
    "meeting_without_minutes",
    "reimbursement_review",
]

Urgency = Literal["overdue", "today", "soon", "normal"]


class ActionItem(BaseModel):
    """One thing waiting on this user."""
    id: str
    kind: ActionKind
    title: str
    subtitle: str = ""

    # Where this lives, so a card can navigate straight to it instead of
    # naming a reference number in prose and leaving the user to go looking.
    entity_type: str
    entity_id: str
    href: str

    urgency: Urgency = "normal"
    due_date: Optional[str] = None
    waiting_since: Optional[str] = None

    # Whether this item can be resolved inline, without leaving the queue.
    can_approve_inline: bool = False
    approve_href: Optional[str] = None


class ActionQueue(BaseModel):
    items: List[ActionItem] = []
    total: int = 0
    counts_by_kind: dict = {}
