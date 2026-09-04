"""The daily digest: one email summarising everything waiting on a person.

Deliberately built on the SAME action queue the inbox renders, rather than a
second query of its own. Two implementations of "what needs you" would drift,
and the digest would start disagreeing with the screen it is meant to point at.

Triggered by an authenticated admin endpoint or a scheduled job (cron, a
platform scheduler) rather than an in-process timer — a timer inside a web
worker fires once per worker, so a three-worker deployment sends three copies.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.engines.action_queue import action_queue_engine
from app.services.engines.email import OutboundEmail, email_engine

logger = logging.getLogger("doc_portal.digest")

MAX_ITEMS_IN_DIGEST = 10


def _render(user: User, queue) -> Optional[OutboundEmail]:
    """Compose one person's digest, or None when there is nothing to say.

    Sending "you have 0 items" every morning is the fastest way to train
    someone to filter the address.
    """
    if queue.total == 0:
        return None

    overdue = [i for i in queue.items if i.urgency == "overdue"]
    lines = [f"{queue.total} item{'s' if queue.total != 1 else ''} need your attention."]
    if overdue:
        lines.append(f"{len(overdue)} of them {'is' if len(overdue) == 1 else 'are'} overdue.")
    lines.append("")

    for item in queue.items[:MAX_ITEMS_IN_DIGEST]:
        marker = {
            "overdue": "[OVERDUE] ", "today": "[TODAY] ", "soon": "[SOON] ", "normal": "",
        }[item.urgency]
        lines.append(f"  {marker}{item.title}")
        if item.subtitle:
            lines.append(f"      {item.subtitle}")

    remaining = queue.total - MAX_ITEMS_IN_DIGEST
    if remaining > 0:
        lines.append(f"\n  ...and {remaining} more.")

    return OutboundEmail(
        to=user.email,
        subject=(
            f"{queue.total} item{'s' if queue.total != 1 else ''} waiting on you"
            + (" — some overdue" if overdue else "")
        ),
        body="\n".join(lines),
        link_path="/app",
    )


def send_daily_digests(db: Session) -> dict:
    """Send to everyone who has opted in and actually has something waiting."""
    recipients = db.query(User).filter(
        User.email_daily_digest == True,  # noqa: E712 — SQL, not Python truthiness
        User.status == "active",
    ).all()

    sent = 0
    skipped_empty = 0

    for user in recipients:
        try:
            queue = action_queue_engine.build(db, user)
            message = _render(user, queue)
            if message is None:
                skipped_empty += 1
                continue
            if email_engine.send(message):
                sent += 1
        except Exception:  # noqa: BLE001 — one bad recipient must not stop the run
            logger.exception("digest_failed user=%s", user.id)

    logger.info(
        "digest_run recipients=%s sent=%s skipped_empty=%s",
        len(recipients), sent, skipped_empty,
    )
    return {"recipients": len(recipients), "sent": sent, "skipped_empty": skipped_empty}
