"""The seeded yellow forms, and where they surface outside their own screens.

tests/test_yellow_forms.py builds every form it needs; this file is about the
fixtures a tester lands on after seeding — one DOC Analytica form at every
point of both workflows plus a Commerce Club form — and about the action
queue, the pipeline and the notifications that point at them.

The fixtures have to be valid under the same rules the API enforces, or a
tester would be shown states that no real submission can reach.
"""
import csv
import io
from datetime import date, timedelta

import pytest

from app.core import clock
from app.core import yellow_form_workflow as workflow
from app.core.config import settings

from .conftest import auth_headers
from .test_query_counts import assert_query_budget

SHIVA = ("shiva.prakash@bcomafh.christuniversity.in", "123")      # DOC Analytica, Core — files the club's forms
AFFAN = ("affan.a@bcomsfh.christuniversity.in", "123")            # DOC Analytica, Associate (bottom rank)
REYNAL = ("reynal@christuniversity.in", "123")                    # DOC Analytica Faculty Coordinator
DSOUZA = ("faculty.accounting@christuniversity.in", "123")        # Commerce Club Faculty Coordinator
ANUSHA = ("anusha.iyer@christuniversity.in", "123")               # Associate HOD
SHARATH = ("sharath@christuniversity.in", "123")                  # Claims Coordinator
RAHUL = ("student.president@christuniversity.in", "123")          # Commerce Club President
HOD = ("hod.commerce@christuniversity.in", "123")
STUDENT = ("student.regular@christuniversity.in", "123")
ADMIN = ("admin@christuniversity.in", "123")

API = "/api/v1/yellow-forms"
DA = "club_doc_analytica"

SEEDED_FORMS = [f"paf_da_{n}" for n in range(1, 12)] + ["paf_cc_1"]
SEEDED_SHEETS = ["ccs_da_7", "ccs_da_8", "ccs_da_9"]

REFERENCE_ROW = "1,2611507,Affan Ahmed A,1 BCom SF,17/08/2026,,,,Period 9_45AM,,97.78,97.78,DOC Analytica"

_headers_cache: dict = {}


def _h(client, creds) -> dict:
    if creds[0] not in _headers_cache:
        _headers_cache[creds[0]] = auth_headers(client, *creds)
    return _headers_cache[creds[0]]


def _get(client, creds, path):
    r = client.get(path, headers=_h(client, creds))
    assert r.status_code == 200, r.text
    return r.json()


def _action_items(client, creds, kinds=("pre_approval_review", "claim_sheet_review", "claim_sheet_due", "yellow_form_returned")):
    items = _get(client, creds, "/api/v1/me/action-queue")["items"]
    return {(i["kind"], i["entity_id"]): i for i in items if i["kind"] in kinds}


@pytest.fixture
def db():
    from app.core.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _day(value: str) -> date:
    return date.fromisoformat(value)


# ---------------------------------------------------------------------------
# Every fixture is a state the API could have produced
# ---------------------------------------------------------------------------

