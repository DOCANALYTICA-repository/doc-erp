"""Who can see a claim, when — and whose to-do list it is on.

The stage was already enforced for ACTING on a claim. It was not enforced for
SEEING one, and the review queue made no distinction between "waiting for you"
and "you have already signed this": a reviewer's list grew all semester and
they had to read the stage column to work out which rows were theirs to act on.

The rules these tests pin down, in the department's own words:

  * only the Class Teacher sees a claim at initial_review;
  * once they approve, every subject faculty on it can see and approve, in
    any order;
  * the Course Coordinator sees nothing until every subject faculty has
    approved;
  * a draft belongs to the student alone.
"""
from .conftest import auth_headers

# 6 B.Com AFA, seeded from the department's own timetable.
LIONEL = ("lionel.dsouza@bcomafh.christuniversity.in", "123")
SHIVA = ("shiva.prakash@bcomafh.christuniversity.in", "123")
VARUN = ("varun.m@bcomafh.christuniversity.in", "123")
CLASS_TEACHER = ("simon.giri@christuniversity.in", "123")        # Simon Giri; also teaches RMD
SUBJECT_TAX = ("sukanya@christuniversity.in", "123")             # Taxation Laws II
SUBJECT_BF = ("anson.kj@christuniversity.in", "123")             # Behavioural Finance
SUBJECT_DL = ("nisha@christuniversity.in", "123")                # Deep Learning and NLP
COORDINATOR = ("saravanakrishnan@christuniversity.in", "123")    # coordinates only

SUBMITTED = "cl_afa_submitted"        # at initial_review, awaiting the Class Teacher
AT_SUBJECT = "cl_afa_subject"         # at subject_faculty, two entries outstanding
AT_COORDINATOR = "cl_afa_coordinator"  # every subject faculty has approved
DRAFT = "cl_afa_draft"                # never submitted


def _ids(client, creds, view="pending"):
    r = client.get(f"/api/v1/claims?view={view}", headers=auth_headers(client, *creds))
    assert r.status_code == 200, r.text
    return {c["id"] for c in r.json()["items"]}


def _get(client, creds, claim_id):
    return client.get(f"/api/v1/claims/{claim_id}", headers=auth_headers(client, *creds))


# ---- stage gates ----------------------------------------------------------

def test_only_the_class_teacher_sees_a_claim_at_initial_review(client):
    assert SUBMITTED in _ids(client, CLASS_TEACHER)
    assert _get(client, CLASS_TEACHER, SUBMITTED).status_code == 200

    # Dr. Sukanya teaches this student, and one of the claimed hours is hers —
    # but the Class Teacher has not passed it on yet.
    assert SUBMITTED not in _ids(client, SUBJECT_TAX)
    assert _get(client, SUBJECT_TAX, SUBMITTED).status_code == 403
    assert SUBMITTED not in _ids(client, COORDINATOR)
    assert _get(client, COORDINATOR, SUBMITTED).status_code == 403


def test_subject_faculty_see_it_the_moment_the_class_teacher_approves(client):
    """And the Course Coordinator still does not.

    Nisha has already approved her hour on this claim, so it is no
    longer on her to-do list — but she can still open it, which is the whole
    point of separating "can see" from "must act".
    """
    for creds in (SUBJECT_BF, CLASS_TEACHER):  # both hold an outstanding hour
        assert AT_SUBJECT in _ids(client, creds)
        assert _get(client, creds, AT_SUBJECT).status_code == 200

    assert AT_SUBJECT not in _ids(client, SUBJECT_DL, "pending")
    assert AT_SUBJECT in _ids(client, SUBJECT_DL, "actioned")
    assert _get(client, SUBJECT_DL, AT_SUBJECT).status_code == 200

    assert AT_SUBJECT not in _ids(client, COORDINATOR)
    assert _get(client, COORDINATOR, AT_SUBJECT).status_code == 403


def test_the_coordinator_waits_for_every_subject_faculty(client):
    assert AT_COORDINATOR in _ids(client, COORDINATOR)
    assert _get(client, COORDINATOR, AT_COORDINATOR).status_code == 200


