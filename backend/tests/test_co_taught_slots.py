"""A slot taught by two people: either may sign the hour, one signature clears it.

The 6 B.Com AFA sheet lists Deep Learning and NLP as "Nisha /
Thirunavukkarasu". With one faculty_id per slot every claimed DL hour went to
Nisha, and Thirunavukkarasu — who teaches the same students — could neither
see nor sign it.
"""
from .conftest import auth_headers

LIONEL = ("lionel.dsouza@bcomafh.christuniversity.in", "123")
CLASS_TEACHER = ("simon.giri@christuniversity.in", "123")
NISHA = ("nisha@christuniversity.in", "123")
THIRU = ("thirunavukkarasu@christuniversity.in", "123")
HOD = ("hod.commerce@christuniversity.in", "123")

THIRU_ID = "fac_afa_thirunavukkarasu"
AFA = {"programme": "B.Com (Finance and Accountancy)", "semester": "6", "section": "A"}
DL = "Deep Learning and Natural Language Processing"
AT_SUBJECT = "cl_afa_subject"  # seeded: its DL hour is already signed


def _ids(client, creds, view="pending"):
    r = client.get(f"/api/v1/claims?view={view}", headers=auth_headers(client, *creds))
    assert r.status_code == 200, r.text
    return {c["id"] for c in r.json()["items"]}


def _act(client, creds, claim_id):
    return client.post(
        f"/api/v1/claims/{claim_id}/approve-stage?action=approve",
        headers=auth_headers(client, *creds),
    )


def _slot(client, subject, day):
    tt = client.get(
        "/api/v1/claims/timetable", headers=auth_headers(client, *LIONEL),
        params={**AFA, "batch": "Batch 1"},
    ).json()
    return next(s for s in tt if s["subject"] == subject and s["day_of_week"] == day)


def _submit(client, date, slots, **extra):
    r = client.post("/api/v1/claims", headers=auth_headers(client, *LIONEL), json={
        "category": "medical", "academic_year": "2026-2027", **AFA,
        "date_range": f"{date} to {date}", "reason": "Fever.",
        "missed_classes": [
            {"subject": s["subject"], "course_code": s["course_code"], "date": date,
             "hour": s["hour"], "subject_faculty_id": s["faculty_id"], **extra}
            for s in slots
        ],
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_the_timetable_names_both_teachers(client):
    dl = _slot(client, DL, "Monday")
    assert (dl["faculty_name"], dl["co_faculty_name"]) == ("Nisha", "Thirunavukkarasu")
    assert _slot(client, "Behavioural Finance", "Monday")["co_faculty_id"] is None


def test_an_hour_signed_by_one_co_teacher_is_done_for_the_other(client):
    # cl_afa_subject's DL hour is already approved — it is in neither
    # teacher's to-do list, and both can still open the claim.
    for creds in (NISHA, THIRU):
        assert AT_SUBJECT not in _ids(client, creds, "pending")
        assert AT_SUBJECT in _ids(client, creds, "actioned")


def test_either_co_teacher_can_sign_and_one_signature_clears_it(client):
    # Monday 2 November 2026: DL at 9.45 (co-taught), RMD at 7 (Simon alone).
    claim = _submit(client, "2026-11-02", [_slot(client, DL, "Monday"), _slot(client, "Risk Management & Derivatives", "Monday")])
    cid = claim["id"]
    entries = {e["subject"]: e for e in claim["participants"][0]["entries"]}
    assert entries[DL]["co_faculty_id"] == THIRU_ID
    assert entries["Risk Management & Derivatives"]["co_faculty_id"] is None

    # Not before the Class Teacher has let it through.
    assert cid not in _ids(client, THIRU)
    assert _act(client, CLASS_TEACHER, cid).status_code == 200

    # Now both co-teachers have it, and the student is told either will do.
    assert cid in _ids(client, NISHA) and cid in _ids(client, THIRU)
    pending = client.get(f"/api/v1/claims/{cid}", headers=auth_headers(client, *LIONEL)).json()["pending_approvals"]
    dl_line = next(p for p in pending if p["subject"] == DL)
    assert (dl_line["faculty_name"], dl_line["co_faculty_name"]) == ("Nisha", "Thirunavukkarasu")

    # The second-named teacher signs; that settles it for Nisha too.
    assert _act(client, THIRU, cid).status_code == 200
    assert cid not in _ids(client, NISHA, "pending")
    assert cid in _ids(client, NISHA, "actioned")
    assert _act(client, NISHA, cid).status_code == 403

    # Simon's RMD hour is still outstanding, so the claim has not moved on.
    body = client.get(f"/api/v1/claims/{cid}", headers=auth_headers(client, *LIONEL)).json()
    assert body["current_workflow_stage"] == "subject_faculty"
    assert [p["subject"] for p in body["pending_approvals"]] == ["Risk Management & Derivatives"]


def test_a_student_cannot_name_a_co_teacher(client):
    """The co-teacher comes from the timetable, never from the request."""
    bf = _slot(client, "Behavioural Finance", "Tuesday")
    claim = _submit(client, "2026-11-03", [bf], co_faculty_id="fac_afa_sukanya")
    assert claim["participants"][0]["entries"][0]["co_faculty_id"] is None


def test_a_slot_cannot_be_co_taught_by_its_own_teacher(client):
    r = client.post("/api/v1/claims/timetable", headers=auth_headers(client, *HOD), json={
        **AFA, "day_of_week": "Saturday", "subject": DL, "hour": "07:00 AM - 08:00 AM",
        "faculty_id": "fac_afa_nisha", "co_faculty_id": "fac_afa_nisha",
    })
    assert r.status_code == 422
