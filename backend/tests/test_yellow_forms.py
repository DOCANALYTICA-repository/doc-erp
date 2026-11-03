"""Yellow forms: a club's pre-approval, then its claim sheet.

The flow the department asked for, end to end:

  club files a pre-approval (event + students)
    -> the club's Faculty Coordinator approves
    -> the Associate HOD approves           (both before the event starts)
  event happens
  club files ONE claim sheet against it (dates, periods, attendance with and
  without claims) -> the Claims Coordinator approves -> attendance office.

Every form here is created by the test itself, with dates relative to the
real clock, so nothing depends on seeded yellow-form fixtures. Time is moved
by patching app.core.clock.today, the single definition of "today" (IST).
"""
import csv
import io
from collections import Counter
from datetime import date, timedelta

import pytest

from app.core import capabilities, clock
from app.services.engines.notification import notification_engine

from .conftest import auth_headers
from .test_query_counts import assert_query_budget

SHIVA = ("shiva.prakash@bcomafh.christuniversity.in", "123")      # DOC Analytica, Core (top rank)
AFFAN = ("affan.a@bcomsfh.christuniversity.in", "123")            # DOC Analytica, Associate (bottom rank)
REYNAL = ("reynal@christuniversity.in", "123")                    # DOC Analytica Faculty Coordinator
ANUSHA = ("anusha.iyer@christuniversity.in", "123")               # Associate HOD
SHARATH = ("sharath@christuniversity.in", "123")                  # Claims Coordinator
RAHUL = ("student.president@christuniversity.in", "123")          # Commerce Club President
DSOUZA = ("faculty.accounting@christuniversity.in", "123")        # Commerce Club Faculty Coordinator
NEHA = ("student.regular2@christuniversity.in", "123")            # member of neither club
ADMIN = ("admin@christuniversity.in", "123")

DA = "club_doc_analytica"
COMMERCE = "club_commerce"
API = "/api/v1/yellow-forms"

REAL_TODAY = clock.today()

AFFAN_ROW = {"register_number": "2611507", "student_name": "Affan Ahmed A", "class_name": "1 BCom SF", "role": "DOC Analytica"}
HARIHARAN_ROW = {"register_number": "2511148", "student_name": "Hariharan", "class_name": "3 BCom AFA", "role": "DOC Analytica"}
GUEST_ROW = {"register_number": "9900001", "student_name": "Guest Volunteer", "class_name": "3 BCom", "role": "Volunteer"}
RAHUL_ROW = {"register_number": "21COM5A001", "student_name": "Rahul Sharma", "class_name": "5 B.Com (Hons) A", "role": "Guest speaker host"}

DA_LEADERSHIP = {
    # Core (level 10) and the Directors (level 20).
    "std_2411162", "std_2411134", "std_2411181",
    "std_2511159", "std_2511132", "std_2411151", "std_2411155", "std_2411180", "std_2411188",
    "std_2410411", "std_2511721", "std_2410407", "std_2410148", "std_2501251",
}

_headers_cache: dict = {}


def _h(client, creds) -> dict:
    if creds[0] not in _headers_cache:
        _headers_cache[creds[0]] = auth_headers(client, *creds)
    return _headers_cache[creds[0]]


def _day(offset: int) -> date:
    return REAL_TODAY + timedelta(days=offset)


def _freeze(monkeypatch, day: date) -> None:
    monkeypatch.setattr(clock, "today", lambda: day)


@pytest.fixture(autouse=True)
def _pin_today(monkeypatch):
    # REAL_TODAY is read at import: a run crossing IST midnight would otherwise
    # have the server stamp tomorrow's date. _freeze still overrides it.
    _freeze(monkeypatch, REAL_TODAY)


def _payload(start=10, days=1, students=None, name="Yellow Form Test Event"):
    begin = _day(start)
    return {
        "event_name": name,
        "venue": "Main Auditorium",
        "event_start_date": begin.isoformat(),
        "event_end_date": (begin + timedelta(days=days - 1)).isoformat(),
        "students": students if students is not None else [AFFAN_ROW, HARIHARAN_ROW, GUEST_ROW],
    }


def _create(client, creds=SHIVA, club=DA, **kw):
    r = client.post(f"{API}/clubs/{club}/pre-approvals", headers=_h(client, creds), json=_payload(**kw))
    assert r.status_code == 200, r.text
    return r.json()


def _submit(client, form_id, creds=SHIVA):
    return client.post(f"{API}/pre-approvals/{form_id}/submit", headers=_h(client, creds))


def _review(client, creds, form_id, action="approve", comments=None):
    body = {"action": action}
    if comments is not None:
        body["comments"] = comments
    return client.post(f"{API}/pre-approvals/{form_id}/review", headers=_h(client, creds), json=body)


def _detail(client, creds, form_id):
    return client.get(f"{API}/pre-approvals/{form_id}", headers=_h(client, creds))


