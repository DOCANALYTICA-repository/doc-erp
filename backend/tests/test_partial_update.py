"""PUT /tasks/{id} with a partial body must not null every unsent column.

BaseRepository.update() used `obj_in.__dict__`, which on a Pydantic model is
EVERY field on the schema, unsent ones included as None. The single-field body
the club "Mark Done" button sends — {"status": "pending_review"} — therefore
issued:

    UPDATE tasks SET title=NULL, due_date=NULL, priority=NULL, status='pending_review'

and died on the NOT NULL constraint. The club task workflow has never been
completable. There was no test for this route at all.
"""
from .conftest import auth_headers


def _make_task(client, headers, assignee_id: str) -> dict:
    r = client.post("/api/v1/tasks", headers=headers, json={
        "title": "Submit sponsorship contract",
        "description": "HDFC paperwork",
        "due_date": "2026-08-01",
        "priority": "high",
        "assignee_id": assignee_id,
        "source_module": "clubs",
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_single_field_update_leaves_other_columns_intact(client):
    h = auth_headers(client, "student.president@christuniversity.in", "123")
    task = _make_task(client, h, "std_president")

    r = client.put(f"/api/v1/tasks/{task['id']}", headers=h, json={"status": "pending_review"})
    assert r.status_code == 200, r.text

    updated = r.json()
    assert updated["status"] == "pending_review"
    assert updated["title"] == "Submit sponsorship contract"
    assert updated["due_date"] == "2026-08-01"
    assert updated["priority"] == "high"
    assert updated["description"] == "HDFC paperwork"


def test_explicit_null_is_still_honoured(client):
    """exclude_unset must not become exclude_none — clearing a field is real."""
    h = auth_headers(client, "student.president@christuniversity.in", "123")
    task = _make_task(client, h, "std_president")

    r = client.put(f"/api/v1/tasks/{task['id']}", headers=h, json={"description": None})
    assert r.status_code == 200, r.text
    assert r.json()["description"] is None
    assert r.json()["title"] == "Submit sponsorship contract"
