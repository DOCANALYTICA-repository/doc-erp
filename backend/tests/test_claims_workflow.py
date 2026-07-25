from .conftest import auth_headers


def test_claim_detail_requires_auth(client):
    r = client.get("/api/v1/claims/cl_med_1")
    assert r.status_code == 401


def test_unrelated_student_cannot_view_claim_detail(client):
    h = auth_headers(client, "student.regular2@christuniversity.in", "student123")
    r = client.get("/api/v1/claims/cl_med_1", headers=h)
    assert r.status_code == 403


def test_submitter_can_view_own_claim_and_name_is_real(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/claims/cl_med_1", headers=h)
    assert r.status_code == 200
    assert r.json()["submitter_name"] == "Vikram Aditya"


def test_student_cannot_approve_a_claim_stage(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.post("/api/v1/claims/cl_med_1/approve-stage?action=approve", headers=h)
    assert r.status_code == 403


def test_full_submit_and_approval_chain(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    tt = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A", headers=student_h
    ).json()
    payload = {
        "category": "medical",
        "academic_year": "2025-2026",
        "semester": "5",
        "programme": "B.Com (Hons)",
        "section": "A",
        "date_range": "2026-07-20 to 2026-07-20",
        "reason": "Test reason",
        "missed_classes": [
            {"subject": s["subject"], "date": "2026-07-20", "hour": s["hour"], "subject_faculty_id": s["faculty_id"]}
            for s in tt[:1]
        ],
    }
    r = client.post("/api/v1/claims/", json=payload, headers=student_h)
    assert r.status_code == 200
    claim = r.json()
    cid = claim["id"]
    assert claim["current_workflow_stage"] == "initial_review"

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    r = client.post(f"/api/v1/claims/{cid}/approve-stage?action=approve", headers=teacher_h)
    assert r.status_code == 200
    assert r.json()["new_stage"] == "subject_faculty"

    # An unrelated faculty member with no entries on this claim must be denied
    hod_h = auth_headers(client, "hod.commerce@christuniversity.in", "faculty123")
    r = client.post(f"/api/v1/claims/{cid}/approve-stage?action=approve", headers=hod_h)
    assert r.status_code == 403

    detail = client.get(f"/api/v1/claims/{cid}", headers=teacher_h).json()
    assigned_faculty_id = detail["participants"][0]["entries"][0]["subject_faculty_id"]
    assigned_h = {
        "fac_subject_1": auth_headers(client, "faculty.finance@christuniversity.in", "faculty123"),
        "fac_subject_2": auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123"),
    }[assigned_faculty_id]
    r = client.post(f"/api/v1/claims/{cid}/approve-stage?action=approve", headers=assigned_h)
    assert r.status_code == 200
    assert r.json()["new_stage"] == "course_coordinator"


def test_duplicate_claim_check_is_a_soft_warning(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/claims/duplicate-check?date_range=2026-07-05 to 2026-07-06", headers=h)
    assert r.status_code == 200
    assert r.json()["has_potential_duplicate"] is True


def test_faculty_ai_summary_denied_to_students(client):
    h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    r = client.get("/api/v1/claims/cl_med_1/ai-summary", headers=h)
    assert r.status_code == 403


def test_timetable_admin_requires_permission(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    body = {
        "day_of_week": "Thursday", "subject": "X", "hour": "X", "faculty_id": "fac_subject_1",
        "programme": "X", "semester": "X", "section": "X",
    }
    r = client.post("/api/v1/claims/timetable", json=body, headers=student_h)
    assert r.status_code == 403

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    r = client.post("/api/v1/claims/timetable", json=body, headers=teacher_h)
    assert r.status_code == 200
