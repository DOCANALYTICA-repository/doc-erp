import uuid
from functools import lru_cache

from fastapi import UploadFile
from supabase import create_client, Client

from app.core.config import settings


@lru_cache
def _client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


class FileStorageEngine:
    """
    Real Supabase Storage-backed uploads (Phase 1C). This replaces a prior
    implementation that never persisted file bytes anywhere and only
    fabricated a path string — Claims (medical certificates), Clubs
    (receipts/deliverables) and Faculty (documents) all depend on this
    actually working.
    """

    def upload_file(self, file: UploadFile, folder: str = "general") -> str:
        file_extension = file.filename.split(".")[-1] if file.filename and "." in file.filename else "dat"
        unique_filename = f"{uuid.uuid4().hex[:12]}.{file_extension}"
        storage_path = f"{folder}/{unique_filename}"

        contents = file.file.read()
        _client().storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
            storage_path,
            contents,
            {"content-type": file.content_type or "application/octet-stream"},
        )
        return storage_path

    def get_signed_url(self, file_path: str, expires_in_seconds: int = 3600) -> str:
        if not file_path:
            return ""
        result = _client().storage.from_(settings.SUPABASE_STORAGE_BUCKET).create_signed_url(
            file_path, expires_in_seconds
        )
        return result.get("signedURL") or result.get("signedUrl") or ""

    def delete_file(self, file_path: str) -> None:
        if not file_path:
            return
        _client().storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([file_path])


storage_engine = FileStorageEngine()
