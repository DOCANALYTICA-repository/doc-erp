"""
Forces every test run onto an isolated, disposable SQLite file — NEVER the
real Supabase DB configured in backend/.env for local dev. This must set
the environment before any `app.*` module is imported anywhere (imports
happen lazily inside fixtures/tests specifically to guarantee this).
"""
import os
import uuid

TEST_DB_PATH = f"./test_{uuid.uuid4().hex[:8]}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ.setdefault("SECRET_KEY", "pytest-only-secret-key")
os.environ.setdefault("BACKEND_CORS_ORIGINS", '["http://localhost:3000"]')
os.environ["SUPABASE_URL"] = "http://localhost:0"  # never actually called in tests
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "unused-in-tests"

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _setup_schema_and_seed():
    from app.core.database import engine
    from app.models import Base
    from app.db.seed import reset_schema, seed_database

    reset_schema()
    seed_database()
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    # Redirects are NOT followed: a 307 from a slash-mismatched route is a real
    # defect that the frontend pays four round trips for. Tests that genuinely
    # want to follow a redirect should pass follow_redirects=True per call.
    return TestClient(app, follow_redirects=False)


def auth_headers(client, username: str, password: str) -> dict:
    r = client.post("/api/v1/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