def test_every_seeded_pre_approval_obeys_the_rules(db):
    from app.models.user import User
    from app.models.yellow_form import PreApprovalForm

    today = clock.today()
    forms = {f.id: f for f in db.query(PreApprovalForm).filter(PreApprovalForm.id.in_(SEEDED_FORMS))}
    assert set(forms) == set(SEEDED_FORMS)
    accounts = dict(db.query(User.enrollment_no, User.id).filter(User.primary_role == "student"))

    for form in forms.values():
        start, end = _day(form.event_start_date), _day(form.event_end_date)
        assert start <= end and (end - start).days <= 30, form.id
        assert form.status in workflow.PRE_APPROVAL_STATUS_LABELS, form.id
        expected_year = f"{start.year}-{start.year + 1}" if start.month >= 6 else f"{start.year - 1}-{start.year}"
        assert form.academic_year == expected_year, form.id

        registers = [s.register_number for s in form.students]
        assert form.students and len(registers) == len(set(registers)), form.id
        for s in form.students:
            assert s.student_name and s.class_name and s.role, (form.id, s.register_number)
            # Linked to the student's account, as the API links it.
            assert s.student_id == accounts.get(s.register_number), (form.id, s.register_number)

        if form.status != "draft":
            assert form.submitted_at and _day(form.submitted_at) < start, form.id
        # Every approval was given before the event started, in order.
        if form.faculty_coordinator_approved_at:
            fc_at = _day(form.faculty_coordinator_approved_at)
            assert _day(form.submitted_at) <= fc_at < start, form.id
        if form.associate_hod_approved_at:
            assert form.faculty_coordinator_approved_at, form.id
            assert _day(form.faculty_coordinator_approved_at) <= _day(form.associate_hod_approved_at) < start, form.id

        has_fc = form.faculty_coordinator_approved_by is not None
        has_ahod = form.associate_hod_approved_by is not None
        # Sending back or rejecting clears nothing (resubmitting does), so a form
        # the Associate HOD stopped still carries the Faculty Coordinator's approval.
        stopped_at_ahod = form.last_reviewed_stage == "associate_hod_review"
        assert (has_fc, has_ahod) == {
            "draft": (False, False),
            "faculty_coordinator_review": (False, False),
            "associate_hod_review": (True, False),
            "approved": (True, True),
            "returned": (stopped_at_ahod, False),
            "rejected": (stopped_at_ahod, False),
        }[form.status], form.id
        if form.status in ("returned", "rejected"):
            assert form.review_comments and form.last_reviewed_by and form.last_reviewed_stage, form.id

        # Anything still moving must still be movable: only paf_da_10 is past its window.
        if form.status in workflow.PRE_APPROVAL_OPEN_STATUSES and form.id != "paf_da_10":
            assert start > today, form.id


def test_every_seeded_claim_sheet_obeys_the_rules(db):
    from app.models.yellow_form import ClubClaimSheet

    today = clock.today()
    sheets = db.query(ClubClaimSheet).filter(ClubClaimSheet.id.in_(SEEDED_SHEETS)).all()
    assert {s.id for s in sheets} == set(SEEDED_SHEETS)

    for sheet in sheets:
        form = sheet.pre_approval
        start, end = _day(form.event_start_date), _day(form.event_end_date)
        # Only on an approved pre-approval, and only once its event was over.
        assert form.status == "approved" and today >= end, sheet.id
        assert sheet.club_id == form.club_id, sheet.id
        assert _day(sheet.submitted_at) >= end, sheet.id
        late = (_day(sheet.submitted_at) - end).days > settings.CLAIM_SUBMISSION_SLA_DAYS
        assert sheet.late_submission_flag is late, sheet.id
        if sheet.status in ("approved", "returned", "rejected"):
            assert sheet.reviewed_by and _day(sheet.reviewed_at) >= _day(sheet.submitted_at), sheet.id
        if sheet.status in ("returned", "rejected"):
            assert sheet.review_comments, sheet.id

        pre_approved = {s.id: s for s in form.students}
        assert sheet.students, sheet.id
        assert len({s.pre_approval_student_id for s in sheet.students}) == len(sheet.students), sheet.id
        for row in sheet.students:
            listed = pre_approved[row.pre_approval_student_id]
            assert (row.register_number, row.student_name, row.class_name, row.student_id) == (
                listed.register_number, listed.student_name, listed.class_name, listed.student_id,
            ), (sheet.id, row.register_number)
            # Complete, as submit requires.
            assert row.attendance_with_claims is not None and row.attendance_without_claims is not None
            assert 0 <= row.attendance_without_claims <= row.attendance_with_claims <= 100, (sheet.id, row.register_number)
            for value in (row.attendance_with_claims, row.attendance_without_claims):
                assert round(value, 2) == value
            assert row.entries, (sheet.id, row.register_number)
            dates = [e.date for e in row.entries]
            assert len(dates) == len(set(dates))
            for entry in row.entries:
                assert start <= _day(entry.date) <= end, (sheet.id, row.register_number, entry.date)
                periods = entry.periods_list
                assert periods and periods == [p for p in workflow.PERIOD_IDS if p in periods], entry.periods