def _approved(client, creds=SHIVA, club=DA, fc=REYNAL, **kw):
    form = _create(client, creds=creds, club=club, **kw)
    assert _submit(client, form["id"], creds).status_code == 200
    assert _review(client, fc, form["id"]).status_code == 200
    r = _review(client, ANUSHA, form["id"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    return r.json()


def _student(form, register_number):
    return next(s for s in form["students"] if s["register_number"] == register_number)


def _sheet_row(form, register_number, entries, with_=90.0, without=85.0, **extra):
    return {
        "pre_approval_student_id": _student(form, register_number)["id"],
        "attendance_with_claims": with_,
        "attendance_without_claims": without,
        "entries": entries,
        **extra,
    }


def _create_sheet(client, form_id, students, creds=SHIVA):
    return client.post(
        f"{API}/pre-approvals/{form_id}/claim-sheet", headers=_h(client, creds), json={"students": students},
    )


def _notified(entity_id: str) -> Counter:
    from app.core.database import SessionLocal
    from app.models.notification import Notification

    db = SessionLocal()
    try:
        return Counter(uid for (uid,) in db.query(Notification.user_id).filter(Notification.entity_id == entity_id))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# The whole flow
# ---------------------------------------------------------------------------

def test_club_pre_approval_to_forwarded_claim_sheet(client, monkeypatch):
    form = _create(client, start=10, days=2)
    start, end = _day(10), _day(11)
    assert form["status"] == "draft"
    assert form["reference_number"].startswith(f"PAF-{REAL_TODAY.year}-")
    assert form["student_count"] == 3
    assert form["approval_deadline"] == (start - timedelta(days=1)).isoformat()
    assert form["viewer_can_submit"] and form["viewer_can_edit"] and form["viewer_can_delete"]
    # Linked to the student's account by register number; a guest has none.
    assert _student(form, "2611507")["student_id"] == "std_2611507"
    assert _student(form, "9900001")["student_id"] is None
    expected_year = f"{start.year}-{start.year + 1}" if start.month >= 6 else f"{start.year - 1}-{start.year}"
    assert form["academic_year"] == expected_year

    r = _submit(client, form["id"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "faculty_coordinator_review"
    assert r.json()["submitted_at"] == REAL_TODAY.isoformat()
    assert r.json()["pending_with"] == "Dr. Reynal (Faculty Coordinator)"
    assert r.json()["viewer_can_edit"] is False

    assert _detail(client, REYNAL, form["id"]).json()["viewer_can_review"] is True
    r = _review(client, REYNAL, form["id"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "associate_hod_review"
    assert body["faculty_coordinator_approved_by_name"] == "Dr. Reynal"
    assert body["faculty_coordinator_approved_at"] == REAL_TODAY.isoformat()
    assert body["pending_with"] == "Dr. Anusha Iyer (Associate HOD)"

    r = _review(client, ANUSHA, form["id"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    assert body["status_label"] == "Pre-approved"
    assert body["associate_hod_approved_by_name"] == "Dr. Anusha Iyer"
    assert body["pending_with"] is None
    # The event has not happened yet.
    assert body["event_completed"] is False
    assert _detail(client, SHIVA, form["id"]).json()["viewer_can_file_claim_sheet"] is False

    # Same-day filing is allowed: the event ends today.
    _freeze(monkeypatch, end)
    detail = _detail(client, SHIVA, form["id"]).json()
    assert detail["event_completed"] is True
    assert detail["viewer_can_file_claim_sheet"] is True

    r = _create_sheet(client, form["id"], [
        _sheet_row(body, "2611507", [{"date": start.isoformat(), "periods": ["9_45AM"]}], 97.78, 97.78),
        _sheet_row(body, "2511148", [
            {"date": start.isoformat(), "periods": ["10_45AM", "8AM"]},
            {"date": end.isoformat(), "periods": ["7AM"]},
        ], 88.5, 84.25, role="Volunteer lead"),
    ])
    assert r.status_code == 200, r.text
    sheet = r.json()
    assert sheet["status"] == "draft"
    assert sheet["reference_number"].startswith(f"YF-{end.year}-")
    assert sheet["student_count"] == 2 and sheet["row_count"] == 3
    hari = next(s for s in sheet["students"] if s["register_number"] == "2511148")
    assert hari["role"] == "Volunteer lead"
    # Periods come back in vocabulary order.
    assert hari["entries"][0]["periods"] == ["8AM", "10_45AM"]
    # The attached pre-approved list travels with the sheet.
    assert {s["register_number"] for s in sheet["pre_approval"]["students"]} == {"2611507", "2511148", "9900001"}
    assert sheet["pre_approval"]["associate_hod_approved_by_name"] == "Dr. Anusha Iyer"
    assert sheet["viewer_can_submit"] is True

    r = client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "claims_coordinator_review"
    assert r.json()["late_submission_flag"] is False

    assert client.get(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, SHARATH)).json()["viewer_can_review"] is True
    r = client.post(f"{API}/claim-sheets/{sheet['id']}/review", headers=_h(client, SHARATH), json={"action": "approve"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    assert r.json()["status_label"] == "Approved — forwarded to attendance office"
    assert r.json()["reviewed_by_name"] == "Sharath"

    detail = _detail(client, SHIVA, form["id"]).json()
    assert detail["claim_sheet_id"] == sheet["id"]
    assert detail["claim_sheet_status"] == "approved"
    assert detail["viewer_can_file_claim_sheet"] is False


def test_workflow_is_served_as_data(client):
    r = client.get(f"{API}/workflow", headers=_h(client, AFFAN))
    assert r.status_code == 200
    wf = r.json()
    assert [p["id"] for p in wf["periods"]] == ["7AM", "8AM", "9AM", "9_45AM", "10_45AM"]
    assert wf["periods"][3]["column"] == "Period 9_45AM"
    assert wf["pre_approval"]["stage_order"] == ["draft", "faculty_coordinator_review", "associate_hod_review", "approved"]
    assert [s["id"] for s in wf["pre_approval"]["stages"]] == wf["pre_approval"]["stage_order"]
    assert wf["claim_sheet"]["stage_order"] == ["draft", "claims_coordinator_review", "approved"]
    assert wf["claim_sheet"]["status_labels"]["approved"] == "Approved — forwarded to attendance office"
    assert wf["actions"] == ["approve", "revise", "reject"]


# ---------------------------------------------------------------------------
# Who may file, read and act
# ---------------------------------------------------------------------------

def test_bottom_rank_member_can_read_but_not_file(client):
    r = client.post(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, AFFAN), json=_payload())
    assert r.status_code == 403
    assert client.get(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, AFFAN)).status_code == 200
    assert client.get(f"{API}/clubs/{DA}/eligible-students", headers=_h(client, AFFAN)).status_code == 403

    form = _create(client)
    assert _detail(client, AFFAN, form["id"]).status_code == 200
    viewed = _detail(client, AFFAN, form["id"]).json()
    assert not (viewed["viewer_can_edit"] or viewed["viewer_can_submit"] or viewed["viewer_can_delete"])
    assert _submit(client, form["id"], AFFAN).status_code == 403
    assert client.delete(f"{API}/pre-approvals/{form['id']}", headers=_h(client, AFFAN)).status_code == 403


def test_a_president_of_another_club_files_nothing_here(client):
    """The Club President tag is global; filing rights come from rank in THIS club."""
    from app.core import yellow_form_access
    from app.core.database import SessionLocal
    from app.models.club import ClubMember
    from app.models.user import User

    db = SessionLocal()
    db.add(ClubMember(
        id="mbr_test_rahul_in_da", student_id="std_president", club_id=DA, role="Associate – Audit",
        status="active", academic_year="2026-2027", hierarchy_level_id="chl_da_30_audit",
    ))
    db.commit()
    try:
        bootstrap = client.get(f"/api/v1/clubs/{DA}/bootstrap", headers=_h(client, RAHUL)).json()
        assert bootstrap["capabilities"]["can_file_yellow_forms"] is False
        assert client.post(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, RAHUL), json=_payload()).status_code == 403
        assert client.get(f"{API}/clubs/{DA}/eligible-students", headers=_h(client, RAHUL)).status_code == 403
        rahul = db.get(User, "std_president")
        assert yellow_form_access.can_file(db, rahul, DA) is False
        assert yellow_form_access.can_file(db, rahul, COMMERCE) is True
    finally:
        db.query(ClubMember).filter(ClubMember.id == "mbr_test_rahul_in_da").delete()
        db.commit()
        db.close()


def test_a_club_without_a_faculty_coordinator_cannot_submit(client):
    # The Cultural Committee has no Faculty Coordinator; Neha is a Core Member of it.
    form = _create(client, creds=NEHA, club="club_cultural", students=[GUEST_ROW])
    assert form["viewer_can_edit"] is True
    assert form["viewer_can_submit"] is False
    assert "no Faculty Coordinator" in form["submit_blocked_reason"]
    r = _submit(client, form["id"], NEHA)
    assert r.status_code == 400
    assert r.json()["detail"] == form["submit_blocked_reason"]
    assert client.delete(f"{API}/pre-approvals/{form['id']}", headers=_h(client, NEHA)).status_code == 200


def test_non_member_student_is_refused(client):
    form = _create(client)
    assert client.get(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, NEHA)).status_code == 403
    assert client.get(f"{API}/clubs/{DA}/claim-sheets", headers=_h(client, NEHA)).status_code == 403
    assert client.post(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, NEHA), json=_payload()).status_code == 403
    assert _detail(client, NEHA, form["id"]).status_code == 403
    assert _submit(client, form["id"]).status_code == 200
    assert _detail(client, NEHA, form["id"]).status_code == 403


def test_faculty_coordinator_is_scoped_to_their_own_club(client):
    da_form = _create(client)
    assert _submit(client, da_form["id"]).status_code == 200

    r = _review(client, DSOUZA, da_form["id"])
    assert r.status_code == 403
    assert r.json()["detail"] == "You are not the assigned Faculty Coordinator for this club"
    assert _detail(client, DSOUZA, da_form["id"]).status_code == 403

    commerce_form = _create(client, creds=RAHUL, club=COMMERCE, students=[
        {"register_number": "21COM5A003", "student_name": "Vikram Aditya", "class_name": "5 B.Com (Hons) A", "role": "Commerce Club"},
    ])
    assert _submit(client, commerce_form["id"], RAHUL).status_code == 200
    assert _review(client, REYNAL, commerce_form["id"]).status_code == 403
    assert _detail(client, DSOUZA, commerce_form["id"]).json()["viewer_can_review"] is True
    r = _review(client, DSOUZA, commerce_form["id"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "associate_hod_review"


def test_each_reviewer_acts_only_at_their_own_stage(client):
    form = _create(client)
    assert _submit(client, form["id"]).status_code == 200

    # Faculty Coordinator stage.
    for creds in (ANUSHA, SHARATH):
        r = _review(client, creds, form["id"])
        assert r.status_code == 403
        assert r.json()["detail"] == "You are not the assigned Faculty Coordinator for this club"
    assert _detail(client, ANUSHA, form["id"]).json()["viewer_can_review"] is False
    assert _review(client, REYNAL, form["id"]).status_code == 200

    # Associate HOD stage.
    for creds in (REYNAL, SHARATH, SHIVA):
        r = _review(client, creds, form["id"])
        assert r.status_code == 403
        assert r.json()["detail"] == "Only the Associate HOD can give final pre-approval"
    assert _detail(client, REYNAL, form["id"]).json()["viewer_can_review"] is False
    assert _review(client, ANUSHA, form["id"]).status_code == 200

    # Approved: nobody reviews it again, the Claims Coordinator included.
    assert _review(client, SHARATH, form["id"]).status_code == 400
    assert _review(client, ANUSHA, form["id"]).status_code == 400


def test_claims_coordinator_reviews_claim_sheets_and_nobody_else_does(client, monkeypatch):
    form = _approved(client, start=3)
    _freeze(monkeypatch, _day(3))
    sheet = _create_sheet(client, form["id"], [
        _sheet_row(form, "2611507", [{"date": _day(3).isoformat(), "periods": ["9AM"]}]),
    ]).json()
    assert client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA)).status_code == 200

    for creds in (REYNAL, ANUSHA, SHIVA):
        r = client.post(f"{API}/claim-sheets/{sheet['id']}/review", headers=_h(client, creds), json={"action": "approve"})
        assert r.status_code == 403
        assert r.json()["detail"] == "Only the Claims Coordinator can review claim sheets"


# ---------------------------------------------------------------------------
# "Before the event starts"
# ---------------------------------------------------------------------------

def test_the_approval_window_closes_when_the_event_starts(client, monkeypatch):
    in_review = _create(client, start=5)
    assert _submit(client, in_review["id"]).status_code == 200
    draft = _create(client, start=5)

    # The day before the event is the last day anyone can act.
    _freeze(monkeypatch, _day(4))
    assert _detail(client, REYNAL, in_review["id"]).json()["viewer_can_review"] is True
    assert _detail(client, SHIVA, draft["id"]).json()["is_expired"] is False

    _freeze(monkeypatch, _day(5))
    r = _review(client, REYNAL, in_review["id"])
    assert r.status_code == 400
    assert r.json()["detail"] == "The event has already started — pre-approval can no longer be granted."
    viewed = _detail(client, REYNAL, in_review["id"]).json()
    assert viewed["is_expired"] is True
    assert viewed["viewer_can_review"] is False
    assert viewed["pending_with"] is None
    queue = client.get(f"{API}/queue", headers=_h(client, REYNAL)).json()
    assert in_review["id"] not in {f["id"] for f in queue["pre_approvals"]}

    assert _submit(client, draft["id"]).status_code == 400
    viewed = _detail(client, SHIVA, draft["id"]).json()
    assert viewed["is_expired"] is True
    assert viewed["viewer_can_submit"] is False and viewed["viewer_can_edit"] is False
    # An expired draft can still be cleared away.
    assert viewed["viewer_can_delete"] is True
    assert client.put(f"{API}/pre-approvals/{draft['id']}", headers=_h(client, SHIVA), json={"venue": "x"}).status_code == 400


def test_a_pre_approval_cannot_be_drafted_for_an_event_already_under_way(client):
    for start in (0, -3):
        r = client.post(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, SHIVA), json=_payload(start=start))
        assert r.status_code == 400, r.text


def test_event_window_and_duplicate_students_are_validated(client):
    bad = _payload(days=1)
    bad["event_end_date"] = _day(9).isoformat()
    assert client.post(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, SHIVA), json=bad).status_code == 422
    assert client.post(
        f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, SHIVA), json=_payload(days=32),
    ).status_code == 422
    assert client.post(
        f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, SHIVA),
        json=_payload(students=[AFFAN_ROW, dict(AFFAN_ROW, student_name="Someone else")]),
    ).status_code == 422

    form = _create(client, start=10)
    r = client.put(
        f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA),
        json={"event_end_date": _day(50).isoformat()},
    )
    assert r.status_code == 400
    assert "30 days" in r.json()["detail"]


