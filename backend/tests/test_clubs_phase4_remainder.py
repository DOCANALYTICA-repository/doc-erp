import pytest

from .conftest import auth_headers


@pytest.fixture(autouse=True)
def _fake_storage(monkeypatch):
    """
    Document upload/versioning tests exercise real endpoints end-to-end but
    must not make real network calls to Supabase Storage (unreachable and
    unconfigured under pytest — see conftest.py's SUPABASE_URL stub).
    """
    from app.services.engines import storage as storage_module

    async def _fake_upload(file, folder="general"):
        return f"{folder}/fake_{file.filename}"

    monkeypatch.setattr(storage_module.storage_engine, "upload_file", _fake_upload)
    monkeypatch.setattr(
        storage_module.storage_engine, "get_signed_url",
        lambda file_path, expires_in_seconds=3600: f"https://fake-signed-url/{file_path}",
    )


PRESIDENT = ("student.president@christuniversity.in", "123")
FACULTY_COORDINATOR = ("faculty.accounting@christuniversity.in", "123")
CULTURAL_COORDINATOR = ("faculty.cultural@christuniversity.in", "123")
HOD = ("hod.commerce@christuniversity.in", "123")
OUTSIDER = ("student.regular2@christuniversity.in", "123")


def test_annual_plan_full_approval_workflow(client):
    president_h = auth_headers(client, *PRESIDENT)

    r = client.post("/api/v1/clubs/club_commerce/annual-plans", json={
        "academic_year": "2026-2027", "vision": "Grow the club.", "budget_allocation": 10000.0,
    }, headers=president_h)
    assert r.status_code == 200, r.text
    plan_id = r.json()["id"]
    assert r.json()["status"] == "draft"

    # Outsider cannot submit
    outsider_h = auth_headers(client, *OUTSIDER)
    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/submit", headers=outsider_h)
    assert r.status_code == 403

    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/submit", headers=president_h)
    assert r.status_code == 200
    assert r.json()["status"] == "faculty_coordinator_review"

    # Wrong-stage reviewer rejected
    hod_h = auth_headers(client, *HOD)
    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/review", json={"action": "approve"}, headers=hod_h)
    assert r.status_code == 403

    fc_h = auth_headers(client, *FACULTY_COORDINATOR)
    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/review", json={"action": "approve"}, headers=fc_h)
    assert r.status_code == 200
    assert r.json()["status"] == "cultural_coordinator_review"

    cc_h = auth_headers(client, *CULTURAL_COORDINATOR)
    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/review", json={
        "action": "reject", "comments": "Needs a clearer budget breakdown.",
    }, headers=cc_h)
    assert r.status_code == 200
    assert r.json()["status"] == "draft"
    assert "budget breakdown" in r.json()["review_comments"]

    # Resubmit and walk it all the way to Approved -> Locked
    client.post(f"/api/v1/clubs/annual-plans/{plan_id}/submit", headers=president_h)
    client.post(f"/api/v1/clubs/annual-plans/{plan_id}/review", json={"action": "approve"}, headers=fc_h)
    client.post(f"/api/v1/clubs/annual-plans/{plan_id}/review", json={"action": "approve"}, headers=cc_h)
    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/review", json={"action": "approve"}, headers=hod_h)
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    r = client.post(f"/api/v1/clubs/annual-plans/{plan_id}/lock", headers=hod_h)
    assert r.status_code == 200
    assert r.json()["status"] == "locked"


def test_only_one_annual_plan_per_academic_year(client):
    president_h = auth_headers(client, *PRESIDENT)
    r = client.post("/api/v1/clubs/club_commerce/annual-plans", json={
        "academic_year": "2025-2026",  # already seeded
    }, headers=president_h)
    assert r.status_code == 400


