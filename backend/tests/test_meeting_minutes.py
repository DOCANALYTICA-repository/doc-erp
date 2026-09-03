"""Meeting minutes: implemented on the server, never reachable from the UI.

POST /faculty/meetings/{id}/minutes is fully implemented, organizer-gated and
wired into the task engine so action items become real tasks with
notifications — and `grep -rn "minutes" Workspace-Hub/src/` returned nothing,
so every meeting stayed permanently 'scheduled'.

Two server-side defects went with it: Meeting.action_items was never persisted
despite the column existing, and task.py indexed item["title"] and
item["assignee_id"] unguarded, so a malformed action item was a 500.
"""
import json

from .conftest import auth_headers

HOD = ("hod.commerce@christuniversity.in", "faculty123")
OTHER_FACULTY = ("faculty.finance@christuniversity.in", "faculty123")


def _create_meeting(client, headers):
    r = client.post("/api/v1/faculty/meetings", headers=headers, json={
        "title": "Departmental planning", "date": "2026-08-20",
        "time": "10:00 AM", "venue": "Room 402", "type": "department",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_minutes_persist_action_items_and_spawn_tasks(client):
    h = auth_headers(client, *HOD)
    meeting_id = _create_meeting(client, h)

    r = client.post(f"/api/v1/faculty/meetings/{meeting_id}/minutes", headers=h, json={
        "minutes": "Reviewed the conclave budget and the recruitment timeline.",
        "decisions": ["Approved the revised conclave budget."],
        "action_items": [
            {"title": "Book the auditorium", "assignee_id": "fac_hod", "due_date": "2026-08-25"},
        ],
    })
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["status"] == "completed"
    # The column existed and was never written to.
    assert body["action_items"], "action items were not persisted on the meeting"
    stored = json.loads(body["action_items"])
    assert stored[0]["title"] == "Book the auditorium"

    tasks = client.get("/api/v1/tasks", headers=h).json()
    assert any(t["title"] == "Book the auditorium" for t in tasks), tasks


def test_incomplete_action_item_is_a_422_not_a_500(client):
    h = auth_headers(client, *HOD)
    meeting_id = _create_meeting(client, h)

    r = client.post(f"/api/v1/faculty/meetings/{meeting_id}/minutes", headers=h, json={
        "minutes": "Discussed.", "decisions": ["Noted."],
        "action_items": [{"title": "No assignee on this one"}],
    })
    assert r.status_code == 422, r.text


def test_unknown_assignee_is_rejected(client):
    """A task assigned to an id that does not exist silently never appears."""
    h = auth_headers(client, *HOD)
    meeting_id = _create_meeting(client, h)

    r = client.post(f"/api/v1/faculty/meetings/{meeting_id}/minutes", headers=h, json={
        "minutes": "Discussed.", "decisions": ["Noted."],
        "action_items": [{"title": "Do a thing", "assignee_id": "fac_does_not_exist"}],
    })
    assert r.status_code == 422, r.text
    assert "fac_does_not_exist" in r.json()["detail"]


def test_only_the_organizer_may_record_minutes(client):
    meeting_id = _create_meeting(client, auth_headers(client, *HOD))
    r = client.post(
        f"/api/v1/faculty/meetings/{meeting_id}/minutes",
        headers=auth_headers(client, *OTHER_FACULTY),
        json={"minutes": "I was not there.", "decisions": ["x"], "action_items": []},
    )
    assert r.status_code == 403


def test_meeting_without_minutes_surfaces_in_the_action_queue(client):
    """The organizer should be told a past meeting has no record of what was
    decided — that is how 'permanently scheduled' becomes visible."""
    h = auth_headers(client, *HOD)
    r = client.post("/api/v1/faculty/meetings", headers=h, json={
        "title": "Budget review", "date": "2026-01-15",
        "time": "09:00 AM", "venue": "Room 101", "type": "department",
    })
    meeting_id = r.json()["id"]

    q = client.get("/api/v1/me/action-queue", headers=h).json()
    assert any(
        i["entity_id"] == meeting_id and i["kind"] == "meeting_without_minutes"
        for i in q["items"]
    ), q