# ---------------------------------------------------------------------------
# Returned, rejected, edited, deleted
# ---------------------------------------------------------------------------

def test_a_returned_form_restarts_at_the_faculty_coordinator(client):
    form = _create(client)
    assert _submit(client, form["id"]).status_code == 200
    assert _review(client, REYNAL, form["id"]).status_code == 200

    r = _review(client, ANUSHA, form["id"], "revise")
    assert r.status_code == 400, "a send-back without a reason was accepted"
    r = _review(client, ANUSHA, form["id"], "revise", "Add the venue and the accompanying faculty member.")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "returned"
    assert body["review_comments"] == "Add the venue and the accompanying faculty member."
    assert body["last_reviewed_by_name"] == "Dr. Anusha Iyer"
    assert body["last_reviewed_stage"] == "associate_hod_review"
    # Sending back clears nothing; resubmitting does (below).
    assert body["faculty_coordinator_approved_by_name"] == "Dr. Reynal"
    assert body["viewer_can_edit"] is False  # the Associate HOD is not a filer

    mine = _detail(client, SHIVA, form["id"]).json()
    assert mine["viewer_can_edit"] and mine["viewer_can_submit"]
    r = client.put(
        f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA),
        json={"venue": "Seminar Hall 2", "students": [HARIHARAN_ROW, AFFAN_ROW]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["venue"] == "Seminar Hall 2"
    # students REPLACES the list, in the order given.
    assert [s["register_number"] for s in r.json()["students"]] == ["2511148", "2611507"]

    r = _submit(client, form["id"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "faculty_coordinator_review"
    assert body["faculty_coordinator_approved_by"] is None
    assert body["faculty_coordinator_approved_at"] is None
    assert body["associate_hod_approved_by"] is None
    assert body["review_comments"] is None
    # The Associate HOD cannot skip ahead on the strength of the old approval.
    assert _review(client, ANUSHA, form["id"]).status_code == 403
    assert _review(client, REYNAL, form["id"]).status_code == 200


def test_reject_is_terminal(client):
    form = _create(client)
    assert _submit(client, form["id"]).status_code == 200
    assert _review(client, REYNAL, form["id"], "reject").status_code == 400
    r = _review(client, REYNAL, form["id"], "reject", "This is an inter-club event — the organising club should file it.")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"

    assert _submit(client, form["id"]).status_code == 400
    assert client.put(f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA), json={"venue": "x"}).status_code == 400
    assert client.delete(f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA)).status_code == 400
    assert _review(client, REYNAL, form["id"]).status_code == 400
    viewed = _detail(client, SHIVA, form["id"]).json()
    assert not any(viewed[f] for f in ("viewer_can_edit", "viewer_can_submit", "viewer_can_delete", "viewer_can_review"))


def test_only_a_draft_can_be_deleted(client):
    form = _create(client)
    assert client.delete(f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA)).status_code == 200
    assert _detail(client, SHIVA, form["id"]).status_code == 404

    form = _create(client)
    assert _submit(client, form["id"]).status_code == 200
    assert client.delete(f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA)).status_code == 400