def test_documents_upload_versioning_and_knowledge_base(client):
    president_h = auth_headers(client, *PRESIDENT)

    r = client.post(
        "/api/v1/clubs/club_commerce/documents",
        data={"name": "SOP - Event Setup.pdf", "category": "Policies", "tags": "sop,knowledge-base"},
        files={"file": ("sop.pdf", b"fake-pdf-bytes", "application/pdf")},
        headers=president_h,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["version"] == "1"

    r = client.post(
        f"/api/v1/clubs/documents/{doc['id']}/new-version",
        files={"file": ("sop_v2.pdf", b"more-fake-bytes", "application/pdf")},
        headers=president_h,
    )
    assert r.status_code == 200
    v2 = r.json()
    assert v2["version"] == "2"
    assert v2["previous_version_id"] == doc["id"]

    r = client.get(f"/api/v1/clubs/documents/{v2['id']}/versions", headers=president_h)
    assert r.status_code == 200
    assert [d["version"] for d in r.json()] == ["2", "1"]

    r = client.get("/api/v1/clubs/club_commerce/knowledge-base", headers=president_h)
    assert r.status_code == 200
    assert any(d["id"] == doc["id"] for d in r.json())


def test_reports_return_expected_shapes(client):
    h = auth_headers(client, *PRESIDENT)

    r = client.get("/api/v1/clubs/club_commerce/reports/monthly?month=2026-07", headers=h)
    assert r.status_code == 200
    assert r.json()["report_type"] == "Monthly Club Report"

    r = client.get("/api/v1/clubs/club_commerce/reports/annual?academic_year=2025-2026", headers=h)
    assert r.status_code == 200
    assert r.json()["metrics"]["total_members"] >= 1

    r = client.get("/api/v1/clubs/club_commerce/reports/budget-summary?academic_year=2025-2026", headers=h)
    assert r.status_code == 200
    assert "utilization_percent" in r.json()

    r = client.get("/api/v1/clubs/club_commerce/reports/sponsorship-summary", headers=h)
    assert r.status_code == 200
    assert r.json()["total_sponsors"] >= 1

    r = client.get("/api/v1/clubs/club_commerce/reports/attendance", headers=h)
    assert r.status_code == 200
    assert r.json()["report_type"] == "Attendance Report"

    r = client.get("/api/v1/clubs/club_commerce/reports/contribution", headers=h)
    assert r.status_code == 200
    assert isinstance(r.json()["members"], list)


def test_analytics_returns_nine_widgets_in_priority_order(client):
    h = auth_headers(client, *PRESIDENT)
    r = client.get("/api/v1/clubs/club_commerce/analytics?academic_year=2025-2026", headers=h)
    assert r.status_code == 200
    widgets = r.json()["widgets"]
    assert [w["key"] for w in widgets] == [
        "contribution_leaderboard", "member_activity", "attendance_trends", "monthly_progress",
        "registration_trends", "budget_utilization", "year_over_year_comparison", "feedback_analysis",
        "sponsorship_summary",
    ]


def test_event_attendance_marking(client):
    h = auth_headers(client, *PRESIDENT)
    r = client.post("/api/v1/clubs/club_commerce/events/evt_conclave/attendance", json=[
        {"student_id": "std_regular_1", "attended": "present"},
    ], headers=h)
    assert r.status_code == 200, r.text
    # The seed may already carry a row for this student, so assert the total
    # accounted for rather than which half of the upsert ran.
    assert r.json()["total"] == 1

    r = client.get("/api/v1/clubs/club_commerce/events/evt_conclave/attendance", headers=h)
    assert r.status_code == 200
    rows = r.json()
    assert any(a["student_id"] == "std_regular_1" for a in rows)
    # Names, not opaque ids — the register has to be readable.
    assert next(a for a in rows if a["student_id"] == "std_regular_1")["student_name"]


def test_re_marking_attendance_updates_rather_than_duplicating(client):
    """This used to INSERT unconditionally, so correcting a register left two
    contradictory rows for one student — and both fed the attendance analytics
    and the attendance report."""
    h = auth_headers(client, *PRESIDENT)
    url = "/api/v1/clubs/club_commerce/events/evt_conclave/attendance"

    client.post(url, json=[{"student_id": "std_vp", "attended": "present"}], headers=h)
    before = client.get(url, headers=h).json()

    r = client.post(url, json=[{"student_id": "std_vp", "attended": "absent"}], headers=h)
    assert r.status_code == 200, r.text
    assert r.json() == {"created": 0, "updated": 1, "total": 1}, "a correction was not an update"

    after = client.get(url, headers=h).json()
    assert len(after) == len(before), "a correction created a duplicate row"
    assert next(a for a in after if a["student_id"] == "std_vp")["attended"] == "absent"


def test_attendance_rejects_non_members_and_malformed_records(client):
    h = auth_headers(client, *PRESIDENT)
    url = "/api/v1/clubs/club_commerce/events/evt_conclave/attendance"

    # Not a member of this club.
    r = client.post(url, json=[{"student_id": "std_regular_2", "attended": "present"}], headers=h)
    assert r.status_code == 422, r.text
    assert "std_regular_2" in r.json()["detail"]

    # r["student_id"] used to be indexed unguarded — a 500, not a 422.
    r = client.post(url, json=[{"attended": "present"}], headers=h)
    assert r.status_code == 422

    # An invented attendance value is refused rather than stored.
    r = client.post(url, json=[{"student_id": "std_vp", "attended": "maybe"}], headers=h)
    assert r.status_code == 422


def test_club_members_expose_real_student_names(client):
    h = auth_headers(client, *PRESIDENT)
    r = client.get("/api/v1/clubs/club_commerce/members", headers=h)
    assert r.status_code == 200
    names = {m["student_id"]: m["student_name"] for m in r.json()}
    assert names["std_president"] == "Rahul Sharma"
    assert names["std_vp"] == "Ananya Rao"


def test_permission_template_assignment(client):
    president_h = auth_headers(client, *PRESIDENT)

    r = client.put(
        "/api/v1/clubs/club_commerce/members/mbr_3/permission-template",
        json={"permission_template": "Documentation Head"},
        headers=president_h,
    )
    assert r.status_code == 200
    assert r.json()["permission_template"] == "Documentation Head"

    # Only Club Head / faculty / super_admin may assign
    other_h = auth_headers(client, *OUTSIDER)
    r = client.put(
        "/api/v1/clubs/club_commerce/members/mbr_3/permission-template",
        json={"permission_template": "Finance Head"},
        headers=other_h,
    )
    assert r.status_code == 403

    r = client.put(
        "/api/v1/clubs/club_commerce/members/mbr_3/permission-template",
        json={"permission_template": "Not A Real Template"},
        headers=president_h,
    )
    assert r.status_code == 400
