from .conftest import auth_headers


def test_president_cannot_edit_hierarchy_only_faculty_coordinator_can(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    r = client.post(
        "/api/v1/clubs/club_commerce/hierarchy/levels",
        json={"level_order": 15, "title": "Analytics Lead"},
        headers=president_h,
    )
    assert r.status_code == 403

    coordinator_h = auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123")
    r = client.post(
        "/api/v1/clubs/club_commerce/hierarchy/levels",
        json={"level_order": 15, "title": "Analytics Lead"},
        headers=coordinator_h,
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Analytics Lead"


def test_default_hierarchy_has_four_levels(client):
    h = auth_headers(client, "student.regular2@christuniversity.in", "student123")
    r = client.get("/api/v1/clubs/club_cultural/hierarchy", headers=h)
    assert r.status_code == 200
    titles = {lvl["title"] for lvl in r.json()}
    assert {"President", "Vice President", "Core Member", "Member"}.issubset(titles)


def test_task_assignment_and_bottom_level_denial(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    r = client.post(
        "/api/v1/clubs/club_commerce/tasks",
        json={"title": "Book venue", "due_date": "2026-08-10", "priority": "high", "assignee_id": "std_regular_1"},
        headers=president_h,
    )
    assert r.status_code == 200
    task = r.json()
    assert task["source_module"] == "clubs"
    assert task["related_entity_id"] == "club_commerce"

    # std_regular_1 (Core Member, level 30 — not bottom) can also assign tasks
    core_member_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/clubs/club_commerce/tasks", headers=core_member_h)
    assert r.status_code == 200
    assert any(t["id"] == task["id"] for t in r.json())
    r = client.post(
        "/api/v1/clubs/club_commerce/tasks",
        json={"title": "Design poster", "due_date": "2026-08-11", "priority": "low", "assignee_id": "std_president"},
        headers=core_member_h,
    )
    assert r.status_code == 200

    # Move std_regular_1 to the club's bottom rank ("Member") and confirm they're then denied
    hierarchy = client.get("/api/v1/clubs/club_commerce/hierarchy", headers=president_h).json()
    bottom_level_id = max(hierarchy, key=lambda l: l["level_order"])["id"]
    r = client.put(
        "/api/v1/clubs/club_commerce/members/mbr_3/hierarchy-level",
        json={"hierarchy_level_id": bottom_level_id},
        headers=president_h,
    )
    assert r.status_code == 200

    r = client.post(
        "/api/v1/clubs/club_commerce/tasks",
        json={"title": "Take notes", "due_date": "2026-08-12", "priority": "low", "assignee_id": "std_president"},
        headers=core_member_h,
    )
    assert r.status_code == 403


def test_club_detail_exposes_viewer_capability_flags(client):
    coordinator_h = auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123")
    r = client.get("/api/v1/clubs/club_commerce", headers=coordinator_h)
    assert r.status_code == 200
    body = r.json()
    assert body["viewer_can_edit_hierarchy"] is True

    unrelated_h = auth_headers(client, "faculty.finance@christuniversity.in", "faculty123")
    r = client.get("/api/v1/clubs/club_commerce", headers=unrelated_h)
    assert r.status_code == 200
    assert r.json()["viewer_can_edit_hierarchy"] is False
