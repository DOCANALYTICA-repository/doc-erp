"""The action queue is the answer to "what needs me".

Every input existed and nothing aggregated it. This is also the structural fix
for BLK-01: the coordinator's problem was never navigation, it was that nothing
told him a plan was waiting.
"""
from .conftest import auth_headers

COORDINATOR = ("faculty.accounting@christuniversity.in", "faculty123")
CLASS_TEACHER = ("teacher.class@christuniversity.in", "faculty123")
STUDENT = ("student.regular@christuniversity.in", "student123")
UNTAGGED = ("faculty.finance@christuniversity.in", "faculty123")


def _queue(client, creds):
    r = client.get("/api/v1/me/action-queue", headers=auth_headers(client, *creds))
    assert r.status_code == 200, r.text
    return r.json()


def test_coordinator_is_told_about_the_plan_waiting_on_him(client):
    q = _queue(client, COORDINATOR)
    plans = [i for i in q["items"] if i["kind"] == "annual_plan_review"]
    assert plans, "the coordinator is not told his club's plan is waiting"

    item = plans[0]
    assert item["entity_type"] == "annual_plan"
    # The card must be able to navigate to the thing it is about.
    assert item["href"].startswith("/app/clubs/")
    assert "club=" in item["href"]
    assert item["can_approve_inline"] is True
    assert "Commerce Club" in item["title"]


def test_a_faculty_member_with_no_relevant_scope_has_an_empty_queue(client):
    q = _queue(client, UNTAGGED)
    assert [i for i in q["items"] if i["kind"] == "annual_plan_review"] == []


def test_class_teacher_sees_a_submitted_claim_and_the_student_does_not(client):
    student_h = auth_headers(client, *STUDENT)
    tt = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A",
        headers=student_h,
    ).json()
    r = client.post("/api/v1/claims", headers=student_h, json={
        "category": "medical", "academic_year": "2025-2026", "semester": "5",
        "programme": "B.Com (Hons)", "section": "A",
        "date_range": "2026-09-01 to 2026-09-01", "reason": "Unwell.",
        "missed_classes": [{
            "subject": tt[0]["subject"], "date": "2026-09-01",
            "hour": tt[0]["hour"], "subject_faculty_id": tt[0]["faculty_id"],
        }],
    })
    assert r.status_code == 200, r.text
    claim_id = r.json()["id"]

    teacher_q = _queue(client, CLASS_TEACHER)
    assert any(i["entity_id"] == claim_id for i in teacher_q["items"]), teacher_q

    # A student's queue is not a review queue.
    student_q = _queue(client, STUDENT)
    assert [i for i in student_q["items"] if i["kind"] == "claim_review"] == []


def test_queue_is_ordered_by_urgency_and_counted_by_kind(client):
    q = _queue(client, COORDINATOR)
    rank = {"overdue": 0, "today": 1, "soon": 2, "normal": 3}
    urgencies = [rank[i["urgency"]] for i in q["items"]]
    assert urgencies == sorted(urgencies), urgencies

    assert q["total"] == len(q["items"])
    assert sum(q["counts_by_kind"].values()) == q["total"]
