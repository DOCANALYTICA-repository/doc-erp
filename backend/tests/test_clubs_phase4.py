from .conftest import auth_headers


def test_my_memberships_only_shows_own_clubs(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "123")
    r = client.get("/api/v1/clubs/my-memberships", headers=president_h)
    assert r.status_code == 200
    names = {c["name"] for c in r.json()}
    assert names == {"Commerce Club"}


def test_super_admin_sees_all_clubs_in_my_memberships(client):
    admin_h = auth_headers(client, "admin@christuniversity.in", "123")
    r = client.get("/api/v1/clubs/my-memberships", headers=admin_h)
    assert len(r.json()) >= 2


def test_recruitment_drive_lifecycle(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "123")
    r = client.post("/api/v1/clubs/club_commerce/recruitment-drives", json={
        "title": "Fall Recruitment 2026", "recruitment_period": "Aug 2026",
        "eligibility": "First years", "positions_available": "10", "club_id": "club_commerce",
    }, headers=president_h)
    assert r.status_code == 200
    drive_id = r.json()["id"]

    # Outsider can't create a drive for a club they don't belong to
    outsider_h = auth_headers(client, "student.regular2@christuniversity.in", "123")
    r = client.post("/api/v1/clubs/club_commerce/recruitment-drives", json={
        "title": "x", "recruitment_period": "x", "club_id": "club_commerce",
    }, headers=outsider_h)
    assert r.status_code == 403

    # A student applies
    applicant_h = auth_headers(client, "student.regular2@christuniversity.in", "123")
    r = client.post(f"/api/v1/clubs/recruitment-drives/{drive_id}/apply", json={"motivation_statement": "I love commerce"}, headers=applicant_h)
    assert r.status_code == 200
    app_id = r.json()["id"]
    assert r.json()["status"] == "applied"

    # Club leadership shortlists them
    r = client.put(f"/api/v1/clubs/recruitment-applications/{app_id}", json={"status": "shortlisted"}, headers=president_h)
    assert r.status_code == 200
    assert r.json()["status"] == "shortlisted"


def test_announcement_create_and_list(client):
    h = auth_headers(client, "student.president@christuniversity.in", "123")
    r = client.post("/api/v1/clubs/club_commerce/announcements", json={
        "title": "Recruitment opens Monday", "body": "Applications open next week.",
        "announcement_type": "recruitment", "club_id": "club_commerce",
    }, headers=h)
    assert r.status_code == 200

    r = client.get("/api/v1/clubs/club_commerce/announcements", headers=h)
    assert r.status_code == 200
    assert any(a["title"] == "Recruitment opens Monday" for a in r.json())