def test_submit_needs_at_least_one_student(client):
    form = _create(client, students=[])
    r = _submit(client, form["id"])
    assert r.status_code == 400
    assert "at least one student" in r.json()["detail"]


# ---------------------------------------------------------------------------
# The claim sheet
# ---------------------------------------------------------------------------

def test_claim_sheet_waits_for_approval_and_the_end_of_the_event(client, monkeypatch):
    approved = _approved(client, start=3, days=2)
    unapproved = _create(client, start=3)
    assert _submit(client, unapproved["id"]).status_code == 200
    row = [_sheet_row(approved, "2611507", [{"date": _day(3).isoformat(), "periods": ["8AM"]}])]

    r = _create_sheet(client, approved["id"], row)
    assert r.status_code == 400
    assert "once the event is over" in r.json()["detail"]
    # Still running on its first day.
    _freeze(monkeypatch, _day(3))
    assert _create_sheet(client, approved["id"], row).status_code == 400

    _freeze(monkeypatch, _day(4))
    r = _create_sheet(client, unapproved["id"], [])
    assert r.status_code == 400
    assert "fully approved" in r.json()["detail"]

    r = _create_sheet(client, approved["id"], row)
    assert r.status_code == 200, r.text
    r = _create_sheet(client, approved["id"], row)
    assert r.status_code == 400
    assert "already has a claim sheet" in r.json()["detail"]


def test_a_deleted_draft_sheet_frees_the_slot(client, monkeypatch):
    form = _approved(client, start=3)
    _freeze(monkeypatch, _day(3))
    sheet = _create_sheet(client, form["id"], []).json()
    assert client.delete(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, SHIVA)).status_code == 200
    assert _create_sheet(client, form["id"], []).status_code == 200


@pytest.fixture(scope="module")
def validation_forms():
    """Two approved pre-approvals (event T+3..T+4). Every case below is
    refused, so no sheet is ever created and the pair can be shared."""
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app, follow_redirects=False)
    return _approved(c, start=3, days=2), _approved(c, start=3, days=2, name="Some other event")


@pytest.mark.parametrize("mutate,status,fragment", [
    (lambda form, other: [_sheet_row(other, "2611507", [])], 400, "not on the approved pre-approval list"),
    (lambda form, other: [_sheet_row(form, "2611507", [{"date": _day(2).isoformat(), "periods": ["7AM"]}])],
     400, "Affan Ahmed A (2611507): "),
    (lambda form, other: [_sheet_row(form, "2611507", [{"date": _day(5).isoformat(), "periods": ["7AM"]}])],
     400, "outside the event dates"),
    (lambda form, other: [_sheet_row(form, "2611507", [{"date": _day(3).isoformat(), "periods": ["6AM"]}])],
     422, None),
    (lambda form, other: [_sheet_row(form, "2611507", [{"date": _day(3).isoformat(), "periods": []}])],
     422, None),
    (lambda form, other: [_sheet_row(form, "2611507", [], 101, 90)], 400, "between 0 and 100"),
    (lambda form, other: [_sheet_row(form, "2611507", [], 90, -1)], 400, "between 0 and 100"),
    (lambda form, other: [_sheet_row(form, "2611507", [], 80, 85)], 400, "cannot be higher"),
    (lambda form, other: [_sheet_row(form, "2611507", [], 80.123, 70)], 400, "2 decimal places"),
    (lambda form, other: [_sheet_row(form, "2611507", []), _sheet_row(form, "2611507", [])], 400, "more than once"),
    (lambda form, other: [_sheet_row(form, "2611507", [
        {"date": _day(3).isoformat(), "periods": ["7AM"]}, {"date": _day(3).isoformat(), "periods": ["8AM"]},
    ])], 400, "listed more than once"),
])
def test_claim_sheet_rows_are_validated(client, monkeypatch, validation_forms, mutate, status, fragment):
    form, other = validation_forms
    _freeze(monkeypatch, _day(4))
    r = _create_sheet(client, form["id"], mutate(form, other))
    assert r.status_code == status, r.text
    if fragment:
        assert fragment in r.json()["detail"]


def test_claim_sheet_submit_is_strict(client, monkeypatch):
    form = _approved(client, start=3)
    _freeze(monkeypatch, _day(3))
    sheet = _create_sheet(client, form["id"], []).json()
    submit = lambda: client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA))
    put = lambda students: client.put(
        f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, SHIVA), json={"students": students},
    )

    assert "at least one student" in submit().json()["detail"]

    assert put([_sheet_row(form, "2611507", [])]).status_code == 200
    r = submit()
    assert r.status_code == 400 and "has no dates" in r.json()["detail"]

    entries = [{"date": _day(3).isoformat(), "periods": ["9_45AM"]}]
    assert put([_sheet_row(form, "2611507", entries, None, None)]).status_code == 200
    r = submit()
    assert r.status_code == 400
    assert r.json()["detail"] == "Enter Affan Ahmed A (2611507)'s attendance with and without claims."

    assert put([_sheet_row(form, "2611507", entries, 97.78, None)]).status_code == 200
    assert submit().status_code == 400

    assert put([_sheet_row(form, "2611507", entries, 97.78, 97.78)]).status_code == 200
    r = submit()
    assert r.status_code == 200, r.text
    # Submitted: no longer editable by the club.
    assert put([]).status_code == 400
    assert client.delete(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, SHIVA)).status_code == 400


