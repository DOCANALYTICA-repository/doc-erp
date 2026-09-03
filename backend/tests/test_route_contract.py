"""Every URL the frontend actually calls, pinned against the real route table.

Every blocker in the field audit lives in the seam between the backend and the
UI, and nothing tested that seam. The paths below were extracted from the
`api.*` call sites in Workspace-Hub/src — they are the literal strings the
browser will request.

The assertion is deliberately weak on purpose: not "returns 200", just "is a
route that exists at exactly this path". A 307 means the client pays a second
round trip (and, because every call carries an Authorization header, a second
CORS preflight — four legs for one request). A 404 means the client is calling
a path that was never there.
"""
import pytest

from .conftest import auth_headers

# (method, path) exactly as the frontend sends it.
FRONTEND_ROUTES = [
    ("GET", "/api/v1/auth/me"),
    ("GET", "/api/v1/claims"),
    ("POST", "/api/v1/claims"),
    ("GET", "/api/v1/clubs"),
    ("GET", "/api/v1/clubs/my-memberships"),
    ("GET", "/api/v1/tasks"),
    ("GET", "/api/v1/notifications"),
    ("GET", "/api/v1/calendar"),
    ("GET", "/api/v1/search?q=ab"),
    ("GET", "/api/v1/users/directory"),
    ("GET", "/api/v1/content/statistics"),
    ("GET", "/api/v1/content/courses"),
    ("GET", "/api/v1/content/gallery"),
    ("GET", "/api/v1/content/clubs-showcase"),
    ("GET", "/api/v1/faculty/notes"),
    ("GET", "/api/v1/faculty/reminders"),
    ("GET", "/api/v1/faculty/meetings"),
    ("GET", "/api/v1/faculty/documents"),
]

# Paths the frontend sends with a trailing slash today. They must resolve too —
# the fix for the 307s redirects inward to the canonical path rather than
# turning these into 404s, because these are live callers.
LEGACY_SLASHED_ROUTES = [
    ("GET", "/api/v1/calendar/"),
    ("GET", "/api/v1/clubs/"),
]


@pytest.fixture(scope="module")
def headers(client_module):
    return auth_headers(client_module, "admin@christuniversity.in", "admin123")


@pytest.fixture(scope="module")
def client_module():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app, follow_redirects=False)


@pytest.mark.parametrize("method,path", FRONTEND_ROUTES, ids=lambda v: str(v))
def test_frontend_path_is_canonical(client_module, headers, method, path):
    r = client_module.request(method, path, headers=headers)
    assert r.status_code != 404, f"{method} {path} is not a route at all"
    assert r.status_code not in (307, 308), (
        f"{method} {path} redirects to {r.headers.get('location')!r}. "
        "The frontend pays an extra round trip (plus a CORS preflight, since "
        "the call carries an Authorization header). Declare the route at '' "
        "rather than '/' so the prefixed path is canonical."
    )


@pytest.mark.parametrize("method,path", LEGACY_SLASHED_ROUTES, ids=lambda v: str(v))
def test_legacy_slashed_path_still_resolves(client_module, headers, method, path):
    """These must never become 404s while callers still send them."""
    r = client_module.request(method, path, headers=headers, follow_redirects=True)
    assert r.status_code != 404, f"{method} {path} broke a live caller"
