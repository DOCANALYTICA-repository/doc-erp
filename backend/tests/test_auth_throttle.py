"""Login is rate limited, and the failure path does not leak which accounts exist.

The limiter is disabled for the rest of the suite (see app/core/rate_limit.py)
because a 5/minute cap would break the ~40 auth_headers() calls elsewhere for
reasons unrelated to what those tests assert. It is re-enabled here.
"""
import pytest

from .conftest import auth_headers


@pytest.fixture
def throttled_client(monkeypatch):
    from fastapi.testclient import TestClient
    from app.core import rate_limit
    from app.main import app

    monkeypatch.setattr(rate_limit.limiter, "enabled", True)
    rate_limit.limiter.reset()
    client = TestClient(app, follow_redirects=False)
    yield client
    rate_limit.limiter.reset()


def _attempt(client, password="wrong-password"):
    return client.post("/api/v1/auth/login", data={
        "username": "admin@christuniversity.in", "password": password,
    })


def test_login_is_throttled_after_five_attempts(throttled_client):
    codes = [_attempt(throttled_client).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5, codes
    assert codes[5] == 429, f"6th attempt was not throttled: {codes}"


def test_unknown_email_and_wrong_password_are_indistinguishable(client):
    """authenticate() used to return before running bcrypt for an unknown
    address — a timing oracle for enumerating valid accounts."""
    unknown = client.post("/api/v1/auth/login", data={
        "username": "nobody.at.all@christuniversity.in", "password": "whatever",
    })
    known = client.post("/api/v1/auth/login", data={
        "username": "admin@christuniversity.in", "password": "definitely-wrong",
    })
    assert unknown.status_code == known.status_code == 400
    assert unknown.json()["detail"] == known.json()["detail"]