def test_returned_sheet_is_fixed_and_resubmitted_and_rejected_is_final(client, monkeypatch):
    form = _approved(client, start=3)
    _freeze(monkeypatch, _day(3 + 8))  # a week and a day after the event: late
    row = lambda periods: [_sheet_row(form, "2611507", [{"date": _day(3).isoformat(), "periods": periods}])]
    sheet = _create_sheet(client, form["id"], row(["8AM"])).json()
    submitted = client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA)).json()
    assert submitted["late_submission_flag"] is True

    review = lambda body: client.post(f"{API}/claim-sheets/{sheet['id']}/review", headers=_h(client, SHARATH), json=body)
    assert review({"action": "revise", "comments": "  "}).status_code == 400
    r = review({"action": "revise", "comments": "Re-check the 8 AM period."})
    assert r.status_code == 200 and r.json()["status"] == "returned"
    assert r.json()["review_comments"] == "Re-check the 8 AM period."

    assert client.put(
        f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, SHIVA), json={"students": row(["9AM"])},
    ).status_code == 200
    r = client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA))
    assert r.status_code == 200 and r.json()["review_comments"] is None

    r = review({"action": "reject", "comments": "Duplicate of an earlier sheet."})
    assert r.json()["status"] == "rejected"
    assert client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA)).status_code == 400
    assert _create_sheet(client, form["id"], []).status_code == 400


def test_a_resubmission_keeps_the_club_s_own_late_flag(client, monkeypatch):
    form = _approved(client, start=3)
    end = _day(3)
    _freeze(monkeypatch, end + timedelta(days=5))
    sheet = _create_sheet(client, form["id"], [
        _sheet_row(form, "2611507", [{"date": end.isoformat(), "periods": ["8AM"]}]),
    ]).json()
    submit = lambda: client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA))
    assert submit().json()["late_submission_flag"] is False

    # Sent back and resubmitted past the club's deadline: the club still filed on time.
    _freeze(monkeypatch, end + timedelta(days=8))
    assert client.post(
        f"{API}/claim-sheets/{sheet['id']}/review", headers=_h(client, SHARATH),
        json={"action": "revise", "comments": "Re-check the 8 AM period."},
    ).status_code == 200
    r = submit()
    assert r.status_code == 200, r.text
    assert r.json()["late_submission_flag"] is False
    assert r.json()["submitted_at"] == (end + timedelta(days=8)).isoformat()


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

def _csv_rows(response):
    text = response.content.decode("utf-8")
    assert text.startswith("﻿"), "no BOM — Excel will misread the names"
    return list(csv.reader(io.StringIO(text[1:])))


def test_csv_export_matches_the_department_template(client, monkeypatch):
    hostile = {"register_number": "-2611999", "student_name": "=HYPERLINK(\"http://x\")", "class_name": "+1 BCom", "role": "@SUM(A1)"}
    form = _approved(client, start=3, days=2, students=[AFFAN_ROW, hostile, RAHUL_ROW])
    _freeze(monkeypatch, _day(4))
    sheet = _create_sheet(client, form["id"], [
        _sheet_row(form, "2611507", [{"date": _day(3).isoformat(), "periods": ["9_45AM"]}], 97.78, 97.78),
        _sheet_row(form, "-2611999", [
            {"date": _day(3).isoformat(), "periods": ["7AM", "10_45AM"]},
            {"date": _day(4).isoformat(), "periods": ["8AM"]},
        ], 100, 95.5),
        _sheet_row(form, "21COM5A001", [{"date": _day(4).isoformat(), "periods": ["9AM"]}], 75, 70),
    ]).json()

    r = client.get(f"{API}/claim-sheets/{sheet['id']}/export.csv", headers=_h(client, SHIVA))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"] == f'attachment; filename="{sheet["reference_number"]}.csv"'

    rows = _csv_rows(r)
    assert ",".join(rows[0]) == (
        "S.No,Register Number,Student Name,Class,Date,Period 7AM,Period 8AM,Period 9AM,"
        "Period 9_45AM,Period 10_45AM,Attendance With Claims,Attendance Without Claims,Role"
    )
    assert rows[1] == [
        "1", "2611507", "Affan Ahmed A", "1 BCom SF", _day(3).strftime("%d/%m/%Y"),
        "", "", "", "Period 9_45AM", "", "97.78", "97.78", "DOC Analytica",
    ]
    # One row per student per date, ordered by student then date.
    assert [r_[0] for r_ in rows[1:]] == ["1", "2", "3", "4"]
    assert rows[2][4] == _day(3).strftime("%d/%m/%Y") and rows[3][4] == _day(4).strftime("%d/%m/%Y")
    assert rows[2][5:10] == ["Period 7AM", "", "", "", "Period 10_45AM"]
    # Formula injection: text that a spreadsheet would execute is defused.
    assert rows[2][1:4] == ["'-2611999", "'=HYPERLINK(\"http://x\")", "'+1 BCom"]
    assert rows[2][12] == "'@SUM(A1)"
    # Numbers we format ourselves are left as numbers.
    assert rows[2][10:12] == ["100.00", "95.50"]

    assert client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA)).status_code == 200
    assert client.get(f"{API}/claim-sheets/{sheet['id']}/export.csv", headers=_h(client, SHARATH)).status_code == 200

    # Rahul is only listed on it — he may read it, his own attendance only, and not export it.
    viewed = client.get(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, RAHUL))
    assert viewed.status_code == 200
    assert viewed.json()["viewer_can_export"] is False
    assert {s["register_number"]: s["attendance_with_claims"] for s in viewed.json()["students"]} == {
        "2611507": None, "-2611999": None, "21COM5A001": 75,
    }
    assert client.get(f"{API}/claim-sheets/{sheet['id']}/export.csv", headers=_h(client, RAHUL)).status_code == 403


