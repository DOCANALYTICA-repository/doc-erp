"""Short-lived access tokens with a working refresh path, and real revocation.

The access token used to live for EIGHT DAYS. A JWT is valid until it expires
and there was no jti, so a leaked one was a week-long session that nothing
could end — not a password change, not an admin, nothing.

The plan refused to ship the 30-minute lifetime without the refresh path,
because that would log everyone out mid-task. These tests cover the pair.
"""
from datetime import datetime, timedelta, timezone

import pytest

from .conftest import auth_headers

STUDENT = ("student.regular@christuniversity.in", "student123")


def _login(client, creds=STUDENT):
    r = client.post("/api/v1/auth/login", data={"username": creds[0], "password": creds[1]})
    assert r.status_code == 200, r.text
    return r.json()


def test_login_returns_both_tokens_and_a_short_access_lifetime(client):
    body = _login(client)
    assert body["access_token"]
    assert body["refresh_token"], "login issued no refresh token"
    # 30 minutes, not 8 days.
    assert body["expires_in"] == 30 * 60


def test_refresh_returns_a_working_access_token(client):
    body = _login(client)

    r = client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert r.status_code == 200, r.text
    refreshed = r.json()

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {refreshed['access_token']}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == STUDENT[0]


def test_refresh_rotates_the_token(client):
    body = _login(client)
    first = body["refresh_token"]

    second = client.post("/api/v1/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]
    assert second != first, "the refresh token was not rotated"

    # The new one works.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": second}).status_code == 200


def test_reusing_a_rotated_token_kills_the_whole_family(client):
    """Rotation is what makes a stolen refresh token DETECTABLE: the thief and
    the real user cannot both keep using it. On the second presentation we do
    not know which party is which, so both must sign in again."""
    body = _login(client)
    first = body["refresh_token"]

    second = client.post("/api/v1/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]

    # Replaying the old token.
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert replay.status_code == 401, replay.text

    # ...and the token that replaced it is now dead too.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": second}).status_code == 401


def test_a_refresh_token_cannot_authenticate_a_request(client):
    """A validly-signed token minted for another purpose must not be accepted
    as an access token."""
    body = _login(client)
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['refresh_token']}"})
    assert r.status_code == 401


def test_logout_ends_that_session_only(client):
    a = _login(client)
    b = _login(client)

    assert client.post("/api/v1/auth/logout", json={"refresh_token": a["refresh_token"]}).status_code == 200

    # Session A is dead...
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": a["refresh_token"]}).status_code == 401
    # ...and session B, on another device, is untouched.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": b["refresh_token"]}).status_code == 200


def test_logout_everywhere_ends_every_session(client):
    """The thing a bare JWT can never do."""
    a = _login(client)
    b = _login(client)

    r = client.post(
        "/api/v1/auth/logout-all",
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["sessions_ended"] >= 2

    for session in (a, b):
        assert client.post(
            "/api/v1/auth/refresh", json={"refresh_token": session["refresh_token"]}
        ).status_code == 401


def test_logout_works_without_a_valid_access_token(client):
    """Someone whose access token has already expired must still be able to
    sign out — otherwise the refresh token outlives them by a fortnight."""
    body = _login(client)
    r = client.post("/api/v1/auth/logout", json={"refresh_token": body["refresh_token"]})
    assert r.status_code == 200


def test_an_expired_refresh_token_is_refused(client):
    body = _login(client)

    from app.core.database import SessionLocal
    from app.core.security import split_refresh_token
    from app.models.refresh_token import RefreshToken

    jti, _ = split_refresh_token(body["refresh_token"])
    db = SessionLocal()
    try:
        row = db.query(RefreshToken).filter(RefreshToken.id == jti).first()
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.add(row)
        db.commit()
    finally:
        db.close()

    assert client.post(
        "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}
    ).status_code == 401


def test_a_forged_secret_on_a_real_jti_is_refused(client):
    """The jti is looked up directly, so the SECRET half has to be checked —
    otherwise knowing an id would be enough."""
    body = _login(client)
    from app.core.security import split_refresh_token

    jti, _ = split_refresh_token(body["refresh_token"])
    forged = f"{jti}.not-the-real-secret"

    assert client.post("/api/v1/auth/refresh", json={"refresh_token": forged}).status_code == 401


def test_the_database_never_stores_the_token_itself(client):
    """A leak of this table must not hand out working sessions."""
    body = _login(client)

    from app.core.database import SessionLocal
    from app.models.refresh_token import RefreshToken

    db = SessionLocal()
    try:
        rows = db.query(RefreshToken).all()
        stored = {r.token_hash for r in rows}
        assert body["refresh_token"] not in stored
        assert all(len(h) == 64 for h in stored), "not a SHA-256 hex digest"
    finally:
        db.close()


def test_a_deactivated_account_cannot_refresh(client):
    """A short access lifetime only buys something if a disabled account stops
    being able to mint new ones."""
    body = _login(client, ("student.regular2@christuniversity.in", "student123"))

    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "student.regular2@christuniversity.in").first()
        user.status = "inactive"
        db.add(user)
        db.commit()
    finally:
        db.close()

    try:
        assert client.post(
            "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}
        ).status_code == 401
    finally:
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == "student.regular2@christuniversity.in").first()
            user.status = "active"
            db.add(user)
            db.commit()
        finally:
            db.close()


def test_signing_out_one_device_does_not_sign_out_the_others(client):
    """The distinction that matters: a token revoked by LOGOUT being presented
    again is a stale tab, not a theft. Treating it as theft would mean signing
    out on your phone silently signed you out on your laptop."""
    laptop = _login(client)
    phone = _login(client)

    client.post("/api/v1/auth/logout", json={"refresh_token": laptop["refresh_token"]})
    # A stale tab on the laptop retries.
    assert client.post(
        "/api/v1/auth/refresh", json={"refresh_token": laptop["refresh_token"]}
    ).status_code == 401

    # The phone is still signed in.
    assert client.post(
        "/api/v1/auth/refresh", json={"refresh_token": phone["refresh_token"]}
    ).status_code == 200
