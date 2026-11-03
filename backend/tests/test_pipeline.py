"""Two invisible state machines, made visible.

Both workflows worked and neither could be seen in aggregate: you could ask
how ONE claim was doing, and nothing could tell you that six had been sitting
at the same stage for a fortnight.
"""
from datetime import datetime, timedelta, timezone

from .conftest import auth_headers

HOD = ("hod.commerce@christuniversity.in", "123")
COORDINATOR = ("faculty.accounting@christuniversity.in", "123")
STUDENT = ("student.regular@christuniversity.in", "123")


def _pipeline(client, creds=HOD):
    r = client.get("/api/v1/me/pipeline", headers=auth_headers(client, *creds))
    assert r.status_code == 200, r.text
    return r.json()


def test_a_student_cannot_see_the_department_pipeline(client):
    """Department oversight, not personal work."""
    r = client.get("/api/v1/me/pipeline", headers=auth_headers(client, *STUDENT))
    assert r.status_code == 403


def test_pipeline_covers_both_workflows(client):
    body = _pipeline(client)
    stage_ids = {s["id"] for s in body["stages"]}

    # Claims
    assert {"initial_review", "subject_faculty", "course_coordinator"} <= stage_ids
    # attendance_office is terminal — an approved claim has left this system,
    # so it is not a column anyone works and has no SLA to breach.
    assert "attendance_office" not in stage_ids
    # Annual plans
    assert {"faculty_coordinator_review", "cultural_coordinator_review", "hod_review"} <= stage_ids


def test_every_stage_names_who_it_is_waiting_on(client):
    """'Where is it stuck' is only useful with 'and who is it waiting on'."""
    body = _pipeline(client)
    for stage in body["stages"]:
        for item in stage["items"]:
            assert item["waiting_on"], f"{item['reference']} does not say who it waits on"
            assert item["sla_days"] > 0
            assert item["href"].startswith("/app/")


def test_counts_are_consistent(client):
    body = _pipeline(client)
    assert body["total"] == sum(s["count"] for s in body["stages"])
    assert body["total_breaching"] == sum(s["breaching"] for s in body["stages"])
    assert len(body["escalations"]) == body["total_breaching"]


def test_an_old_item_breaches_its_sla_and_is_escalated(client):
    """The reason this view exists."""
    from app.core.database import SessionLocal
    from app.models.claim import Claim

    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(
            Claim.current_workflow_stage == "initial_review"
        ).first()
        assert claim is not None, "seed has no claim at initial_review"
        # initial_review's SLA is 3 days; make this one 30 days old.
        old = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
        claim.submission_date = old
        db.add(claim)
        db.commit()
        claim_id = claim.id
    finally:
        db.close()

    body = _pipeline(client)

    escalated = {i["id"] for i in body["escalations"]}
    assert claim_id in escalated, "a 30-day-old claim is not escalated"

    item = next(i for i in body["escalations"] if i["id"] == claim_id)
    assert item["is_breaching_sla"] is True
    assert item["days_waiting"] >= 30
    assert item["sla_days"] == 3


def test_escalations_are_ordered_oldest_first(client):
    """An escalation list in arbitrary order is a list nobody works through."""
    body = _pipeline(client)
    days = [i["days_waiting"] for i in body["escalations"]]
    assert days == sorted(days, reverse=True), days


def test_a_stage_reports_its_slowest_item_not_just_a_count(client):
    """A stage with a healthy median and one item stuck for three weeks looks
    fine on an average."""
    body = _pipeline(client)
    for stage in body["stages"]:
        if stage["count"] == 0:
            assert stage["oldest_days"] == 0
            continue
        assert stage["oldest_days"] == max(i["days_waiting"] for i in stage["items"])


def test_a_coordinator_can_also_see_the_pipeline(client):
    """PermissionChecker(require_all=False): several roles reach this by
    different permissions."""
    assert _pipeline(client, COORDINATOR)["total"] >= 0