def test_only_the_student_and_the_people_handling_the_claim_see_attendance(client, monkeypatch):
    form = _approved(client, start=3, students=[AFFAN_ROW, HARIHARAN_ROW, RAHUL_ROW])
    commerce = _approved(client, creds=RAHUL, club=COMMERCE, fc=DSOUZA, start=3, students=[
        {"register_number": "21COM5A003", "student_name": "Vikram Aditya", "class_name": "5 B.Com (Hons) A", "role": "Commerce Club"},
    ])
    _freeze(monkeypatch, _day(3))
    on_day = lambda periods: [{"date": _day(3).isoformat(), "periods": periods}]
    sid = _create_sheet(client, form["id"], [
        _sheet_row(form, "2611507", on_day(["9AM"]), 76.5, 72.1),
        _sheet_row(form, "2511148", on_day(["8AM"]), 64.2, 58.9),
    ]).json()["id"]
    assert client.post(f"{API}/claim-sheets/{sid}/submit", headers=_h(client, SHIVA)).status_code == 200

    def attendance(sheet):
        return {s["register_number"]: (s["attendance_with_claims"], s["attendance_without_claims"]) for s in sheet["students"]}

    def get(creds, sheet_id=sid):
        return client.get(f"{API}/claim-sheets/{sheet_id}", headers=_h(client, creds)).json()

    # The club's filers and Faculty Coordinator, and the department's reviewers.
    for creds in (SHIVA, REYNAL, ANUSHA, SHARATH, ADMIN):
        sheet = get(creds)
        assert attendance(sheet) == {"2611507": (76.5, 72.1), "2511148": (64.2, 58.9)}, creds[0]
        assert sheet["attendance_redacted"] is False and sheet["viewer_can_export"] is True, creds[0]

    # Affan is a member but not a filer: his own figures, nobody else's, wherever he looks.
    own_only = {"2611507": (76.5, 72.1), "2511148": (None, None)}
    sheet = get(AFFAN)
    assert attendance(sheet) == own_only
    assert sheet["attendance_redacted"] is True and sheet["viewer_can_export"] is False
    club_list = client.get(f"{API}/clubs/{DA}/claim-sheets", headers=_h(client, AFFAN)).json()
    assert attendance(next(s for s in club_list if s["id"] == sid)) == own_only
    mine = client.get(f"{API}/mine", headers=_h(client, AFFAN)).json()
    assert attendance(next(s for s in mine["claim_sheets"] if s["id"] == sid)) == own_only
    assert client.get(f"{API}/claim-sheets/{sid}/export.csv", headers=_h(client, AFFAN)).status_code == 403

    # Rahul is on the pre-approval but was left off the sheet: nobody's.
    assert attendance(get(RAHUL)) == {"2611507": (None, None), "2511148": (None, None)}

    # A Faculty Coordinator without full access to the club files nothing, but sees it all.
    commerce_sid = _create_sheet(client, commerce["id"], [
        _sheet_row(commerce, "21COM5A003", on_day(["7AM"]), 81.0, 79.5),
    ], creds=RAHUL).json()["id"]
    assert client.post(f"{API}/claim-sheets/{commerce_sid}/submit", headers=_h(client, RAHUL)).status_code == 200
    sheet = get(DSOUZA, commerce_sid)
    assert sheet["viewer_can_edit"] is False
    assert attendance(sheet) == {"21COM5A003": (81.0, 79.5)} and sheet["viewer_can_export"] is True


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------

def test_drafts_are_the_club_s_own_business(client):
    form = _create(client)
    for creds in (ANUSHA, SHARATH):
        assert _detail(client, creds, form["id"]).status_code == 403
        listed = client.get(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, creds))
        assert listed.status_code == 200
        assert form["id"] not in {f["id"] for f in listed.json()}
    for creds in (REYNAL, AFFAN, ADMIN):
        assert _detail(client, creds, form["id"]).status_code == 200
        listed = client.get(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, creds)).json()
        assert form["id"] in {f["id"] for f in listed}

    assert _submit(client, form["id"]).status_code == 200
    for creds in (ANUSHA, SHARATH):
        assert _detail(client, creds, form["id"]).status_code == 200


def test_a_listed_student_sees_the_form_once_it_is_submitted(client, monkeypatch):
    form = _create(client, start=3, students=[RAHUL_ROW, AFFAN_ROW])
    assert _student(form, "21COM5A001")["student_id"] == "std_president"

    mine = client.get(f"{API}/mine", headers=_h(client, RAHUL)).json()
    assert form["id"] not in {f["id"] for f in mine["pre_approvals"]}
    assert _detail(client, RAHUL, form["id"]).status_code == 403

    assert _submit(client, form["id"]).status_code == 200
    mine = client.get(f"{API}/mine", headers=_h(client, RAHUL)).json()
    assert form["id"] in {f["id"] for f in mine["pre_approvals"]}
    viewed = _detail(client, RAHUL, form["id"])
    assert viewed.status_code == 200
    assert not any(v for k, v in viewed.json().items() if k.startswith("viewer_can_"))
    assert _detail(client, NEHA, form["id"]).status_code == 403

    assert _review(client, REYNAL, form["id"]).status_code == 200
    approved = _review(client, ANUSHA, form["id"]).json()
    _freeze(monkeypatch, _day(3))
    sheet = _create_sheet(client, form["id"], [
        _sheet_row(approved, "21COM5A001", [{"date": _day(3).isoformat(), "periods": ["7AM"]}]),
    ]).json()
    assert client.get(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, RAHUL)).status_code == 403
    assert client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA)).status_code == 200
    mine = client.get(f"{API}/mine", headers=_h(client, RAHUL)).json()
    assert sheet["id"] in {s["id"] for s in mine["claim_sheets"]}
    assert client.get(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, RAHUL)).status_code == 200
    assert client.get(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, NEHA)).status_code == 403


def test_queue_is_exactly_what_the_caller_can_act_on(client, monkeypatch):
    at_fc = _create(client, start=12)
    assert _submit(client, at_fc["id"]).status_code == 200
    at_ahod = _create(client, start=12)
    assert _submit(client, at_ahod["id"]).status_code == 200
    assert _review(client, REYNAL, at_ahod["id"]).status_code == 200
    commerce = _create(client, creds=RAHUL, club=COMMERCE, start=12, students=[
        {"register_number": "21COM5A002", "student_name": "Ananya Rao", "class_name": "5 B.Com (Hons) A", "role": "Commerce Club"},
    ])
    assert _submit(client, commerce["id"], RAHUL).status_code == 200
    expiring = _create(client, start=2)
    assert _submit(client, expiring["id"]).status_code == 200
    _freeze(monkeypatch, _day(2))

    def queue(creds):
        r = client.get(f"{API}/queue", headers=_h(client, creds))
        assert r.status_code == 200, r.text
        body = r.json()
        # Nothing the caller would be refused on, and nothing expired.
        assert all(f["viewer_can_review"] and not f["is_expired"] for f in body["pre_approvals"])
        assert all(s["viewer_can_review"] for s in body["claim_sheets"])
        return {f["id"] for f in body["pre_approvals"]}, body

    ids, body = queue(REYNAL)
    assert at_fc["id"] in ids and not ids & {at_ahod["id"], commerce["id"], expiring["id"]}
    assert all(f["club_id"] == DA and f["status"] == "faculty_coordinator_review" for f in body["pre_approvals"])
    assert body["claim_sheets"] == []

    ids, body = queue(ANUSHA)
    assert at_ahod["id"] in ids and not ids & {at_fc["id"], commerce["id"], expiring["id"]}
    assert all(f["status"] == "associate_hod_review" for f in body["pre_approvals"])

    ids, body = queue(DSOUZA)
    assert commerce["id"] in ids and not ids & {at_fc["id"], at_ahod["id"]}
    assert all(f["club_id"] == COMMERCE for f in body["pre_approvals"])

    ids, body = queue(SHARATH)
    assert ids == set()
    assert all(s["status"] == "claims_coordinator_review" for s in body["claim_sheets"])

    ids, body = queue(SHIVA)
    assert ids == set() and body["claim_sheets"] == []

    ids, _ = queue(ADMIN)
    assert {at_fc["id"], at_ahod["id"], commerce["id"]} <= ids and expiring["id"] not in ids

    # Oldest first.
    reynal_queue = client.get(f"{API}/queue", headers=_h(client, REYNAL)).json()["pre_approvals"]
    submitted = [(f["submitted_at"] or "") for f in reynal_queue]
    assert submitted == sorted(submitted)