def test_only_the_startup_pitch_day_is_expired(client):
    forms = {f["id"]: f for f in _get(client, ADMIN, f"{API}/clubs/{DA}/pre-approvals")}
    expired = {fid for fid in SEEDED_FORMS if fid.startswith("paf_da") and forms[fid]["is_expired"]}
    assert expired == {"paf_da_10"}

    pitch = _get(client, REYNAL, f"{API}/pre-approvals/paf_da_10")
    assert pitch["is_expired"] is True
    assert pitch["viewer_can_review"] is False and pitch["pending_with"] is None
    r = client.post(f"{API}/pre-approvals/paf_da_10/review", headers=_h(client, REYNAL), json={"action": "approve"})
    assert r.status_code == 400


def test_the_status_of_each_fixture_is_what_the_tester_expects(client):
    forms = {f["id"]: f for f in _get(client, ADMIN, f"{API}/clubs/{DA}/pre-approvals")}
    assert {fid: forms[fid]["status"] for fid in SEEDED_FORMS if fid.startswith("paf_da")} == {
        "paf_da_1": "draft",
        "paf_da_2": "faculty_coordinator_review",
        "paf_da_3": "associate_hod_review",
        "paf_da_4": "returned",
        "paf_da_5": "approved",
        "paf_da_6": "approved",
        "paf_da_7": "approved",
        "paf_da_8": "approved",
        "paf_da_9": "approved",
        "paf_da_10": "faculty_coordinator_review",
        "paf_da_11": "rejected",
    }
    assert forms["paf_da_2"]["pending_with"] == "Dr. Reynal (Faculty Coordinator)"
    assert forms["paf_da_3"]["pending_with"] == "Dr. Anusha Iyer (Associate HOD)"
    assert forms["paf_da_3"]["faculty_coordinator_approved_by_name"] == "Dr. Reynal"
    assert forms["paf_da_4"]["last_reviewed_by_name"] == "Dr. Anusha Iyer"
    assert forms["paf_da_4"]["last_reviewed_stage"] == "associate_hod_review"
    assert forms["paf_da_4"]["faculty_coordinator_approved_by_name"] == "Dr. Reynal"
    assert forms["paf_da_11"]["last_reviewed_by_name"] == "Dr. Reynal"
    # Pre-approved, but the event has not happened yet.
    assert forms["paf_da_5"]["event_completed"] is False
    assert forms["paf_da_5"]["viewer_can_file_claim_sheet"] is False
    assert {fid: forms[fid]["claim_sheet_status"] for fid in ("paf_da_7", "paf_da_8", "paf_da_9")} == {
        "paf_da_7": "claims_coordinator_review", "paf_da_8": "approved", "paf_da_9": "returned",
    }


def test_shiva_can_file_the_claim_sheet_for_the_finished_orientation(client):
    orientation = _get(client, SHIVA, f"{API}/pre-approvals/paf_da_6")
    assert orientation["event_completed"] is True
    assert orientation["claim_sheet_id"] is None
    assert orientation["viewer_can_file_claim_sheet"] is True
    # Affan is listed on it, but a bottom-rank member files nothing.
    assert _get(client, AFFAN, f"{API}/pre-approvals/paf_da_6")["viewer_can_file_claim_sheet"] is False