def test_a_draft_is_nobodys_business_but_the_students(client):
    assert DRAFT in _ids(client, SHIVA)
    assert _get(client, SHIVA, DRAFT).status_code == 200

    # It carries the initial_review stage from creation, which is the only
    # reason it was ever in the Class Teacher's queue.
    assert DRAFT not in _ids(client, CLASS_TEACHER)
    assert _get(client, CLASS_TEACHER, DRAFT).status_code == 403


# ---- pending vs actioned --------------------------------------------------

def test_approving_moves_a_claim_out_of_your_queue_and_into_your_history(client):
    h = auth_headers(client, *SUBJECT_BF)

    assert AT_SUBJECT in _ids(client, SUBJECT_BF, "pending")
    assert AT_SUBJECT not in _ids(client, SUBJECT_BF, "actioned")

    r = client.post(f"/api/v1/claims/{AT_SUBJECT}/approve-stage?action=approve", headers=h)
    assert r.status_code == 200, r.text

    assert AT_SUBJECT not in _ids(client, SUBJECT_BF, "pending"), (
        "a claim you have already approved is still on your to-do list"
    )
    assert AT_SUBJECT in _ids(client, SUBJECT_BF, "actioned")

    # ...and it is still pending for the faculty who has NOT approved, because
    # the subject-faculty stage waits on each of them independently.
    assert AT_SUBJECT in _ids(client, CLASS_TEACHER, "pending")  # holds the RMD hour


def test_a_claim_sent_back_is_waiting_on_the_student_not_a_reviewer(client):
    """ACP-2026-000505 was returned for a better certificate. Until the student
    resubmits it, it is on nobody's desk — it used to sit in the Class
    Teacher's queue under "awaiting your decision", which is precisely the
    decision they had just made."""
    RETURNED = "cl_afa_returned"
    assert RETURNED not in _ids(client, CLASS_TEACHER, "pending")
    # It is still theirs to look at — they wrote the reason on it.
    assert RETURNED in _ids(client, CLASS_TEACHER, "actioned")
    # And the student still sees it, because resubmitting is their move.
    assert RETURNED in _ids(client, ("roshan.sajit@bcomafh.christuniversity.in", "123"))


def test_an_unknown_view_is_refused_rather_than_silently_defaulted(client):
    r = client.get("/api/v1/claims?view=everything", headers=auth_headers(client, *SHIVA))
    assert r.status_code == 400
    assert "everything" in r.json()["detail"]


# ---- who are we waiting on ------------------------------------------------

def test_a_student_is_told_which_teachers_have_yet_to_approve(client):
    """Exactly the outstanding hours, named — no more and no fewer.

    Derived from the claim's own entries rather than hardcoded, so this holds
    whatever an earlier test in the session has already approved. The property
    is the point: a faculty member appears here if and only if their hour is
    still unsigned.
    """
    body = _get(client, VARUN, AT_SUBJECT).json()
    entries = [e for p in body["participants"] for e in p["entries"]]
    outstanding = [e for e in entries if e["status"] == "pending"]
    assert outstanding, "fixture no longer exercises a partly-approved claim"

    pending = body["pending_approvals"]
    assert all(p["stage"] == "subject_faculty" for p in pending)
    assert all(p["role"] == "Subject Faculty" for p in pending)
    assert {(p["faculty_name"], p["subject"], p["course_code"]) for p in pending} == {
        (e["subject_faculty_name"], e["subject"], e["course_code"]) for e in outstanding
    }
    # An hour that HAS been signed is not listed as awaited.
    signed = {e["subject_faculty_id"] for e in entries if e["status"] == "approved"}
    assert signed.isdisjoint({p["faculty_id"] for p in pending})


def test_at_the_first_stage_the_student_is_told_the_class_teacher_by_name(client):
    pending = _get(client, LIONEL, SUBMITTED).json()["pending_approvals"]
    assert [(p["role"], p["faculty_name"]) for p in pending] == [
        ("Class Teacher", "Simon Giri"),
    ]


def test_nobody_is_waiting_on_a_finished_claim(client):
    # ACP-2026-000506: approved and forwarded to the attendance office.
    assert _get(client, SHIVA, "cl_afa_forwarded").json()["pending_approvals"] == []
