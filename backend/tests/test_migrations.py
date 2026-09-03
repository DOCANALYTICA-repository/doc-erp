"""The migration chain must actually run.

Four migrations existed for months and no test had ever executed one:
conftest.py builds its schema with Base.metadata.create_all(), which bypasses
Alembic entirely. `alembic upgrade head` was broken the whole time (an
ALTER TABLE ADD CONSTRAINT that SQLite cannot execute outside batch mode).

These tests run the chain against a throwaway database of their own so a
broken migration fails here rather than on a deploy.
"""
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _alembic(db_url: str, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": db_url}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR, env=env, capture_output=True, text=True,
    )


@pytest.fixture
def scratch_db(tmp_path):
    return f"sqlite:///{tmp_path / f'mig_{uuid.uuid4().hex[:8]}.db'}"


def test_upgrade_head_runs_clean(scratch_db):
    r = _alembic(scratch_db, "upgrade", "head")
    assert r.returncode == 0, f"alembic upgrade head failed:\n{r.stderr}"


def test_full_round_trip(scratch_db):
    """upgrade head -> downgrade base -> upgrade head, exit 0 each time."""
    for args in (("upgrade", "head"), ("downgrade", "base"), ("upgrade", "head")):
        r = _alembic(scratch_db, *args)
        assert r.returncode == 0, f"alembic {' '.join(args)} failed:\n{r.stderr}"


def test_no_drift_against_models(scratch_db):
    """The migration chain and Base.metadata must describe the same schema.

    Wave 3 adds a 56-index migration; landing that on a chain that has drifted
    from the models is how you get a schema nobody can reproduce.
    """
    assert _alembic(scratch_db, "upgrade", "head").returncode == 0
    r = _alembic(scratch_db, "check")
    assert r.returncode == 0, (
        "alembic check found drift between the migration chain and the models:\n"
        f"{r.stdout}\n{r.stderr}"
    )