def test_reviewed_lists_what_the_caller_acted_on(client):
    form = _create(client)
    assert _submit(client, form["id"]).status_code == 200
    assert _review(client, REYNAL, form["id"]).status_code == 200
    reviewed = client.get(f"{API}/reviewed", headers=_h(client, REYNAL)).json()
    assert form["id"] in {f["id"] for f in reviewed["pre_approvals"]}
    assert form["id"] not in {
        f["id"] for f in client.get(f"{API}/reviewed", headers=_h(client, ANUSHA)).json()["pre_approvals"]
    }


def test_a_former_reviewer_keeps_no_view_of_what_they_reviewed(client, monkeypatch):
    from app.core.database import SessionLocal
    from app.models.faculty_assignment import FacultyAssignment
    from app.models.user import User

    form = _approved(client, start=3)
    _freeze(monkeypatch, _day(3))
    sheet = _create_sheet(client, form["id"], [
        _sheet_row(form, "2611507", [{"date": _day(3).isoformat(), "periods": ["9AM"]}]),
    ]).json()
    assert client.post(f"{API}/claim-sheets/{sheet['id']}/submit", headers=_h(client, SHIVA)).status_code == 200
    assert client.post(
        f"{API}/claim-sheets/{sheet['id']}/review", headers=_h(client, SHARATH),
        json={"action": "revise", "comments": "Re-check the 9 AM period."},
    ).status_code == 200

    def reviewed(creds, key):
        return {x["id"] for x in client.get(f"{API}/reviewed", headers=_h(client, creds)).json()[key]}

    assert sheet["id"] in reviewed(SHARATH, "claim_sheets")
    assert form["id"] in reviewed(REYNAL, "pre_approvals")

    # The Claims Coordinator loses the role; Reynal is moved off the club.
    db = SessionLocal()
    sharath = db.get(User, "fac_sharath")
    assignment = db.get(FacultyAssignment, "fa_da_1")
    tags, sharath.role_tags_str, assignment.status = sharath.role_tags_str, "", "inactive"
    db.commit()
    try:
        assert client.get(f"{API}/claim-sheets/{sheet['id']}", headers=_h(client, SHARATH)).status_code == 403
        assert sheet["id"] not in reviewed(SHARATH, "claim_sheets")
        assert _detail(client, REYNAL, form["id"]).status_code == 403
        assert form["id"] not in reviewed(REYNAL, "pre_approvals")
    finally:
        sharath.role_tags_str, assignment.status = tags, "active"
        db.commit()
        db.close()


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def test_notifications_reach_the_right_people_exactly_once(client, monkeypatch):
    emailed = []
    monkeypatch.setattr(notification_engine, "_email_if_wanted", lambda db, n: emailed.append(n.user_id))

    def step(entity_id, action):
        before = _notified(entity_id)
        emailed.clear()
        action()
        delta = _notified(entity_id) - before
        assert all(count == 1 for count in delta.values()), f"notified twice: {delta}"
        return set(delta), set(emailed)

    form = _create(client, start=3)
    fid = form["id"]

    people, mailed = step(fid, lambda: _submit(client, fid))
    assert people == {"fac_reynal"} | DA_LEADERSHIP
    assert mailed == {"fac_reynal"}

    people, mailed = step(fid, lambda: _review(client, REYNAL, fid))
    assert people == {"fac_anusha"} | DA_LEADERSHIP
    assert mailed == {"fac_anusha"}

    people, mailed = step(fid, lambda: _review(client, ANUSHA, fid))
    # Creator (Shiva, who is also leadership) once; the linked students once.
    assert people == DA_LEADERSHIP | {"std_2611507", "std_2511148"}
    assert mailed == set()

    _freeze(monkeypatch, _day(3))
    approved = _detail(client, SHIVA, fid).json()
    sheet = _create_sheet(client, fid, [
        _sheet_row(approved, "2611507", [{"date": _day(3).isoformat(), "periods": ["9_45AM"]}], 97.78, 97.78),
    ]).json()
    sid = sheet["id"]

    people, mailed = step(sid, lambda: client.post(f"{API}/claim-sheets/{sid}/submit", headers=_h(client, SHIVA)))
    assert people == {"fac_sharath"} | DA_LEADERSHIP
    assert mailed == {"fac_sharath"}

    people, mailed = step(sid, lambda: client.post(
        f"{API}/claim-sheets/{sid}/review", headers=_h(client, SHARATH), json={"action": "approve"},
    ))
    assert people == DA_LEADERSHIP | {"std_2611507"}

    from app.core.database import SessionLocal
    from app.models.notification import Notification
    db = SessionLocal()
    try:
        note = db.query(Notification).filter(
            Notification.entity_id == sid, Notification.user_id == "std_2611507",
        ).one()
        assert "forwarded to the attendance office" in note.content
        assert (note.source_module, note.entity_type) == ("claims", "claim_sheet")
    finally:
        db.close()


def test_a_send_back_tells_the_club_and_emails_the_filer(client, monkeypatch):
    emailed = []
    monkeypatch.setattr(notification_engine, "_email_if_wanted", lambda db, n: emailed.append(n.user_id))
    form = _create(client)
    assert _submit(client, form["id"]).status_code == 200
    before = _notified(form["id"])
    emailed.clear()
    assert _review(client, REYNAL, form["id"], "revise", "Add the venue.").status_code == 200
    delta = _notified(form["id"]) - before
    assert set(delta) == DA_LEADERSHIP and all(c == 1 for c in delta.values())
    assert emailed == ["std_2411162"]


# ---------------------------------------------------------------------------
# Club workspace integration
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("creds,user_id,club_id,expected", [
    (SHIVA, "std_2411162", DA, True),
    (AFFAN, "std_2611507", DA, False),
    (REYNAL, "fac_reynal", DA, True),
    (RAHUL, "std_president", COMMERCE, True),
    (DSOUZA, "fac_subject_2", COMMERCE, False),
])
def test_bootstrap_capability_agrees_with_the_endpoints(client, creds, user_id, club_id, expected):
    from app.core import yellow_form_access
    from app.core.database import SessionLocal
    from app.models.user import User

    r = client.get(f"/api/v1/clubs/{club_id}/bootstrap", headers=_h(client, creds))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["capabilities"]["can_file_yellow_forms"] is expected
    assert "yellow-forms" in body["visible_tabs"]

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).one()
        assert yellow_form_access.can_file(db, user, club_id) is expected
    finally:
        db.close()

    create = client.post(f"{API}/clubs/{club_id}/pre-approvals", headers=_h(client, creds), json=_payload(students=[]))
    assert (create.status_code == 200) is expected, create.text


