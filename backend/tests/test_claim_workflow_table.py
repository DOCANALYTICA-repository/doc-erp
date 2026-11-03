"""The claim state machine is data, and the route ordering that exposes it.

approve_claim_stage was a 130-line if/elif chain in which three separate
defects were really one: a branch that forgot to honour `action`, a branch
that forgot super_admin, and a branch that forgot to record the revision.
These tests assert the properties that hold for EVERY stage, so a new stage
cannot reintroduce any of them.
"""
import pytest

from app.core import claim_workflow

from .conftest import auth_headers

ADMIN = ("admin@christuniversity.in", "123")


def test_workflow_route_is_not_shadowed_by_the_claim_id_route(client):
    """"workflow" is a valid-looking claim id. Declaring this route below
    /{claim_id} would mean it never runs — the exact trap that hid the club
    reviewer inbox."""
    r = client.get("/api/v1/claims/workflow", headers=auth_headers(client, *ADMIN))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stage_order"][0] == "initial_review"
    # The chain ends where this application's authority ends: an approved
    # claim forwarded to the attendance office. "closed" is a stage, but it is
    # where a REJECTED claim lands, not a step towards approval.
    assert body["stage_order"][-1] == "attendance_office"
    assert body["stages"][-1]["is_terminal"] is True


def test_served_table_matches_the_table_the_endpoint_enforces(client):
    """One source of truth: the stepper renders from this, so it must be the
    same table approve_claim_stage acts on."""
    served = client.get("/api/v1/claims/workflow", headers=auth_headers(client, *ADMIN)).json()
    assert served["stage_order"] == claim_workflow.STAGE_ORDER
    assert set(served["actions"]) == set(claim_workflow.ACTIONS)

    for stage in served["stages"]:
        spec = claim_workflow.STAGES[stage["id"]]
        assert stage["label"] == spec.label
        assert stage["next_on_approve"] == spec.on_approve


@pytest.mark.parametrize("stage_id", [s for s in claim_workflow.STAGE_ORDER])
def test_every_stage_is_completely_specified(stage_id):
    """The structural guarantee. Each of these assertions corresponds to a
    real bug that a hand-written branch got wrong."""
    spec = claim_workflow.STAGES[stage_id]

    if spec.is_terminal:
        assert spec.on_approve is None
        assert spec.denial, "a terminal stage still needs a refusal message"
        return

    # Somewhere to go — the final-stage branch used to hardcode 'closed'
    # inline and ignore `action` entirely.
    assert spec.on_approve, f"{stage_id} has no on_approve"
    assert spec.on_approve in claim_workflow.STAGES

    # Somebody who may act — a stage with no permissions is unreachable.
    assert spec.required_permissions, f"{stage_id} names no reviewer permission"

    # Something to say when refusing.
    assert spec.denial


def test_super_admin_may_act_at_every_non_terminal_stage(client):
    """The super_admin bypass exists precisely to rescue stuck claims, and one
    stage used to forget it."""
    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.primary_role == "super_admin").first()
        claim = type("FakeClaim", (), {
            "programme": "B.Com (Hons)", "semester": "5", "section": "A",
            "submission_type": "individual", "club_id": None,
        })()
        for stage_id in claim_workflow.STAGE_ORDER:
            spec = claim_workflow.STAGES[stage_id]
            assert claim_workflow.may_act(db, admin, claim, spec) is True, stage_id
    finally:
        db.close()


def test_a_student_may_act_at_no_stage(client):
    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        student = db.query(User).filter(User.id == "std_regular_1").first()
        claim = type("FakeClaim", (), {
            "programme": "B.Com (Hons)", "semester": "5", "section": "A",
            "submission_type": "individual", "club_id": None,
        })()
        for stage_id in claim_workflow.STAGE_ORDER:
            spec = claim_workflow.STAGES[stage_id]
            assert claim_workflow.may_act(db, student, claim, spec) is False, stage_id
    finally:
        db.close()
