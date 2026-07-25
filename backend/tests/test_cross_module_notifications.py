from .conftest import auth_headers


def _titles(client, headers):
    r = client.get("/api/v1/notifications/", headers=headers)
    assert r.status_code == 200
    return [n["title"] for n in r.json()]


def test_claim_submission_and_stage_progress_notify_the_student(client):
    student_h = auth_headers(client, "student.regular2@christuniversity.in", "student123")
    r = client.post("/api/v1/claims/", json={
        "category": "medical", "academic_year": "2025-2026", "semester": "5",
        "programme": "B.Com (Hons)", "section": "A", "submission_type": "individual",
        "date_range": "2026-07-10 to 2026-07-10", "reason": "Fever.",
        "missed_classes": [{
            "subject": "Corporate Accounting", "date": "2026-07-10", "hour": "09:00 AM - 10:00 AM",
            "subject_faculty_id": "fac_subject_2",
        }],
    }, headers=student_h)
    assert r.status_code == 200, r.text
    claim_id = r.json()["id"]

    assert "Claim submitted" in _titles(client, student_h)

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "faculty123")
    r = client.post(f"/api/v1/claims/{claim_id}/approve-stage?action=approve", headers=teacher_h)
    assert r.status_code == 200, r.text
    assert r.json()["new_stage"] == "subject_faculty"

    # The student gets a stage-progress notification...
    student_titles = _titles(client, student_h)
    assert any("update" in t for t in student_titles)

    # ...and the specific named Subject Faculty on the entry gets notified
    # that a claim is waiting on THEM specifically (not just anyone with
    # the claims:review_faculty permission).
    subject_faculty_h = auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123")
    assert "Claim pending your review" in _titles(client, subject_faculty_h)


def test_event_creation_notifies_club_faculty_coordinators(client):
    president_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    r = client.post("/api/v1/clubs/club_commerce/events", json={
        "title": "Budgeting Workshop", "date": "2026-08-01", "venue": "Room 101", "budget": 500.0,
        "club_id": "club_commerce",
    }, headers=president_h)
    assert r.status_code == 200, r.text

    coordinator_h = auth_headers(client, "faculty.accounting@christuniversity.in", "faculty123")
    assert "New event proposal" in _titles(client, coordinator_h)


def test_club_linked_meeting_notifies_club_leadership(client):
    hod_h = auth_headers(client, "hod.commerce@christuniversity.in", "faculty123")
    r = client.post("/api/v1/faculty/meetings", json={
        "title": "Commerce Club Sync", "type": "club", "date": "2026-08-05", "time": "03:00 PM",
        "venue": "Block IV", "club_id": "club_commerce",
    }, headers=hod_h)
    assert r.status_code == 200

    president_h = auth_headers(client, "student.president@christuniversity.in", "student123")
    assert "New club meeting scheduled" in _titles(client, president_h)


def test_task_assignment_notifies_the_assignee():
    """TaskEngine.create_task itself should notify, independent of any one caller."""
    from app.core.database import SessionLocal
    from app.services.engines.task import task_engine

    db = SessionLocal()
    try:
        task = task_engine.create_task(
            db, title="Audit budget", description="", due_date="2026-08-01", priority="medium",
            assignee_id="std_regular_1", creator_id="fac_hod", source_module="clubs",
        )
        assert task.id
        from app.services.engines.notification import notification_engine
        unread = notification_engine.get_unread_for_user(db, user_id="std_regular_1")
        assert any(n.title == "New task assigned" for n in unread)
    finally:
        db.close()
