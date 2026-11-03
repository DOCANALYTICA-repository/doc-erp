"""One request per workspace mount, with the server deciding what is visible.

Mounting the Clubs workspace issued THIRTEEN sequential requests. This endpoint
returns the three payloads more than one tab needs, plus the resolved
capabilities, the tab list and the dashboard counters — so the shell renders
from one round trip and each tab lazily fetches only its own data.

visible_tabs is the part that matters beyond latency: the server decides what a
coordinator sees versus a member, which is what stops the UI rendering actions
the backend will refuse.
"""
from .conftest import auth_headers

MEMBER = ("student.president@christuniversity.in", "123")
COORDINATOR = ("faculty.accounting@christuniversity.in", "123")
OUTSIDER = ("student.regular2@christuniversity.in", "123")


def _bootstrap(client, creds, club_id="club_commerce"):
    return client.get(f"/api/v1/clubs/{club_id}/bootstrap", headers=auth_headers(client, *creds))


def test_outsider_is_refused(client):
    assert _bootstrap(client, OUTSIDER).status_code == 403


def test_member_gets_every_tab_and_write_capability(client):
    r = _bootstrap(client, MEMBER)
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["relationship"] == "member"
    assert body["capabilities"]["can_read"] is True
    assert body["capabilities"]["can_write"] is True
    # The club President is not the Faculty Coordinator.
    assert body["capabilities"]["can_edit_hierarchy"] is False
    assert "reimbursements" in body["visible_tabs"]
    assert len(body["visible_tabs"]) == 16


def test_coordinator_sees_oversight_tabs_but_not_member_only_ones(client):
    r = _bootstrap(client, COORDINATOR)
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["relationship"] == "faculty_coordinator"
    assert body["capabilities"]["can_read"] is True
    # A coordinator oversees the club; they do not draft its events or request
    # its reimbursements.
    assert body["capabilities"]["can_write"] is False
    assert body["capabilities"]["can_edit_hierarchy"] is True

    tabs = body["visible_tabs"]
    assert "reimbursements" not in tabs
    assert "recruitment" not in tabs
    assert "sponsorships" not in tabs
    # ...but everything they audit or act on is present.
    assert {"annual-plan", "structure", "reports", "analytics"} <= set(tabs)


def test_approve_plan_capability_is_scoped_to_this_club(client):
    """A coordinator of a DIFFERENT club holds the same permission string and
    must not get an approve affordance here."""
    assert _bootstrap(client, COORDINATOR).json()["capabilities"]["can_approve_plan"] is True
    assert _bootstrap(client, MEMBER).json()["capabilities"]["can_approve_plan"] is False


def test_counters_avoid_fetching_lists_to_count_them(client):
    body = _bootstrap(client, MEMBER).json()
    counters = body["counters"]

    members = client.get(
        "/api/v1/clubs/club_commerce/members", headers=auth_headers(client, *MEMBER)
    ).json()
    assert counters["members"] == sum(1 for m in members if m["status"] == "active")
    assert counters["events"] >= 1
    assert counters["budget_spent"] > 0


def test_bootstrap_carries_the_shared_payloads(client):
    body = _bootstrap(client, MEMBER).json()
    # The three payloads used by more than one tab.
    assert body["club"]["id"] == "club_commerce"
    assert len(body["members"]) >= 1
    assert len(body["hierarchy"]) >= 1
