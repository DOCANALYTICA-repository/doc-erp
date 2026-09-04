"""A claim must be able to reach 'closed', and must survive a revision round trip.

Neither was possible. Five separate defects, one of them terminal:

  * list_claims omitted attendance_office, so the moment a Course Coordinator
    approved, the claim vanished from every review queue permanently. No other
    route lists claims at that stage.
  * resubmit_claim only reset entries when new missed_classes were supplied,
    so resubmitting a corrected reason left them rejected and the subject
    faculty got a permanent 403.
  * the attendance_office branch ignored `action` and closed the claim as a
    success even when called with reject.
  * super_admin was stuck at subject_faculty with an empty entry list.
"""
from .conftest import auth_headers

STUDENT = ("student.regular@christuniversity.in", "student123")
CLASS_TEACHER = ("teacher.class@christuniversity.in", "faculty123")
HOD = ("hod.commerce@christuniversity.in", "faculty123")
ADMIN = ("admin@christuniversity.in", "admin123")


def _submit(client, date_range):
    student_h = auth_headers(client, *STUDENT)
    tt = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A",
        headers=student_h,
    ).json()
    assert tt, "no timetable sessions seeded"

    r = client.post("/api/v1/claims", headers=student_h, json={
        "category": "medical",
        "academic_year": "2025-2026",
        "semester": "5",
        "programme": "B.Com (Hons)",
        "section": "A",
        "date_range": date_range,
        "reason": "Hospitalised.",
        "missed_classes": [{
            "subject": tt[0]["subject"], "date": "2026-08-03",
            "hour": tt[0]["hour"], "subject_faculty_id": tt[0]["faculty_id"],
        }],
    })
    assert r.status_code == 200, r.text
    return r.json()


def _act(client, creds, claim_id, action, feedback=None):
    url = f"/api/v1/claims/{claim_id}/approve-stage?action={action}"
    if feedback:
        url += f"&feedback={feedback}"
    return client.post(url, headers=auth_headers(client, *creds))


def _stage(client, creds, claim_id):
    r = client.get(f"/api/v1/claims/{claim_id}", headers=auth_headers(client, *creds))
    assert r.status_code == 200, r.text
    return r.json()["current_workflow_stage"], r.json()["status"]


def test_timetable_sessions_name_the_faculty_who_teach_them(client):
    """BLK-04: the picker showed a subject and an hour and no way to tell
    whose class it was. The dev mock supplied the field under a different key,
    which is exactly why it worked offline and broke online."""
    h = auth_headers(client, *STUDENT)
    tt = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A", headers=h
    ).json()
    assert tt
    assert all(s["faculty_name"] for s in tt), tt


def test_claim_walks_all_the_way_to_closed(client):
    claim = _submit(client, "2026-08-03 to 2026-08-03")
    cid = claim["id"]

    assert _act(client, CLASS_TEACHER, cid, "approve").status_code == 200
    assert _stage(client, ADMIN, cid)[0] == "subject_faculty"

    # super_admin acts for the subject faculty. This used to be a no-op.
    assert _act(client, ADMIN, cid, "approve").status_code == 200
    assert _stage(client, ADMIN, cid)[0] == "course_coordinator"

    assert _act(client, HOD, cid, "approve").status_code == 200
    stage, status = _stage(client, ADMIN, cid)
    assert (stage, status) == ("attendance_office", "approved")

    # THE terminal bug: at this point the claim used to be invisible to every
    # reviewer, so it could never be closed by anyone.
    hod_queue = client.get("/api/v1/claims", headers=auth_headers(client, *HOD)).json()["items"]
    assert cid in {c["id"] for c in hod_queue}, (
        "an approved claim is invisible to every review queue — it can never close"
    )

    assert _act(client, HOD, cid, "approve").status_code == 200
    assert _stage(client, ADMIN, cid) == ("closed", "closed")


def test_claim_survives_revise_then_resubmit_then_approve(client):
    claim = _submit(client, "2026-08-04 to 2026-08-04")
    cid = claim["id"]

    assert _act(client, CLASS_TEACHER, cid, "approve").status_code == 200
    # Sent back from the subject_faculty stage.
    assert _act(client, ADMIN, cid, "revise", feedback="Attach the certificate").status_code == 200
    assert _stage(client, ADMIN, cid)[1] == "returned"

    # Resubmit with ONLY a corrected reason — no new missed_classes. This is
    # the case that deadlocked: entries stayed rejected forever.
    student_h = auth_headers(client, *STUDENT)
    r = client.put(f"/api/v1/claims/{cid}/resubmit", headers=student_h,
                    json={"reason": "Hospitalised — certificate now attached."})
    assert r.status_code == 200, r.text
    assert _stage(client, ADMIN, cid) == ("initial_review", "submitted")

    # The claim can now move forward again rather than being stuck.
    assert _act(client, CLASS_TEACHER, cid, "approve").status_code == 200
    assert _act(client, ADMIN, cid, "approve").status_code == 200
    assert _stage(client, ADMIN, cid)[0] == "course_coordinator"


def test_rejecting_at_the_final_stage_is_not_recorded_as_success(client):
    claim = _submit(client, "2026-08-05 to 2026-08-05")
    cid = claim["id"]

    _act(client, CLASS_TEACHER, cid, "approve")
    _act(client, ADMIN, cid, "approve")
    _act(client, HOD, cid, "approve")
    assert _stage(client, ADMIN, cid)[0] == "attendance_office"

    assert _act(client, HOD, cid, "reject", feedback="Certificate not genuine").status_code == 200
    stage, status = _stage(client, ADMIN, cid)
    assert stage == "closed"
    assert status == "rejected", f"a rejection was recorded as {status!r}"
