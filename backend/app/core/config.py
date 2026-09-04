from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchored to backend/, not to the current working directory. A relative
# ".env" silently found nothing whenever the app was started from the repo
# root (uvicorn, docker, an IDE run config), and the first symptom was
# "SECRET_KEY is not set" — which reads like a missing file rather than a
# wrong cwd.
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "DOC Unified Digital Platform"

    # Secret keys — no hardcoded fallback. A missing SECRET_KEY is a startup
    # error (see validate_required_settings() below), not a silently-accepted
    # default, since this key signs every JWT issued by the platform.
    SECRET_KEY: str = ""

    # --- Session lifetimes -------------------------------------------------
    # The access token used to live for EIGHT DAYS, which meant a leaked one
    # was a week-long session that nothing could end — a JWT is valid until it
    # expires and there was no jti to revoke it by.
    #
    # 30 minutes is only safe because there is now a refresh path. Shortening
    # the lifetime WITHOUT one would log everyone out mid-task, which is why
    # the two shipped together.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Refresh tokens are stored server-side by hash and rotate on every use,
    # so this is a "how long may I be away before signing in again" window,
    # not an unrevokable credential lifetime.
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # Database
    DATABASE_URL: str = "sqlite:///./doc_platform.db"

    # CORS Origins — explicit allow-list only. Never combine "*" with
    # allow_credentials=True (main.py enforces this at startup too).
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # Supabase Storage (Phase 1C — real file storage)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "doc-portal-files"

    # --- Email delivery ----------------------------------------------------
    # Unset on a developer machine and in CI, where the engine logs what it
    # would have sent instead. That keeps the code path exercised everywhere
    # rather than only in production, which is how mail code normally rots.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: int = 10
    EMAIL_FROM: str = ""

    # Where a link in an email should point. A relative path in an email is
    # useless, so a notification carries no link at all unless this is set.
    PUBLIC_APP_URL: str = ""

    # --- Department facts --------------------------------------------------
    # The one number on the public site that cannot be counted from the
    # database. Everything else (students, faculty, clubs) is now a real
    # count() rather than a literal that drifts the moment anyone enrols.
    DEPARTMENT_FOUNDED_YEAR: int = 1971

    # --- Claims policy -----------------------------------------------------
    # ONE definition of the submission SLA. The engines module documented a
    # 5-day limit in two places while the endpoint enforced 7 — two business
    # rules for one policy, and no way to tell which was intended.
    #
    # Informational only: per the Claims PRD a late claim stays fully
    # eligible for review and is never auto-rejected.
    CLAIM_SUBMISSION_SLA_DAYS: int = 7

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
        env_file=BACKEND_DIR / ".env",
        case_sensitive=True,
        extra="ignore",
    )


def resolve_sqlite_path(url: str) -> str:
    """Anchor a relative SQLite path to backend/, not to the caller's cwd.

    `sqlite:///./doc_platform.db` means a DIFFERENT file depending on where
    the process was started from, so running the app from the repo root and
    seeding it from backend/ silently used two separate databases — and the
    symptom was "no such column: users.programme", which reads like a missing
    migration rather than a wrong file.
    """
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        return url

    path = url[len(prefix):]
    if path.startswith("/") or path == ":memory:" or path.startswith("file:"):
        return url  # already absolute, in-memory, or a URI

    return f"{prefix}{(BACKEND_DIR / path).resolve()}"


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
settings.DATABASE_URL = resolve_sqlite_path(settings.DATABASE_URL)
validate_required_settings(settings)
