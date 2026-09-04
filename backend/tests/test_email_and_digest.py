"""Notifications that reach people outside the app.

"The approval workflows depend on people noticing, and nothing currently
reaches them outside the app." That was the root cause behind BLK-01: the
Faculty Coordinator's problem was never navigation, it was that nothing ever
told him a plan was waiting.
"""
import pytest

from app.services.engines import email as email_module

from .conftest import auth_headers

PRESIDENT = ("student.president@christuniversity.in", "student123")
COORDINATOR = ("faculty.accounting@christuniversity.in", "faculty123")
HOD = ("hod.commerce@christuniversity.in", "faculty123")
STUDENT = ("student.regular@christuniversity.in", "student123")


@pytest.fixture
def outbox(monkeypatch):
    """Capture what would have been sent, without an SMTP server."""
    sent = []

    def _capture(message):
        sent.append(message)
        return True

    monkeypatch.setattr(email_module.email_engine, "send", _capture)
    return sent


def test_submitting_a_plan_emails_the_reviewer_not_just_the_club(client, outbox):
    """Submitting used to notify the CLUB — the people who had just submitted
    it — and tell the reviewer nothing at all."""
    from app.core.database import SessionLocal
    from app.models.club import AnnualPlan

    db = SessionLocal()
    try:
        plan = AnnualPlan(
            id="aplan_email_test", club_id="club_commerce", academic_year="2026-2027",
            vision="Test vision", status="draft", submitted_by="std_president",
        )
        db.add(plan)
        db.commit()
    finally:
        db.close()

    r = client.post(
        "/api/v1/clubs/annual-plans/aplan_email_test/submit",
        headers=auth_headers(client, *PRESIDENT),
    )
    assert r.status_code == 200, r.text

    # faculty.accounting is the assigned coordinator for club_commerce.
    recipients = {m.to for m in outbox}
    assert "faculty.accounting@christuniversity.in" in recipients, (
        f"the reviewer was not emailed; only {recipients} were"
    )

    message = next(m for m in outbox if m.to == "faculty.accounting@christuniversity.in")
    assert "Commerce Club" in message.subject
    # The email has to lead somewhere.
    assert message.link_path


def test_a_user_who_opts_out_is_not_emailed(client, outbox):
    """Email you cannot turn off gets filtered wholesale — including the
    messages that actually needed you."""
    h = auth_headers(client, *COORDINATOR)
    r = client.put("/api/v1/me/notification-preferences", headers=h, json={
        "email_on_action_required": False, "email_daily_digest": False,
    })
    assert r.status_code == 200, r.text

    try:
        from app.core.database import SessionLocal
        from app.models.club import AnnualPlan

        db = SessionLocal()
        try:
            db.add(AnnualPlan(
                id="aplan_optout_test", club_id="club_commerce", academic_year="2027-2028",
                vision="v", status="draft", submitted_by="std_president",
            ))
            db.commit()
        finally:
            db.close()

        outbox.clear()
        client.post(
            "/api/v1/clubs/annual-plans/aplan_optout_test/submit",
            headers=auth_headers(client, *PRESIDENT),
        )
        assert "faculty.accounting@christuniversity.in" not in {m.to for m in outbox}
    finally:
        client.put("/api/v1/me/notification-preferences", headers=h, json={
            "email_on_action_required": True, "email_daily_digest": False,
        })


def test_action_required_email_defaults_to_on(client):
    """An opt-IN default would leave exactly the problem this solves."""
    r = client.get("/api/v1/me/notification-preferences", headers=auth_headers(client, *HOD))
    assert r.status_code == 200
    assert r.json()["email_on_action_required"] is True
    # ...and the digest defaults OFF: an unasked-for daily email teaches
    # people to filter the address.
    assert r.json()["email_daily_digest"] is False


def test_digest_is_not_sent_to_someone_with_an_empty_queue(client, outbox):
    """"You have 0 items" every morning is the fastest way to get filtered."""
    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        # A student with nothing awaiting review.
        user = db.query(User).filter(User.id == "std_regular_2").first()
        user.email_daily_digest = True
        db.add(user)
        db.commit()
    finally:
        db.close()

    outbox.clear()
    r = client.post("/api/v1/me/send-daily-digests", headers=auth_headers(client, "admin@christuniversity.in", "admin123"))
    assert r.status_code == 200, r.text

    assert "student.regular2@christuniversity.in" not in {m.to for m in outbox}
    assert r.json()["skipped_empty"] >= 1


def test_digest_summarises_what_is_waiting(client, outbox):
    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "faculty.accounting@christuniversity.in").first()
        user.email_daily_digest = True
        db.add(user)
        db.commit()
    finally:
        db.close()

    outbox.clear()
    r = client.post(
        "/api/v1/me/send-daily-digests",
        headers=auth_headers(client, "admin@christuniversity.in", "admin123"),
    )
    assert r.status_code == 200, r.text

    digest = next(
        (m for m in outbox if m.to == "faculty.accounting@christuniversity.in"), None,
    )
    assert digest is not None, "the coordinator has items waiting but got no digest"
    assert "waiting on you" in digest.subject
    assert digest.link_path == "/app"


def test_only_an_admin_can_trigger_the_digest_run(client):
    r = client.post("/api/v1/me/send-daily-digests", headers=auth_headers(client, *STUDENT))
    assert r.status_code == 403


def test_delivery_failure_never_fails_the_request(client, monkeypatch):
    """A claim that was successfully submitted must not 500 because an SMTP
    host was slow."""
    def _explode(message):
        raise RuntimeError("SMTP unreachable")

    monkeypatch.setattr(email_module.email_engine, "send", _explode)

    from app.core.database import SessionLocal
    from app.models.club import AnnualPlan

    db = SessionLocal()
    try:
        db.add(AnnualPlan(
            id="aplan_smtp_down", club_id="club_commerce", academic_year="2028-2029",
            vision="v", status="draft", submitted_by="std_president",
        ))
        db.commit()
    finally:
        db.close()

    r = client.post(
        "/api/v1/clubs/annual-plans/aplan_smtp_down/submit",
        headers=auth_headers(client, *PRESIDENT),
    )
    assert r.status_code == 200, "a dead mail server broke the workflow"


def test_unconfigured_smtp_logs_instead_of_sending(client, caplog):
    """With no SMTP host — every dev machine and CI — the engine logs what it
    WOULD have sent, so the path stays exercised rather than rotting."""
    from app.services.engines.email import OutboundEmail, email_engine

    assert email_engine.is_configured is False
    with caplog.at_level("INFO", logger="doc_portal.email"):
        assert email_engine.send(OutboundEmail(
            to="someone@christuniversity.in", subject="Subject line", body="Body text",
        )) is False

    assert "Subject line" in caplog.text
    assert "Body text" in caplog.text
