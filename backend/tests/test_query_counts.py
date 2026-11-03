"""Guard against N+1 regressions by counting the SQL a request actually issues.

This is Wave 3's own gate: "Assert SQL counts per endpoint in a test so a
future N+1 fails CI."

Every N+1 in this codebase was invisible until someone measured it, because an
N+1 is not a bug you can see — the endpoint returns the right answer, just far
slower once there is real data. A test that says "this endpoint runs at most N
queries" turns a silent performance cliff into a failing build.

The budgets are deliberately a little above the current counts. They exist to
catch a query issued PER ROW, not to freeze the implementation: adding one
query is fine, adding one query per member is what this stops.
"""
import pytest
from sqlalchemy import event

from app.core.database import engine

from .conftest import auth_headers

PRESIDENT = ("student.president@christuniversity.in", "123")
COORDINATOR = ("faculty.accounting@christuniversity.in", "123")
STUDENT = ("student.regular@christuniversity.in", "123")
HOD = ("hod.commerce@christuniversity.in", "123")


class QueryCounter:
    """Counts statements issued against the engine while active."""

    def __init__(self):
        self.statements: list[str] = []

    def __enter__(self):
        event.listen(engine, "before_cursor_execute", self._record)
        return self

    def __exit__(self, *exc):
        event.remove(engine, "before_cursor_execute", self._record)
        return False

    def _record(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement)

    @property
    def selects(self) -> int:
        return sum(1 for s in self.statements if s.lstrip().upper().startswith("SELECT"))

    def report(self) -> str:
        return "\n".join(
            f"  {i + 1}. {s.strip().splitlines()[0][:110]}"
            for i, s in enumerate(self.statements)
        )


def assert_query_budget(client, method: str, path: str, headers: dict, budget: int):
    with QueryCounter() as counter:
        response = client.request(method, path, headers=headers)

    assert response.status_code == 200, response.text
    assert counter.selects <= budget, (
        f"{method} {path} issued {counter.selects} SELECTs; the budget is {budget}.\n"
        f"That is the shape of an N+1 — one query per row rather than per request.\n"
        f"{counter.report()}"
    )
    return counter


# (label, method, path, credentials, budget)
BUDGETS = [
    # The workspace shell. It replaced THIRTEEN requests; if it also became
    # thirteen queries the win would be illusory.
    # Was 25 before capability resolution stopped re-running the same
    # membership and hierarchy lookups five and six times each; now 16.
    ("club bootstrap", "GET", "/api/v1/clubs/club_commerce/bootstrap", PRESIDENT, 18),

    # The one that BLK-04 was really about: TimetableSessionOut.faculty_name is
    # a relationship property, so without selectinload this is one SELECT per
    # timetabled hour.
    ("timetable", "GET", "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A", STUDENT, 6),

    # Claims carry participants, each carrying entries. Three levels of
    # nesting is where N+1 hides most comfortably.
    ("claims list (student)", "GET", "/api/v1/claims", STUDENT, 25),
    ("claims list (reviewer)", "GET", "/api/v1/claims", HOD, 40),

    # The calendar joins four domains and used to load every meeting on the
    # platform with a lazy `.club` and `.faculty` on each row.
    ("calendar", "GET", "/api/v1/calendar", HOD, 25),

    # The inbox aggregates five sources. It is the screen everyone lands on,
    # so it is the one that must not degrade quietly.
    ("action queue", "GET", "/api/v1/me/action-queue", COORDINATOR, 45),

    ("club members", "GET", "/api/v1/clubs/club_commerce/members", PRESIDENT, 10),
    ("club events", "GET", "/api/v1/clubs/club_commerce/events", PRESIDENT, 8),
    ("notifications", "GET", "/api/v1/notifications", PRESIDENT, 6),
    ("my clubs", "GET", "/api/v1/clubs/my-memberships", PRESIDENT, 8),
    ("reviewer inbox", "GET", "/api/v1/clubs/annual-plans/awaiting-my-review", COORDINATOR, 8),
    # Both workflows, every stage, in one view. It aggregates a lot, which is
    # exactly why it needs a ceiling.
    ("pipeline", "GET", "/api/v1/me/pipeline", HOD, 12),
    ("faculty directory", "GET", "/api/v1/users/directory", HOD, 5),
    ("public statistics", "GET", "/api/v1/content/statistics", None, 5),
    ("public courses", "GET", "/api/v1/content/courses", None, 4),
]


@pytest.mark.parametrize(
    "label,method,path,creds,budget", BUDGETS, ids=[b[0] for b in BUDGETS],
)
def test_endpoint_stays_within_its_query_budget(client, label, method, path, creds, budget):
    headers = auth_headers(client, *creds) if creds else {}
    assert_query_budget(client, method, path, headers, budget)


def test_timetable_cost_does_not_grow_with_the_number_of_sessions(client):
    """The definitive N+1 shape: add rows, and the query count must not move.

    A budget alone can be satisfied by a small fixture. This measures the same
    endpoint twice with different amounts of data, which is the only assertion
    that actually distinguishes "N+1" from "a few queries".
    """
    student_h = auth_headers(client, *STUDENT)
    hod_h = auth_headers(client, *HOD)
    path = "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A"

    with QueryCounter() as before:
        client.get(path, headers=student_h)

    # Add several more timetabled hours, each with a faculty relationship that
    # faculty_name reads.
    for i in range(6):
        r = client.post("/api/v1/claims/timetable", headers=hod_h, json={
            "day_of_week": "Wednesday", "subject": f"Extra subject {i}", "hour": f"{9 + i}:00 AM",
            "faculty_id": "fac_subject_2", "programme": "B.Com (Hons)",
            "semester": "5", "section": "A",
        })
        assert r.status_code == 200, r.text

    with QueryCounter() as after:
        rows = client.get(path, headers=student_h).json()

    assert len(rows) >= 6
    assert all(row["faculty_name"] for row in rows), "faculty_name is not populated"
    assert after.selects == before.selects, (
        f"query count grew from {before.selects} to {after.selects} after adding 6 rows — "
        f"that is an N+1.\n{after.report()}"
    )


def test_club_members_cost_does_not_grow_with_the_roster(client):
    """ClubMemberOut.student_name is a relationship property too."""
    president_h = auth_headers(client, *PRESIDENT)
    path = "/api/v1/clubs/club_commerce/members"

    with QueryCounter() as before:
        client.get(path, headers=president_h)

    from app.core.database import SessionLocal
    from app.models.club import ClubMember
    from app.models.user import User
    from app.core.security import get_password_hash

    db = SessionLocal()
    try:
        for i in range(5):
            uid = f"std_qc_{i}"
            if not db.query(User).filter(User.id == uid).first():
                db.add(User(
                    id=uid, email=f"qc{i}@christuniversity.in",
                    hashed_password=get_password_hash("x"), name=f"Query Count {i}",
                    primary_role="student", status="active",
                ))
                db.add(ClubMember(
                    id=f"mbr_qc_{i}", student_id=uid, club_id="club_commerce",
                    role="Member", status="active", academic_year="2025-2026",
                ))
        db.commit()
    finally:
        db.close()

    with QueryCounter() as after:
        rows = client.get(path, headers=president_h).json()

    assert len(rows) >= 5
    assert all(r["student_name"] for r in rows)
    assert after.selects == before.selects, (
        f"query count grew from {before.selects} to {after.selects} after adding 5 members — "
        f"that is an N+1.\n{after.report()}"
    )
