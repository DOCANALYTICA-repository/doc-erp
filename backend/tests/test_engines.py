from .conftest import auth_headers


def test_content_engine_is_public(client):
    r = client.get("/api/v1/content/statistics")
    assert r.status_code == 200
    r = client.get("/api/v1/content/courses")
    assert r.status_code == 200 and len(r.json()) > 0
    r = client.get("/api/v1/content/gallery")
    assert r.status_code == 200


def test_search_requires_auth(client):
    r = client.get("/api/v1/search/?q=commerce")
    assert r.status_code == 401


def test_search_finds_seeded_club(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/search/?q=Commerce", headers=h)
    assert r.status_code == 200
    assert any(c["name"] == "Commerce Club" for c in r.json()["clubs"])


def test_calendar_requires_auth(client):
    r = client.get("/api/v1/calendar/")
    assert r.status_code == 401


def test_calendar_returns_events_for_student_with_academic_profile(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/calendar/", headers=h)
    assert r.status_code == 200
    types = {e["type"] for e in r.json()}
    assert "timetable" in types  # student has programme/semester/section seeded


def test_dashboard_preferences_materialize_defaults_then_persist_reorder(client):
    h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    r = client.get("/api/v1/faculty/dashboard-preferences", headers=h)
    assert r.status_code == 200
    prefs = r.json()
    assert len(prefs) == 8
    assert prefs[0]["widget_key"] == "todays_schedule"

    # Reorder: move "notes" to the front
    updated = [{"widget_key": "notes", "order": "0", "visible": True}]
    r = client.put("/api/v1/faculty/dashboard-preferences", json=updated, headers=h)
    assert r.status_code == 200
    assert r.json()[0]["order"] == "0"

    r = client.get("/api/v1/faculty/dashboard-preferences", headers=h)
    notes_pref = next(p for p in r.json() if p["widget_key"] == "notes")
    assert notes_pref["order"] == "0"


def test_club_performance_report_requires_membership(client):
    outsider_h = auth_headers(client, "student.regular2@christuniversity.in", "student123")
    r = client.get("/api/v1/clubs/club_commerce/reports/performance", headers=outsider_h)
    assert r.status_code == 403

    member_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    r = client.get("/api/v1/clubs/club_commerce/reports/performance", headers=member_h)
    assert r.status_code == 200
    assert r.json()["club_name"] == "Commerce Club"


def test_attendance_summary_report_requires_faculty(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/claims/reports/attendance-summary?academic_year=2025-2026", headers=student_h)
    assert r.status_code == 403

    faculty_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    r = client.get("/api/v1/claims/reports/attendance-summary?academic_year=2025-2026", headers=faculty_h)
    assert r.status_code == 200
    assert "metrics" in r.json()
