"""The public site is a live front for real data, not a static brochure.

get_public_statistics() returned the literals 2500 / 85 / 12 / 55; the three
course descriptions were a hardcoded Python list whose brochure_urls pointed at
PDFs that exist nowhere in the repository; the gallery was four picsum.photos
placeholders.
"""
from .conftest import auth_headers

HOD = ("hod.commerce@christuniversity.in", "faculty123")
STUDENT = ("student.regular@christuniversity.in", "student123")


def test_statistics_are_counted_not_asserted(client):
    stats = client.get("/api/v1/content/statistics").json()

    # Counted from the seed, which has far fewer than 2500 students.
    assert stats["total_students"] < 100
    assert stats["faculty_count"] < 100
    assert stats["number_of_clubs"] == 2
    assert stats["founded_year"] == 1971
    assert stats["years_established"] > 50


def test_statistics_move_when_the_data_moves(client):
    """The point of counting: the number is right the day after someone enrols."""
    before = client.get("/api/v1/content/statistics").json()["number_of_clubs"]

    from app.core.database import SessionLocal
    from app.models.club import Club

    db = SessionLocal()
    try:
        db.add(Club(id="club_test_cms", name="Test CMS Club", category="Academic", status="active"))
        db.commit()
    finally:
        db.close()

    after = client.get("/api/v1/content/statistics").json()["number_of_clubs"]
    assert after == before + 1


def test_courses_come_from_the_database_with_no_broken_brochure_links(client):
    courses = client.get("/api/v1/content/courses").json()
    assert len(courses) == 3
    assert {c["id"] for c in courses} == {"bcom_regular", "bcom_hons", "bcom_fna"}

    for c in courses:
        # A link to a brochure that does not exist is worse than no link.
        assert c["brochure_url"] is None
        assert isinstance(c["outcomes"], list) and c["outcomes"]
        assert isinstance(c["careers"], list) and c["careers"]


def test_gallery_is_honestly_empty_rather_than_full_of_placeholders(client):
    assert client.get("/api/v1/content/gallery").json() == []


def test_hod_can_edit_a_programme_and_the_public_route_reflects_it(client):
    h = auth_headers(client, *HOD)
    r = client.put("/api/v1/content/admin/programmes/bcom_hons", headers=h, json={
        "description": "Updated for the 2026 syllabus revision.",
        "careers": ["Investment Banker", "Quantitative Analyst"],
    })
    assert r.status_code == 200, r.text

    public = client.get("/api/v1/content/courses").json()
    hons = next(c for c in public if c["id"] == "bcom_hons")
    assert hons["description"] == "Updated for the 2026 syllabus revision."
    assert hons["careers"] == ["Investment Banker", "Quantitative Analyst"]
    # An unrelated field is untouched.
    assert hons["name"] == "B.Com (Honours)"


def test_unpublishing_hides_a_programme_from_the_public_route_only(client):
    h = auth_headers(client, *HOD)
    assert client.put(
        "/api/v1/content/admin/programmes/bcom_regular", headers=h,
        json={"is_published": False},
    ).status_code == 200

    public_ids = {c["id"] for c in client.get("/api/v1/content/courses").json()}
    assert "bcom_regular" not in public_ids

    admin_ids = {p["id"] for p in client.get("/api/v1/content/admin/programmes", headers=h).json()}
    assert "bcom_regular" in admin_ids

    client.put("/api/v1/content/admin/programmes/bcom_regular", headers=h,
               json={"is_published": True})


def test_a_student_cannot_edit_the_public_site(client):
    r = client.put(
        "/api/v1/content/admin/programmes/bcom_hons",
        headers=auth_headers(client, *STUDENT),
        json={"description": "hacked"},
    )
    assert r.status_code == 403


def test_gallery_images_can_be_added_and_ordered(client):
    h = auth_headers(client, *HOD)
    client.put("/api/v1/content/admin/gallery/gal_conclave", headers=h, json={
        "title": "National Commerce Conclave 2026",
        "url": "https://cdn.example.edu/conclave.jpg",
        "display_order": 10,
    })
    client.put("/api/v1/content/admin/gallery/gal_inaug", headers=h, json={
        "title": "Department Inauguration",
        "url": "https://cdn.example.edu/inauguration.jpg",
        "display_order": 5,
    })

    gallery = client.get("/api/v1/content/gallery").json()
    assert [g["id"] for g in gallery] == ["gal_inaug", "gal_conclave"]

    assert client.delete("/api/v1/content/admin/gallery/gal_inaug", headers=h).status_code == 200
    assert [g["id"] for g in client.get("/api/v1/content/gallery").json()] == ["gal_conclave"]
