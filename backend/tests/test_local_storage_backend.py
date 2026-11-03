"""With no Supabase credentials, uploads go to local disk — not to a 502.

Every upload path on a developer checkout used to reach a Supabase URL that
does not answer, and the engine turned that connection error into a 502. The
claims medical-certificate upload was the visible symptom: pick a file, get
"Bad Gateway".
"""
import io

import pytest

from app.core.config import settings
from app.services.engines import storage as storage_module

from .conftest import auth_headers

STUDENT = ("student.regular@christuniversity.in", "123")


@pytest.fixture
def local_storage(tmp_path, monkeypatch):
    """Drop the Supabase credentials the way a local .env now does."""
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setattr(settings, "LOCAL_STORAGE_DIR", tmp_path / "uploads")
    # Any call to Supabase from here on is a bug in the dispatch.
    monkeypatch.setattr(
        storage_module, "_client",
        lambda: pytest.fail("the local backend must not touch Supabase"),
    )
    return tmp_path / "uploads"


def _new_claim(client, headers):
    tt = client.get(
        "/api/v1/claims/timetable?programme=B.Com (Hons)&semester=5&section=A",
        headers=headers,
    ).json()
    r = client.post(
        "/api/v1/claims",
        headers=headers,
        json={
            "category": "medical",
            "academic_year": "2025-2026",
            "semester": "5",
            "programme": "B.Com (Hons)",
            "section": "A",
            "date_range": "2026-07-20 to 2026-07-20",
            "reason": "Fever",
            "missed_classes": [
                {
                    "subject": s["subject"],
                    "date": "2026-07-20",
                    "hour": s["hour"],
                    "subject_faculty_id": s["faculty_id"],
                }
                for s in tt[:1]
            ],
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_claim_document_upload_succeeds_without_supabase(client, local_storage):
    h = auth_headers(client, *STUDENT)
    claim_id = _new_claim(client, h)

    r = client.post(
        f"/api/v1/claims/{claim_id}/documents",
        headers=h,
        files={"file": ("cert.pdf", io.BytesIO(b"%PDF-1.4 certificate"), "application/pdf")},
        data={"document_type": "medical_certificate"},
    )
    assert r.status_code == 200, r.text

    stored = local_storage / r.json()["file_url"]
    assert stored.read_bytes() == b"%PDF-1.4 certificate"


def test_signed_url_round_trips_and_rejects_tampering(client, local_storage):
    h = auth_headers(client, *STUDENT)
    claim_id = _new_claim(client, h)
    doc = client.post(
        f"/api/v1/claims/{claim_id}/documents",
        headers=h,
        files={"file": ("cert.pdf", io.BytesIO(b"%PDF-1.4 certificate"), "application/pdf")},
        data={"document_type": "medical_certificate"},
    ).json()

    url = client.get(
        f"/api/v1/claims/{claim_id}/documents/{doc['id']}/download-url", headers=h
    ).json()["url"]

    assert client.get(url).content == b"%PDF-1.4 certificate"
    # The link carries its own authority, so the signature has to hold.
    assert client.get(url.replace("signature=", "signature=0")).status_code == 403
    assert client.get(url.split("?")[0] + "?expires=0&signature=x").status_code == 403


def test_expired_link_is_refused(local_storage):
    url = storage_module.local_signed_url("claims/c1/x.pdf", expires_in_seconds=-1)
    expires = int(url.split("expires=")[1].split("&")[0])
    sig = url.split("signature=")[1]
    assert not storage_module.verify_local_signature("claims/c1/x.pdf", expires, sig)


def test_traversal_in_a_stored_path_cannot_escape_the_root(local_storage):
    assert storage_module.resolve_local_path("../../.env") is None