def test_yellow_forms_tab_sits_after_events():
    from app.api.v1.endpoints.clubs import ALL_CLUB_TABS, MEMBER_ONLY_TABS, RESTRICTED_MEMBER_TABS

    assert ALL_CLUB_TABS[ALL_CLUB_TABS.index("events") + 1] == "yellow-forms"
    assert "yellow-forms" not in MEMBER_ONLY_TABS | RESTRICTED_MEMBER_TABS


def test_eligible_students_and_register_number_lookup(client):
    r = client.get(f"{API}/clubs/{DA}/eligible-students", headers=_h(client, SHIVA))
    assert r.status_code == 200
    affan = next(s for s in r.json() if s["student_id"] == "std_2611507")
    assert affan == {
        "student_id": "std_2611507", "register_number": "2611507", "student_name": "Affan Ahmed A",
        "class_name_suggestion": "", "default_role": "DOC Analytica",
    }

    commerce = client.get(f"{API}/clubs/{COMMERCE}/eligible-students", headers=_h(client, RAHUL)).json()
    vikram = next(s for s in commerce if s["student_id"] == "std_regular_1")
    assert vikram["class_name_suggestion"] == "5 B.Com (Hons) A"

    found = client.get(f"{API}/clubs/{DA}/student-lookup?register_number=2611507", headers=_h(client, SHIVA)).json()
    assert found["found"] is True and found["student_name"] == "Affan Ahmed A"
    missing = client.get(f"{API}/clubs/{DA}/student-lookup?register_number=0000000", headers=_h(client, SHIVA)).json()
    assert missing == {
        "found": False, "student_id": None, "register_number": "0000000",
        "student_name": None, "class_name_suggestion": None,
    }
    assert client.get(
        f"{API}/clubs/{DA}/student-lookup?register_number=2611507", headers=_h(client, AFFAN),
    ).status_code == 403


def test_register_numbers_are_matched_whatever_their_case(client):
    lower = dict(RAHUL_ROW, register_number=" 21com5a001 ")
    r = client.post(f"{API}/clubs/{DA}/pre-approvals", headers=_h(client, SHIVA), json=_payload(students=[RAHUL_ROW, lower]))
    assert r.status_code == 422, "the same student was listed twice"

    form = _create(client, students=[lower])
    assert (form["students"][0]["register_number"], form["students"][0]["student_id"]) == ("21COM5A001", "std_president")
    found = client.get(f"{API}/clubs/{DA}/student-lookup?register_number=21com5a001", headers=_h(client, SHIVA)).json()
    assert (found["found"], found["student_id"], found["register_number"]) == (True, "std_president", "21COM5A001")
    assert client.delete(f"{API}/pre-approvals/{form['id']}", headers=_h(client, SHIVA)).status_code == 200


# ---------------------------------------------------------------------------
# Legacy claims route
# ---------------------------------------------------------------------------

def _legacy_claim(**overrides):
    return {
        "category": "medical", "academic_year": "2025-2026", "semester": "5", "programme": "B.Com (Hons)",
        "section": "A", "date_range": "2026-08-03 to 2026-08-03", "reason": "Event", "missed_classes": [],
        **overrides,
    }


def test_post_claims_refuses_club_and_individual_co_curricular_claims(client, monkeypatch):
    h = _h(client, ("calvin.anoop@bcomafh.christuniversity.in", "123"))

    r = client.post("/api/v1/claims", headers=h, json=_legacy_claim(submission_type="club", club_id=DA))
    assert r.status_code == 400
    assert "yellow forms" in r.json()["detail"]

    r = client.post("/api/v1/claims", headers=h, json=_legacy_claim(category="co_curricular"))
    assert r.status_code == 403
    assert r.json()["detail"] == (
        "Individual co-curricular claims (yellow forms) are not available yet — "
        "clubs file yellow forms from their club workspace."
    )

    # Medical claims are untouched, and the gate lifts with the capability.
    monkeypatch.setitem(
        capabilities.CAPABILITIES, "claims.individual_co_curricular",
        {"status": "live", "label": "Individual yellow forms"},
    )
    r = client.post("/api/v1/claims", headers=h, json=_legacy_claim(category="co_curricular"))
    assert r.status_code == 200, r.text

    from app.core.database import SessionLocal
    from app.models.claim import Claim
    from app.models.notification import Notification
    db = SessionLocal()
    try:
        db.delete(db.query(Claim).filter(Claim.id == r.json()["id"]).one())
        db.query(Notification).filter(Notification.entity_id == r.json()["id"]).delete()
        db.commit()
    finally:
        db.close()


@pytest.mark.parametrize("overrides", [
    {"category": "Co_Curricular"}, {"category": "co_curricular "}, {"category": "co-curricular"},
    {"category": "sports"}, {"submission_type": "Club", "club_id": DA}, {"submission_type": " club", "club_id": DA},
])
def test_post_claims_takes_only_the_exact_category_and_submission_type(client, overrides):
    h = _h(client, ("calvin.anoop@bcomafh.christuniversity.in", "123"))
    r = client.post("/api/v1/claims", headers=h, json=_legacy_claim(**overrides))
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("overrides", [
    {"student_ids": ["std_regular_2", "std_vp", "std_president"]},
    {"club_id": "club_commerce"},
])
def test_post_claims_files_for_the_submitter_alone(client, overrides):
    h = _h(client, ("calvin.anoop@bcomafh.christuniversity.in", "123"))
    r = client.post("/api/v1/claims", headers=h, json=_legacy_claim(**overrides))
    assert r.status_code == 400, r.text
    assert "yellow forms" in r.json()["detail"]


def test_the_capability_is_advertised_as_coming_soon():
    assert capabilities.get_capabilities_map()["claims.individual_co_curricular"] == "coming_soon"
    assert capabilities.is_live("claims.individual_co_curricular") is False


# ---------------------------------------------------------------------------
# Query budgets
# ---------------------------------------------------------------------------

def test_list_endpoints_do_not_issue_a_query_per_form(client):
    for _ in range(2):
        form = _create(client, start=20)
        assert _submit(client, form["id"]).status_code == 200
        assert _review(client, REYNAL, form["id"]).status_code == 200

    anusha = assert_query_budget(client, "GET", f"{API}/queue", _h(client, ANUSHA), 15)
    shiva = assert_query_budget(client, "GET", f"{API}/clubs/{DA}/pre-approvals", _h(client, SHIVA), 18)

    for _ in range(3):
        form = _create(client, start=20)
        assert _submit(client, form["id"]).status_code == 200
        assert _review(client, REYNAL, form["id"]).status_code == 200

    # Three more forms, not one query more.
    assert assert_query_budget(client, "GET", f"{API}/queue", _h(client, ANUSHA), 15).selects == anusha.selects
    assert assert_query_budget(
        client, "GET", f"{API}/clubs/{DA}/pre-approvals", _h(client, SHIVA), 18,
    ).selects == shiva.selects
