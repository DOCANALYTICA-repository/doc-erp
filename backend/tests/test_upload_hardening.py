"""Uploads must be bounded, typed and confirmed before a DB row is committed.

Four upload paths shipped with no size cap, no MIME allow-list, an extension
taken straight from the client-supplied filename, and — the live bug — no check
that the storage call succeeded, so a failed store still committed the row.

These tests stub ONLY the network leg (the Supabase client), so the engine's
own validation runs for real.
"""
import io

import pytest

from .conftest import auth_headers

FACULTY = ("teacher.class@christuniversity.in", "123")


class _FakeBucket:
    def __init__(self, fail=False):
        self.fail = fail
        self.uploaded = []

    def upload(self, path, contents, opts):
        if self.fail:
            raise RuntimeError("bucket unavailable")
        self.uploaded.append((path, contents, opts))
        return {"path": path}

    def create_signed_url(self, path, expires):
        return {"signedURL": f"https://fake/{path}"}


class _FakeStorage:
    def __init__(self, bucket):
        self._bucket = bucket

    def from_(self, _name):
        return self._bucket


@pytest.fixture
def bucket(monkeypatch):
    b = _FakeBucket()

    def _install(target):
        from app.services.engines import storage as storage_module
        monkeypatch.setattr(
            storage_module, "_client",
            lambda: type("C", (), {"storage": _FakeStorage(target)})(),
        )

    _install(b)
    b._install = _install
    return b


def _post(client, headers, filename, content, content_type):
    return client.post(
        "/api/v1/faculty/documents",
        headers=headers,
        files={"file": (filename, io.BytesIO(content), content_type)},
        data={"name": "Test doc", "folder_path": "/", "tags": ""},
    )


def test_disallowed_mime_is_refused(client, bucket):
    h = auth_headers(client, *FACULTY)
    # An SVG served back from a signed URL on our own origin is stored XSS.
    r = _post(client, h, "payload.svg", b"<svg onload=alert(1)></svg>", "image/svg+xml")
    assert r.status_code == 415, r.text
    assert bucket.uploaded == []


def test_oversized_file_is_refused_with_413(client, bucket, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 1024)

    h = auth_headers(client, *FACULTY)
    r = _post(client, h, "big.pdf", b"%PDF-" + b"x" * 4096, "application/pdf")
    assert r.status_code == 413, r.text
    assert bucket.uploaded == []


def test_content_must_match_declared_type(client, bucket):
    h = auth_headers(client, *FACULTY)
    # Declares PDF, sends something else entirely.
    r = _post(client, h, "notreally.pdf", b"MZ\x90\x00 this is a PE binary", "application/pdf")
    assert r.status_code == 415, r.text
    assert bucket.uploaded == []


def test_extension_comes_from_mime_not_the_filename(client, bucket):
    h = auth_headers(client, *FACULTY)
    r = _post(client, h, "../../etc/passwd.pdf.exe", b"%PDF-1.4 real", "application/pdf")
    assert r.status_code == 200, r.text

    stored_path = bucket.uploaded[0][0]
    assert stored_path.endswith(".pdf")
    assert ".." not in stored_path
    assert "passwd" not in stored_path


def test_storage_failure_does_not_commit_a_row(client, bucket):
    """The .upload() return was never inspected, so a claim could display a
    medical certificate whose bytes were never written anywhere."""
    h = auth_headers(client, *FACULTY)

    before = len(client.get("/api/v1/faculty/documents", headers=h).json())

    bucket._install(_FakeBucket(fail=True))
    r = _post(client, h, "cert.pdf", b"%PDF-1.4 real", "application/pdf")
    assert r.status_code == 502, r.text

    after = len(client.get("/api/v1/faculty/documents", headers=h).json())
    assert after == before, "a failed upload still created a document row"
