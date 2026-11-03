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
    r = client.post("/api/v1/claims", json=payload, headers=student_h)
    assert r.status_code == 200
    return r.json()


def test_subject_faculty_does_not_see_claim_still_awaiting_class_teacher(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "123")
    claim = _submit_claim(client, student_h)

    subject_faculty_h = auth_headers(client, "faculty.accounting@christuniversity.in", "123")
    listing = client.get("/api/v1/claims", headers=subject_faculty_h).json()["items"]
    assert claim["id"] not in {c["id"] for c in listing}


def test_class_teacher_scoped_to_their_own_section_only(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "123")
    claim = _submit_claim(client, student_h, section="B")

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "123")
    listing = client.get("/api/v1/claims", headers=teacher_h).json()["items"]
    assert claim["id"] not in {c["id"] for c in listing}

    r = client.post(f"/api/v1/claims/{claim['id']}/approve-stage?action=approve", headers=teacher_h)
    assert r.status_code == 403


def test_revise_requires_a_reason(client):
    student_h = auth_headers(client, "student.regular@christuniversity.in", "123")
    claim = _submit_claim(client, student_h)

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "123")
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
    student_h = auth_headers(client, "student.regular@christuniversity.in", "123")
    claim = _submit_claim(client, student_h, date_range="2026-08-05 to 2026-08-05")

    teacher_h = auth_headers(client, "teacher.class@christuniversity.in", "123")
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
    # fac_subject_2 (faculty.accounting) coordinates club_commerce only and
    # fac_reynal club_doc_analytica only; each has one seeded yellow-form
    # pre-approval waiting at the Faculty Coordinator stage.
    dsouza_h = auth_headers(client, "faculty.accounting@christuniversity.in", "123")
    reynal_h = auth_headers(client, "reynal@christuniversity.in", "123")

    def queue(headers):
        r = client.get("/api/v1/yellow-forms/queue", headers=headers)
        assert r.status_code == 200, r.text
        return {f["id"] for f in r.json()["pre_approvals"]}

    assert "paf_cc_1" in queue(dsouza_h) and "paf_da_2" not in queue(dsouza_h)
    assert "paf_da_2" in queue(reynal_h) and "paf_cc_1" not in queue(reynal_h)

    for form_id, headers in (("paf_da_2", dsouza_h), ("paf_cc_1", reynal_h)):
        r = client.post(
            f"/api/v1/yellow-forms/pre-approvals/{form_id}/review", json={"action": "approve"}, headers=headers,
        )
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == "You are not the assigned Faculty Coordinator for this club"


# ---------------------------------------------------------------------------
# BLK-01: the Faculty Coordinator could not reach the plan he had to approve.
#
# The capability flags were already correct — the coordinator gets
# viewer_can_edit_hierarchy: true. Only REACHABILITY was broken, in four
# separate places, and each one alone was enough to block the workflow.
# ---------------------------------------------------------------------------

COORDINATOR = ("faculty.accounting@christuniversity.in", "123")
CULTURAL_COORDINATOR = ("faculty.cultural@christuniversity.in", "123")
HOD_USER = ("hod.commerce@christuniversity.in", "123")
UNTAGGED_FACULTY = ("faculty.finance@christuniversity.in", "123")


def test_coordinator_selector_contains_the_club_he_oversees(client):
    """get_club_coordinator_club_ids() existed with zero call sites repo-wide,
    so the coordinator's club selector came back empty."""
    h = auth_headers(client, *COORDINATOR)
    r = client.get("/api/v1/clubs/my-memberships", headers=h)
    assert r.status_code == 200, r.text

    by_id = {c["id"]: c for c in r.json()}
    assert "club_commerce" in by_id, "the coordinator's own club is missing from his selector"
    assert by_id["club_commerce"]["relationship"] == "faculty_coordinator"


def test_coordinator_can_read_the_hierarchy_he_alone_may_edit(client):
    """The sharpest instance of the read/write inversion: the only user
    permitted to EDIT the club hierarchy was the only faculty user forbidden
    from READING it."""
    h = auth_headers(client, *COORDINATOR)
    assert client.get("/api/v1/clubs/club_commerce/hierarchy", headers=h).status_code == 200


def test_coordinator_can_read_the_list_containing_the_plan(client):
    """Without this the coordinator 403s on /annual-plans, so he can never
    learn the plan_id that POST /annual-plans/{id}/review requires."""
    h = auth_headers(client, *COORDINATOR)
    r = client.get("/api/v1/clubs/club_commerce/annual-plans", headers=h)
    assert r.status_code == 200, r.text
    assert any(p["id"] == "aplan_comm_2025" for p in r.json())


def test_reviewer_inbox_shows_the_waiting_plan_only_to_its_reviewer(client):
    r = client.get(
        "/api/v1/clubs/annual-plans/awaiting-my-review",
        headers=auth_headers(client, *COORDINATOR),
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    assert any(p["id"] == "aplan_comm_2025" for p in rows)
    # club_name is included so the inbox renders without a fetch per row.
    assert all(p["club_name"] for p in rows)

    # A faculty member with no relevant tag has an empty inbox, not a 403.
    r = client.get(
        "/api/v1/clubs/annual-plans/awaiting-my-review",
        headers=auth_headers(client, *UNTAGGED_FACULTY),
    )
    assert r.status_code == 200
    assert r.json() == []


def test_full_three_stage_approval_chain_walks_to_approved(client):
    """The end-to-end gate for this wave: a plan reaches 'approved'."""
    def review(creds, expected_next):
        r = client.post(
            "/api/v1/clubs/annual-plans/aplan_comm_2025/review",
            json={"action": "approve", "comments": "Looks good."},
            headers=auth_headers(client, *creds),
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == expected_next, r.json()

    review(COORDINATOR, "cultural_coordinator_review")
    review(CULTURAL_COORDINATOR, "hod_review")
    review(HOD_USER, "approved")
