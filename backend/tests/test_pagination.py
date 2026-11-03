"""Lists are explicitly paged, not silently truncated.

The dangerous version of this was the SILENT 100-row cap: a super_admin with
300 claims saw 100 and nothing indicated the rest existed. An explicit page
carrying a TOTAL is the opposite failure mode — the user can see there is more.
"""
from .conftest import auth_headers

ADMIN = ("admin@christuniversity.in", "123")
STUDENT = ("student.regular@christuniversity.in", "123")


def _page(client, creds, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = "/api/v1/claims" + (f"?{query}" if query else "")
    r = client.get(url, headers=auth_headers(client, *creds))
    assert r.status_code == 200, r.text
    return r.json()


def test_response_carries_a_total_not_just_a_slice(client):
    body = _page(client, ADMIN)
    assert set(body) >= {"items", "total", "page", "page_size"}
    assert body["page"] == 1
    assert body["total"] >= len(body["items"])


def test_paging_walks_the_whole_list_without_gaps_or_repeats(client):
    """The property that matters. A pagination that drops or duplicates a row
    is worse than no pagination, because it looks like it worked."""
    # Submit a few claims so there is genuinely more than one page.
    student_h = auth_headers(client, *STUDENT)
    timetable = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A",
        headers=student_h,
    ).json()
    for day in range(5):
        client.post("/api/v1/claims", headers=student_h, json={
            "category": "medical", "academic_year": "2025-2026", "semester": "5",
            "programme": "B.Com (Hons)", "section": "A",
            "date_range": f"2026-10-0{day + 1} to 2026-10-0{day + 1}",
            "reason": "Paging fixture.",
            "missed_classes": [{
                "subject": timetable[0]["subject"], "date": f"2026-10-0{day + 1}",
                "hour": timetable[0]["hour"], "subject_faculty_id": timetable[0]["faculty_id"],
            }],
        })

    everything = _page(client, ADMIN, page_size=200)
    total = everything["total"]
    assert total >= 5, "seed does not have enough claims to page meaningfully"

    collected = []
    page = 1
    while True:
        body = _page(client, ADMIN, page=page, page_size=2)
        collected.extend(item["id"] for item in body["items"])
        if page * body["page_size"] >= body["total"]:
            break
        page += 1
        assert page < 50, "paging did not terminate"

    assert len(collected) == total
    assert len(set(collected)) == total, "a row appeared on two pages"
    assert set(collected) == {item["id"] for item in everything["items"]}


def test_page_size_is_bounded(client):
    """An unbounded page_size is just the unbounded query with extra steps."""
    r = client.get("/api/v1/claims?page_size=100000", headers=auth_headers(client, *ADMIN))
    assert r.status_code == 422

    r = client.get("/api/v1/claims?page=0", headers=auth_headers(client, *ADMIN))
    assert r.status_code == 422


def test_a_page_past_the_end_is_empty_rather_than_an_error(client):
    body = _page(client, ADMIN, page=999, page_size=25)
    assert body["items"] == []
    # ...and still reports the true total, so the UI can send the user back.
    assert body["total"] >= 0


def test_scoping_happens_before_paging(client):
    """Paging first and filtering second would give short pages and a
    meaningless total."""
    student = _page(client, STUDENT, page_size=200)
    admin = _page(client, ADMIN, page_size=200)

    assert student["total"] <= admin["total"]
    # Every claim a student sees is their own.
    assert all(c["submitted_by"] == "std_regular_1" for c in student["items"])
    assert student["total"] == len(student["items"])
