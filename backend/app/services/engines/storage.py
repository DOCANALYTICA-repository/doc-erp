import hashlib
import hmac
import time
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from supabase import create_client, Client

from app.core.config import settings

CHUNK_SIZE = 1024 * 1024  # 1 MB

# Leading magic bytes per allowed type, used to catch a client that declares
# one Content-Type and sends another. Types with no reliable signature (plain
# text, CSV, legacy Office containers) are simply not listed.
MAGIC_PREFIXES = {
    "application/pdf": (b"%PDF-",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b"PK\x03\x04",),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (b"PK\x03\x04",),
}


class UploadRejected(HTTPException):
    """A 4xx the caller should surface verbatim — the user can fix these."""


@lru_cache
def _client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


class FileStorageEngine:
    """Supabase Storage-backed uploads.

    Every upload is bounded, MIME-checked and magic-byte-sniffed before a
    single byte is written, and the store's response is CHECKED. That last
    part was the live bug: the .upload() return value was never inspected, so
    a storage failure still committed the database row — a claim would display
    a medical certificate whose bytes were never stored anywhere, and
    get_signed_url would later return "".
    """

    def _validate_mime(self, file: UploadFile) -> str:
        content_type = (file.content_type or "").split(";")[0].strip().lower()
        if content_type not in settings.ALLOWED_UPLOAD_MIME:
            raise UploadRejected(
                status_code=415,
                detail=(
                    f"'{content_type or 'unknown'}' files are not accepted. "
                    f"Allowed: {', '.join(sorted(settings.ALLOWED_UPLOAD_MIME))}."
                ),
            )
        return content_type

    async def _read_bounded(self, file: UploadFile, content_type: str) -> bytes:
        """Read in chunks, refusing the moment the cap is exceeded.

        Deliberately NOT `await file.read()` — that pulls the whole body into
        memory first and only then discovers it was too big, which makes the
        size limit useless as a defence.
        """
        chunks: list[bytes] = []
        total = 0
        first: Optional[bytes] = None

        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            if first is None:
                first = chunk[:16]
            total += len(chunk)
            if total > settings.MAX_UPLOAD_BYTES:
                raise UploadRejected(
                    status_code=413,
                    detail=(
                        f"File is larger than the "
                        f"{settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit."
                    ),
                )
            chunks.append(chunk)

        if total == 0:
            raise UploadRejected(status_code=400, detail="The uploaded file is empty.")

        expected = MAGIC_PREFIXES.get(content_type)
        if expected and not any((first or b"").startswith(sig) for sig in expected):
            raise UploadRejected(
                status_code=415,
                detail=f"File contents do not match the declared type '{content_type}'.",
            )

        return b"".join(chunks)

    async def upload_file(self, file: UploadFile, folder: str = "general") -> str:
        content_type = self._validate_mime(file)
        contents = await self._read_bounded(file, content_type)

        # The extension comes from the VALIDATED MIME type, never from
        # file.filename — that is a client-controlled string being used as a
        # path component.
        extension = settings.ALLOWED_UPLOAD_MIME[content_type]
        storage_path = f"{folder}/{uuid.uuid4().hex[:12]}.{extension}"

        try:
            if settings.storage_backend == "local":
                _local_write(storage_path, contents)
            else:
                _client().storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
                    storage_path, contents, {"content-type": content_type},
                )
        except Exception as exc:  # noqa: BLE001 — any storage failure is a 502
            raise HTTPException(
                status_code=502,
                detail="The file could not be stored. Nothing was saved; please try again.",
            ) from exc

        return storage_path

    def get_signed_url(self, file_path: str, expires_in_seconds: int = 3600) -> str:
        if not file_path:
            return ""
        if settings.storage_backend == "local":
            return local_signed_url(file_path, expires_in_seconds)
        result = _client().storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
            file_path, expires_in_seconds
        )
        return result.get("signedURL") or result.get("signedUrl") or ""

    def delete_file(self, file_path: str) -> None:
        if not file_path:
            return
        if settings.storage_backend == "local":
            resolved = resolve_local_path(file_path)
            if resolved is not None:
                resolved.unlink(missing_ok=True)
            return
        _client().storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([file_path])


storage_engine = FileStorageEngine()


# --- Local-disk backend ----------------------------------------------------
# Used whenever Supabase credentials are absent. Signed URLs are real signed
# URLs: an HMAC over (path, expiry) keyed on SECRET_KEY, so a link can be
# handed to the browser — which sends no Authorization header when following
# one — without turning the upload directory into an open read of anyone's
# medical certificates.


def resolve_local_path(file_path: str) -> Optional[Path]:
    """Map a stored path to a file under LOCAL_STORAGE_DIR, or None.

    Returns None for anything that escapes the directory, so a stored path
    that ever came from somewhere untrustworthy cannot read ../../.env.
    """
    root = Path(settings.LOCAL_STORAGE_DIR).resolve()
    try:
        candidate = (root / file_path).resolve()
        candidate.relative_to(root)
    except (ValueError, OSError):
        return None
    return candidate


def _local_write(storage_path: str, contents: bytes) -> None:
    target = resolve_local_path(storage_path)
    if target is None:
        raise ValueError(f"refusing to write outside the storage root: {storage_path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(contents)


def _sign(file_path: str, expires_at: int) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(),
        f"{file_path}:{expires_at}".encode(),
        hashlib.sha256,
    ).hexdigest()


def local_signed_url(file_path: str, expires_in_seconds: int = 3600) -> str:
    expires_at = int(time.time()) + expires_in_seconds
    sig = _sign(file_path, expires_at)
    # Relative on purpose: same-origin in production, and through the Vite
    # dev proxy locally, so no absolute host has to be configured anywhere.
    return f"{settings.API_V1_STR}/files/{file_path}?expires={expires_at}&signature={sig}"


def verify_local_signature(file_path: str, expires_at: int, signature: str) -> bool:
    if expires_at < int(time.time()):
        return False
    return hmac.compare_digest(_sign(file_path, expires_at), signature)
