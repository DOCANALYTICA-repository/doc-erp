"""The department's calendar date.

Yellow-form rules turn on calendar days ("before the event starts", "once the
event is over"), and the department keeps Indian time. The server's own clock
is UTC in production, which is still the previous day until 05:30 IST — so a
naive date.today() would let a form be approved on the morning of its event.

Callers use `clock.today()` (attribute access on the module, never
`from app.core.clock import today`) so a test can move time with a single
monkeypatch.setattr(clock, "today", ...).
"""
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def today() -> date:
    return datetime.now(IST).date()
