from .conftest import auth_headers


def test_clubs_list_requires_auth(client):
    r = client.get("/api/v1/clubs/")
    assert r.status_code == 401


def test_clubs_list_works_when_authenticated(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/clubs/", headers=h)
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_cannot_create_event_for_a_club_you_are_not_a_member_of(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    body = {"title": "Test", "date": "2026-08-01", "venue": "X", "budget": 100, "club_id": "club_cultural"}
    r = client.post("/api/v1/clubs/club_cultural/events", json=body, headers=president_h)
    assert r.status_code == 403


def test_can_create_event_for_your_own_club(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    body = {"title": "Test", "date": "2026-08-01", "venue": "X", "budget": 100, "club_id": "club_commerce"}
    r = client.post("/api/v1/clubs/club_commerce/events", json=body, headers=president_h)
    assert r.status_code == 200
