from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "DOC Unified Digital Platform"

    # Secret keys — no hardcoded fallback. A missing SECRET_KEY is a startup
    # error (see validate_required_settings() below), not a silently-accepted
    # default, since this key signs every JWT issued by the platform.
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days

    # Database
    DATABASE_URL: str = "sqlite:///./doc_platform.db"

    # CORS Origins — explicit allow-list only. Never combine "*" with
    # allow_credentials=True (main.py enforces this at startup too).
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Supabase Storage (Phase 1C — real file storage)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "doc-portal-files"

    # --- Uploads -----------------------------------------------------------
    # Four upload paths existed with no size cap, no MIME allow-list and no
    # check that the store actually accepted the bytes.
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # Deliberately NO image/svg+xml and NO text/html: both are script-bearing
    # documents, and either one served from a signed URL on our own origin is
    # stored XSS. Extensions are derived from this map, never from the
    # client-supplied filename.
    ALLOWED_UPLOAD_MIME: dict = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.ms-excel": "xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "text/plain": "txt",
        "text/csv": "csv",
    }

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


def validate_required_settings(s: "Settings") -> None:
    if not s.SECRET_KEY:
        raise RuntimeError(
            "SECRET_KEY is not set. Create backend/.env from .env.example and "
            "set a real generated value — the app refuses to start with an "
            "empty/default secret since it signs every auth token."
        )
    if "*" in s.BACKEND_CORS_ORIGINS:
        raise RuntimeError(
            "BACKEND_CORS_ORIGINS must not contain '*' — wildcard origins "
            "combined with credentialed requests is an invalid, insecure "
            "configuration. List explicit allowed origins instead."
        )


settings = Settings()
validate_required_settings(settings)
