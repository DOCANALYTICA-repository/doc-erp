"""Serving for locally-stored uploads.

Only active when Supabase is unconfigured (developer machines, CI), where the
storage engine writes to LOCAL_STORAGE_DIR instead. Access is by the same
signed URL the Supabase backend hands out, verified here: an expired or
tampered link is a 403, never a read.
"""
import mimetypes

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.engines.storage import resolve_local_path, verify_local_signature

router = APIRouter()


@router.get("/{file_path:path}")
def get_local_file(
    file_path: str,
    expires: int = Query(...),
    signature: str = Query(...),
):
    if settings.storage_backend != "local":
        raise HTTPException(status_code=404, detail="Not found")

    if not verify_local_signature(file_path, expires, signature):
        raise HTTPException(status_code=403, detail="This link is invalid or has expired.")

    resolved = resolve_local_path(file_path)
    if resolved is None or not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
    return FileResponse(
        resolved,
        media_type=media_type,
        # Never render an upload inline on our own origin.
        headers={"Content-Disposition": f'attachment; filename="{resolved.name}"'},
    )
