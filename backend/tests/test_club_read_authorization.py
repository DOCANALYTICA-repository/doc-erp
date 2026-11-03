"""Seven club GET routes had no authorization beyond "you are logged in".

Every other read in clubs.py gated on membership, so this was an
inconsistency rather than a policy. With the seed data it meant a Cultural
Committee member could read the Commerce Club's HDFC sponsorship amount and
contract URL, its budget allocations and spend, its reimbursement requests,
and its full member roster with student IDs and permission templates.

std_regular_2 belongs to club_cultural and to no other club.
"""
import pytest

from .conftest import auth_headers

OUTSIDER = ("student.regular2@christuniversity.in", "123")
MEMBER = ("student.president@christuniversity.in", "123")
FACULTY_COORDINATOR = ("faculty.accounting@christuniversity.in", "123")

PREVIOUSLY_UNGATED = [
    "/api/v1/clubs/club_commerce/members",
    "/api/v1/clubs/club_commerce/events",
    "/api/v1/clubs/club_commerce/budgets",
    "/api/v1/clubs/club_commerce/reimbursements",
    "/api/v1/clubs/club_commerce/sponsorships",
    "/api/v1/clubs/club_commerce/announcements",
]


@pytest.mark.parametrize("path", PREVIOUSLY_UNGATED)
def test_outsider_is_refused(client, path):
    h = auth_headers(client, *OUTSIDER)
    r = client.get(path, headers=h)
    assert r.status_code == 403, f"{path} leaked to a non-member: {r.status_code}"


@pytest.mark.parametrize("path", PREVIOUSLY_UNGATED)
def test_member_still_has_access(client, path):
    h = auth_headers(client, *MEMBER)
    r = client.get(path, headers=h)
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path", PREVIOUSLY_UNGATED)
def test_faculty_coordinator_has_access(client, path):
    """The coordinator is not a ClubMember, which is exactly why gating reads
    on membership locked the only person who oversees the club out of it."""
    h = auth_headers(client, *FACULTY_COORDINATOR)
    r = client.get(path, headers=h)
    assert r.status_code == 200, r.text


def test_recruitment_drives_show_only_open_ones_to_outsiders(client):
    """Recruitment is the deliberate exception — it only works if people
    outside the club can see that it is happening. Drafts stay private."""
    outsider = client.get(
        "/api/v1/clubs/club_commerce/recruitment-drives",
        headers=auth_headers(client, *OUTSIDER),
    )
    assert outsider.status_code == 200
    assert all(d["status"] == "open" for d in outsider.json())

    member = client.get(
        "/api/v1/clubs/club_commerce/recruitment-drives",
        headers=auth_headers(client, *MEMBER),
    )
    assert member.status_code == 200
    assert len(member.json()) >= len(outsider.json())


def test_event_attendance_cannot_be_read_across_clubs(client):
    """The club_id in the path was never checked against the event's own club,
    so a member of club A could read club B's attendance by pairing their own
    club_id with B's event_id."""
    member_h = auth_headers(client, *MEMBER)
    events = client.get("/api/v1/clubs/club_commerce/events", headers=member_h).json()
    assert events, "seed has no commerce events to test with"
    commerce_event = events[0]["id"]

    outsider_h = auth_headers(client, *OUTSIDER)
    r = client.get(
        f"/api/v1/clubs/club_cultural/events/{commerce_event}/attendance",
        headers=outsider_h,
    )
    assert r.status_code == 404, r.text
