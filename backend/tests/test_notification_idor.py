"""A user must not be able to touch another user's notifications.

The endpoint injected current_user and never used it; the repository filtered
on Notification.id alone. Reproduced against the seed: a Class Teacher marked
std_president's notification read and got 200 — a silent way to suppress
somebody else's approval prompts.
"""
import uuid

import pytest

from .conftest import auth_headers

VICTIM = ("student.president@christuniversity.in", "123")
ATTACKER = ("teacher.class@christuniversity.in", "123")


@pytest.fixture
def notify():
    """Create a fresh unread notification for a user, directly.

    Not via a workflow: these tests are about the notification routes, and
    depending on a claims side effect would make them fail for unrelated
    reasons.
    """
    from app.core.database import SessionLocal
    from app.services.engines.notification import notification_engine

    created = []

    def _make(user_id: str) -> str:
        db = SessionLocal()
        try:
            n = notification_engine.send_notification(
                db,
                user_id=user_id,
                title=f"Test notification {uuid.uuid4().hex[:6]}",
                content="Body",
                source_module="system",
            )
            created.append(n.id)
            return n.id
        finally:
            db.close()

    return _make


def test_cannot_mark_another_users_notification_read(client, notify):
    target_id = notify("std_president")

    attacker_h = auth_headers(client, *ATTACKER)
    r = client.post(f"/api/v1/notifications/{target_id}/read", headers=attacker_h)

    # 404, not 403: a 403 would confirm the id exists.
    assert r.status_code == 404, r.text

    victim_h = auth_headers(client, *VICTIM)
    after = client.get("/api/v1/notifications", headers=victim_h).json()
    assert any(n["id"] == target_id for n in after), "the notification was marked read anyway"


def test_owner_can_still_mark_their_own_read(client, notify):
    target_id = notify("std_president")
    h = auth_headers(client, *VICTIM)

    assert client.post(f"/api/v1/notifications/{target_id}/read", headers=h).status_code == 200
    after = client.get("/api/v1/notifications", headers=h).json()
    assert not any(n["id"] == target_id for n in after)


def test_unread_count_is_server_supplied_and_read_all_works(client, notify):
    notify("std_vp")
    notify("std_vp")
    h = auth_headers(client, "student.vp@christuniversity.in", "123")

    count = client.get("/api/v1/notifications/unread-count", headers=h).json()["unread"]
    assert count >= 2
    assert count == len(client.get("/api/v1/notifications", headers=h).json())

    client.post("/api/v1/notifications/read-all", headers=h)
    assert client.get("/api/v1/notifications/unread-count", headers=h).json()["unread"] == 0
