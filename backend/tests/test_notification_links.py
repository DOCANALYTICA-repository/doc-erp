"""Yellow-form notifications lead to the form they are about.

notification_link_path() is the server's copy of the client's destinationFor()
in Workspace-Hub/src/routes/NotificationTray.tsx. Without an entry, an emailed
"needs your approval" arrives with no link and the reviewer has to go looking.
"""
import pytest


@pytest.mark.parametrize("entity_type,entity_id,expected", [
    ("pre_approval", "paf_da_2", "/app/claims/yellow_forms?open=paf_da_2"),
    ("claim_sheet", "ccs_da_7", "/app/claims/yellow_forms?open=ccs_da_7"),
    # Encoded as the client's encodeURIComponent does, so both build the same URL.
    ("pre_approval", "paf a&b", "/app/claims/yellow_forms?open=paf%20a%26b"),
])
def test_a_yellow_form_notification_opens_the_form_in_claims(entity_type, entity_id, expected):
    from app.models.notification import Notification
    from app.services.engines.notification import notification_link_path

    notification = Notification(entity_type=entity_type, entity_id=entity_id)
    assert notification_link_path(notification) == expected


def test_every_seeded_yellow_form_notification_has_a_link():
    from app.core.database import SessionLocal
    from app.models.notification import Notification
    from app.services.engines.notification import notification_link_path

    db = SessionLocal()
    try:
        rows = db.query(Notification).filter(
            Notification.entity_type.in_(["pre_approval", "claim_sheet"]),
        ).all()
        assert rows, "the seed has yellow-form notifications to check"
        for row in rows:
            assert notification_link_path(row) == f"/app/claims/yellow_forms?open={row.entity_id}", row.id
    finally:
        db.close()


def test_the_email_for_a_claim_sheet_links_to_it(monkeypatch):
    from app.core.database import SessionLocal
    from app.services.engines import email as email_module
    from app.services.engines.notification import notification_engine

    sent = []
    monkeypatch.setattr(email_module.email_engine, "send", lambda message: sent.append(message) or True)

    db = SessionLocal()
    try:
        notification = notification_engine.send_notification(
            db,
            user_id="fac_sharath",
            title="DOC Analytica claim sheet needs your review",
            content="Link check.",
            source_module="claims",
            entity_type="claim_sheet",
            entity_id="ccs_da_7",
            email_recipient=True,
        )
        try:
            assert [m.to for m in sent] == ["sharath@christuniversity.in"]
            assert sent[0].link_path == "/app/claims/yellow_forms?open=ccs_da_7"
        finally:
            db.delete(notification)
            db.commit()
    finally:
        db.close()
