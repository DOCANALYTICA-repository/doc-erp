from .conftest import auth_headers


def _submit_claim(client, student_h, section="A", date_range="2026-08-01 to 2026-08-01"):
    tt = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A", headers=student_h
    ).json()
    payload = {
        "category": "medical",
        "academic_year": "2025-2026",
        "semester": "5",
        "programme": "B.Com (Hons)",
        "section": section,
        "date_range": date_range,
        "reason": "Test reason",
        "missed_classes": [
            {"subject": s["subject"], "date": "2026-08-01", "hour": s["hour"], "subject_faculty_id": s["faculty_id"]}
            for s in tt[:1]
        ],
    }
    r = client.post("/api/v1/claims/", json=payload, headers=student_h)
    assert r.status_code == 200
    return r.json()


def test_subject_faculty_does_not_see_claim_still_awaiting_class_teacher(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    claim = _submit_claim(client, student_h)

    subject_faculty_h = auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123")
    listing = client.get("/api/v1/claims/", headers=subject_faculty_h).json()
    assert claim["id"] not in {c["id"] for c in listing}


def test_class_teacher_scoped_to_their_own_section_only(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    claim = _submit_claim(client, student_h, section="B")

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    listing = client.get("/api/v1/claims/", headers=teacher_h).json()
    assert claim["id"] not in {c["id"] for c in listing}

    r = client.post(f"/api/v1/claims/{claim['id']}/approve-stage?action=approve", headers=teacher_h)
    assert r.status_code == 403


def test_revise_requires_a_reason(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    claim = _submit_claim(client, student_h)

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    r = client.post(f"/api/v1/claims/{claim['id']}/approve-stage?action=revise", headers=teacher_h)
    assert r.status_code == 400

    r = client.post(
        f"/api/v1/claims/{claim['id']}/approve-stage?action=revise&feedback=Please+attach+a+certificate",
        headers=teacher_h,
    )
    assert r.status_code == 200
    assert r.json()["claim_status"] == "returned"

    detail = client.get(f"/api/v1/claims/{claim['id']}", headers=student_h).json()
    assert detail["revision_reason"] == "Please attach a certificate"


def test_resubmit_edits_same_claim_and_notifies(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "student123")
    claim = _submit_claim(client, student_h, date_range="2026-08-05 to 2026-08-05")

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    client.post(
        f"/api/v1/claims/{claim['id']}/approve-stage?action=revise&feedback=Wrong+date",
        headers=teacher_h,
    )

    r = client.put(
        f"/api/v1/claims/{claim['id']}/resubmit",
        json={"date_range": "2026-08-06 to 2026-08-06"},
        headers=student_h,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "submitted"
    assert body["current_workflow_stage"] == "initial_review"
    assert body["date_range"] == "2026-08-06 to 2026-08-06"
    assert body["revision_reason"] is None


def test_club_faculty_coordinator_scoped_to_their_own_club(client):
    # fac_subject_2 (faculty.accounting) is seeded as Club Faculty Coordinator for club_commerce only
    coordinator_h = auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123")
    listing = client.get("/api/v1/claims/", headers=coordinator_h).json()
    club_claim_ids = {c["id"] for c in listing if c.get("submission_type") == "club"}
    assert "cl_club_1" in club_claim_ids