def test_the_submitted_sheet_exports_the_department_s_reference_row(client):
    r = client.get(f"{API}/claim-sheets/ccs_da_7/export.csv", headers=_h(client, SHARATH))
    assert r.status_code == 200, r.text
    assert r.headers["content-disposition"] == 'attachment; filename="YF-2026-000801.csv"'
    lines = r.content.decode("utf-8-sig").splitlines()
    assert lines[0] == (
        "S.No,Register Number,Student Name,Class,Date,Period 7AM,Period 8AM,Period 9AM,Period 9_45AM,"
        "Period 10_45AM,Attendance With Claims,Attendance Without Claims,Role"
    )
    assert lines[1] == REFERENCE_ROW
    rows = list(csv.reader(io.StringIO("\n".join(lines[1:]))))
    assert [row[0] for row in rows] == ["1", "2", "3", "4"]

    sheet = _get(client, SHARATH, f"{API}/claim-sheets/ccs_da_7")
    assert sheet["viewer_can_review"] is True and sheet["viewer_can_export"] is True
    # The attached pre-approved list carries a student the club did not claim for.
    assert sheet["student_count"] == 4 and len(sheet["pre_approval"]["students"]) == 5


def test_the_seeded_sheets_pass_the_server_s_own_validation(client):
    """Re-save the editable fixtures through the API, unchanged."""
    sheet = _get(client, SHIVA, f"{API}/claim-sheets/ccs_da_9")
    assert sheet["viewer_can_edit"] and sheet["viewer_can_submit"]
    body = {"students": [
        {
            "pre_approval_student_id": s["pre_approval_student_id"],
            "attendance_with_claims": s["attendance_with_claims"],
            "attendance_without_claims": s["attendance_without_claims"],
            "role": s["role"],
            "entries": [{"date": e["date"], "periods": e["periods"]} for e in s["entries"]],
        }
        for s in sheet["students"]
    ]}
    r = client.put(f"{API}/claim-sheets/ccs_da_9", headers=_h(client, SHIVA), json=body)
    assert r.status_code == 200, r.text
    saved = r.json()
    assert saved["status"] == "returned"
    assert [(s["register_number"], s["entries"][0]["periods"]) for s in saved["students"]] == [
        (s["register_number"], s["entries"][0]["periods"]) for s in sheet["students"]
    ]

    form = _get(client, SHIVA, f"{API}/pre-approvals/paf_da_4")
    assert form["viewer_can_edit"] and form["viewer_can_submit"]
    r = client.put(f"{API}/pre-approvals/paf_da_4", headers=_h(client, SHIVA), json={
        "event_name": form["event_name"],
        "event_start_date": form["event_start_date"],
        "event_end_date": form["event_end_date"],
        "students": [
            {k: s[k] for k in ("register_number", "student_name", "class_name", "role")} for s in form["students"]
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "returned" and r.json()["student_count"] == 3


# ---------------------------------------------------------------------------
# Review queues
# ---------------------------------------------------------------------------

def test_each_reviewer_s_queue_holds_their_seeded_form(client):
    reynal = _get(client, REYNAL, f"{API}/queue")
    ids = {f["id"] for f in reynal["pre_approvals"]}
    assert "paf_da_2" in ids and not ids & {"paf_cc_1", "paf_da_10"}

    dsouza = _get(client, DSOUZA, f"{API}/queue")
    assert "paf_cc_1" in {f["id"] for f in dsouza["pre_approvals"]}
    assert all(f["club_id"] == "club_commerce" for f in dsouza["pre_approvals"])

    assert "paf_da_3" in {f["id"] for f in _get(client, ANUSHA, f"{API}/queue")["pre_approvals"]}

    sharath = _get(client, SHARATH, f"{API}/queue")
    assert "ccs_da_7" in {s["id"] for s in sharath["claim_sheets"]}
    assert sharath["pre_approvals"] == []


def test_affan_sees_the_forms_he_is_on_but_not_the_club_s_draft(client):
    mine = _get(client, AFFAN, f"{API}/mine")
    forms = {f["id"] for f in mine["pre_approvals"]}
    assert {"paf_da_2", "paf_da_6", "paf_da_7"} <= forms
    # He is listed on the club's draft too, but /mine is only what the club has submitted.
    assert "paf_da_1" not in forms
    assert "ccs_da_7" in {s["id"] for s in mine["claim_sheets"]}
    # He reads them; as a bottom-rank member he files nothing.
    assert not any(
        f["viewer_can_edit"] or f["viewer_can_submit"] or f["viewer_can_file_claim_sheet"]
        for f in mine["pre_approvals"]
    )
    assert not any(s["viewer_can_edit"] or s["viewer_can_review"] for s in mine["claim_sheets"])


# ---------------------------------------------------------------------------
# Action queue
# ---------------------------------------------------------------------------

def test_reviewers_are_told_about_the_forms_waiting_on_them(client):
    reynal = _action_items(client, REYNAL)
    item = reynal[("pre_approval_review", "paf_da_2")]
    assert item["href"] == "/app/claims/yellow_forms?open=paf_da_2"
    assert item["entity_type"] == "pre_approval"
    assert item["due_date"] == _get(client, REYNAL, f"{API}/pre-approvals/paf_da_2")["approval_deadline"]
    assert item["can_approve_inline"] is False
    assert "DOC Analytica" in item["title"]
    # Not another club's form, and not one whose event has started.
    assert ("pre_approval_review", "paf_cc_1") not in reynal
    assert ("pre_approval_review", "paf_da_10") not in reynal

    dsouza = _action_items(client, DSOUZA)
    assert dsouza[("pre_approval_review", "paf_cc_1")]["href"] == "/app/claims/yellow_forms?open=paf_cc_1"
    assert not any(entity_id.startswith("paf_da") for _, entity_id in dsouza)

    anusha = _action_items(client, ANUSHA)
    assert anusha[("pre_approval_review", "paf_da_3")]["href"] == "/app/claims/yellow_forms?open=paf_da_3"
    assert ("pre_approval_review", "paf_da_2") not in anusha

    sharath = _action_items(client, SHARATH)
    item = sharath[("claim_sheet_review", "ccs_da_7")]
    assert item["href"] == "/app/claims/yellow_forms?open=ccs_da_7"
    assert item["entity_type"] == "claim_sheet" and item["can_approve_inline"] is False
    # Submitted 2026-08-19; the Claims Coordinator's stage allows three days.
    assert item["urgency"] == "overdue"
    assert not any(kind == "pre_approval_review" for kind, _ in sharath)


def test_the_club_is_told_what_it_has_to_do_next(client):
    shiva = _action_items(client, SHIVA)
    due = shiva[("claim_sheet_due", "paf_da_6")]
    assert due["href"] == "/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_6"
    assert due["can_approve_inline"] is False
    end = date.fromisoformat(_get(client, SHIVA, f"{API}/pre-approvals/paf_da_6")["event_end_date"])
    assert due["due_date"] == (end + timedelta(days=settings.CLAIM_SUBMISSION_SLA_DAYS)).isoformat()

    returned_form = shiva[("yellow_form_returned", "paf_da_4")]
    assert returned_form["href"] == "/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_4"
    assert "Add the venue" in returned_form["subtitle"]
    returned_sheet = shiva[("yellow_form_returned", "ccs_da_9")]
    assert returned_sheet["href"] == "/app/clubs/yellow-forms?club=club_doc_analytica&open=ccs_da_9"
    assert returned_sheet["entity_type"] == "claim_sheet"

    # Nothing for a sheet that already exists, a form not yet over, or a
    # reviewer's own stages.
    assert not {("claim_sheet_due", f) for f in ("paf_da_5", "paf_da_7", "paf_da_8", "paf_da_9")} & set(shiva)
    assert not any(kind in ("pre_approval_review", "claim_sheet_review") for kind, _ in shiva)

    # A bottom-rank member can read the club's forms but has nothing to file.
    assert _action_items(client, AFFAN) == {}
    # Commerce Club has nothing due or returned.
    assert _action_items(client, RAHUL, kinds=("claim_sheet_due", "yellow_form_returned")) == {}


def test_a_draft_claim_sheet_keeps_the_reminder_until_it_is_filed(client):
    assert ("claim_sheet_due", "paf_da_6") in _action_items(client, SHIVA)

    form = _get(client, SHIVA, f"{API}/pre-approvals/paf_da_6")
    r = client.post(f"{API}/pre-approvals/paf_da_6/claim-sheet", headers=_h(client, SHIVA), json={"students": [
        {
            "pre_approval_student_id": s["id"],
            "attendance_with_claims": 90.0,
            "attendance_without_claims": 88.5,
            "entries": [{"date": form["event_start_date"], "periods": ["9_45AM"]}],
        }
        for s in form["students"]
    ]})
    assert r.status_code == 200, r.text
    sheet_id = r.json()["id"]
    assert r.json()["student_count"] == 5
    # Nobody outside the club has a draft, so it is still due — and now opens the draft.
    due = _action_items(client, SHIVA)[("claim_sheet_due", "paf_da_6")]
    assert due["href"] == f"/app/clubs/yellow-forms?club=club_doc_analytica&open={sheet_id}"
    assert "draft" in due["subtitle"]

    # Deleting the draft frees the slot; the reminder goes back to the pre-approval.
    assert client.delete(f"{API}/claim-sheets/{sheet_id}", headers=_h(client, SHIVA)).status_code == 200
    due = _action_items(client, SHIVA)[("claim_sheet_due", "paf_da_6")]
    assert due["href"] == "/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_6"


def test_the_club_s_action_queue_does_not_cost_a_query_per_form(client):
    assert_query_budget(client, "GET", "/api/v1/me/action-queue", _h(client, SHIVA), 15)
    assert_query_budget(client, "GET", "/api/v1/me/action-queue", _h(client, ADMIN), 25)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

def test_pipeline_includes_both_yellow_form_workflows(client):
    body = _get(client, HOD, "/api/v1/me/pipeline")
    stages = {s["id"]: s for s in body["stages"]}

    fc = stages["pre_approval_faculty_coordinator_review"]
    ahod = stages["pre_approval_associate_hod_review"]
    cc = stages["claim_sheet_claims_coordinator_review"]

    assert {"paf_da_2", "paf_cc_1"} <= {i["id"] for i in fc["items"]}
    assert "paf_da_3" in {i["id"] for i in ahod["items"]}
    assert "ccs_da_7" in {i["id"] for i in cc["items"]}
    # Expired: nobody can act on it, so it is not stuck anywhere.
    everything = {i["id"] for s in body["stages"] for i in s["items"]}
    assert "paf_da_10" not in everything and "paf_da_4" not in everything

    item = next(i for i in fc["items"] if i["id"] == "paf_da_2")
    assert (item["kind"], item["sla_days"], item["href"]) == ("pre_approval", 2, "/app/claims/yellow_forms?open=paf_da_2")
    assert item["reference"] == "PAF-2026-000702" and item["owner"] == "DOC Analytica"
    submitted = date.fromisoformat(_get(client, HOD, f"{API}/pre-approvals/paf_da_2")["submitted_at"])
    assert item["days_waiting"] == (clock.today() - submitted).days
    assert item["is_breaching_sla"] is (item["days_waiting"] > 2)
    assert all(i["sla_days"] == 2 for i in ahod["items"])
    # The Associate HOD's clock starts at the Faculty Coordinator's approval, not the submission.
    bootcamp = next(i for i in ahod["items"] if i["id"] == "paf_da_3")
    handed_over = date.fromisoformat(_get(client, HOD, f"{API}/pre-approvals/paf_da_3")["faculty_coordinator_approved_at"])
    assert bootcamp["days_waiting"] == (clock.today() - handed_over).days

    sheet = next(i for i in cc["items"] if i["id"] == "ccs_da_7")
    assert (sheet["kind"], sheet["sla_days"], sheet["href"]) == ("claim_sheet", 3, "/app/claims/yellow_forms?open=ccs_da_7")
    assert sheet["is_breaching_sla"] is True
    assert "ccs_da_7" in {i["id"] for i in body["escalations"]}


def test_pipeline_lists_only_the_yellow_forms_a_faculty_coordinator_can_open(client):
    # Both coordinators reach the pipeline through plan approval, but each may
    # read only their own club's forms; every link shown must open.
    for creds, own, other in ((REYNAL, "paf_da_2", "paf_cc_1"), (DSOUZA, "paf_cc_1", "paf_da_2")):
        items = [
            i for s in _get(client, creds, "/api/v1/me/pipeline")["stages"] for i in s["items"]
            if i["kind"] in ("pre_approval", "claim_sheet")
        ]
        ids = {i["id"] for i in items}
        assert own in ids and other not in ids
        for i in items:
            path = "pre-approvals" if i["kind"] == "pre_approval" else "claim-sheets"
            assert client.get(f"{API}/{path}/{i['id']}", headers=_h(client, creds)).status_code == 200


def test_the_attendance_claims_report_counts_club_claim_sheets(client):
    r = client.get("/api/v1/claims/reports/attendance-summary?academic_year=2026-2027", headers=_h(client, HOD))
    assert r.status_code == 200, r.text
    body = r.json()
    sheets = {rec["reference"]: rec for rec in body["records"] if rec["reference"].startswith("YF-")}
    assert {"YF-2026-000801", "YF-2026-000802", "YF-2026-000803"} <= set(sheets)
    assert sheets["YF-2026-000801"]["category"] == "co_curricular"
    assert sheets["YF-2026-000801"]["date_range"] == "2026-08-17 to 2026-08-17"
    assert body["metrics"]["co_curricular_count"] >= 3


def test_department_wide_yellow_form_readers_can_open_the_pipeline(client):
    for creds in (ANUSHA, SHARATH):
        assert client.get("/api/v1/me/pipeline", headers=_h(client, creds)).status_code == 200
    assert client.get("/api/v1/me/pipeline", headers=_h(client, STUDENT)).status_code == 403


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def test_seeded_notifications_point_at_what_is_really_pending(db):
    from app.models.notification import Notification
    from app.models.yellow_form import ClubClaimSheet, PreApprovalForm

    notes = db.query(Notification).filter(Notification.id.like("not_yf_%")).all()
    by_entity: dict = {}
    for n in notes:
        assert n.source_module == "claims" and n.is_read is False
        by_entity.setdefault((n.entity_type, n.entity_id), set()).add(n.user_id)

    assert by_entity[("pre_approval", "paf_da_2")] == {"fac_reynal"}
    assert by_entity[("pre_approval", "paf_da_3")] == {"fac_anusha"}
    assert by_entity[("claim_sheet", "ccs_da_7")] == {"fac_sharath"}

    leadership = by_entity[("pre_approval", "paf_da_4")]
    assert "std_2411162" in leadership and "std_2611507" not in leadership
    assert by_entity[("claim_sheet", "ccs_da_9")] == leadership
    assert by_entity[("pre_approval", "paf_da_6")] == leadership
    assert len(by_entity) == 6

    status = {
        "paf_da_2": "faculty_coordinator_review", "paf_da_3": "associate_hod_review",
        "paf_da_4": "returned", "paf_da_6": "approved",
    }
    for form_id, expected in status.items():
        assert db.query(PreApprovalForm).filter(PreApprovalForm.id == form_id).one().status == expected
    sheets = {s.id: s.status for s in db.query(ClubClaimSheet).filter(ClubClaimSheet.id.in_(["ccs_da_7", "ccs_da_9"]))}
    assert sheets == {"ccs_da_7": "claims_coordinator_review", "ccs_da_9": "returned"}


def test_the_reviewer_sees_the_seeded_notification_in_the_tray(client):
    notes = _get(client, SHARATH, "/api/v1/notifications")
    note = next(n for n in notes if n["id"] == "not_yf_ccs_da_7_fac_sharath")
    assert "YF-2026-000801" in note["content"] and "Excel Masterclass" in note["content"]
    assert note["entity_type"] == "claim_sheet" and note["entity_id"] == "ccs_da_7"
