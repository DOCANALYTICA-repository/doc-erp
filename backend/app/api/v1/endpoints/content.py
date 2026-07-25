from fastapi import APIRouter
from app.services.engines.content import content_engine

router = APIRouter()

# Public, unauthenticated — the Landing Portal is explicitly a
# presentation-only layer over this engine and requires no login (Landing
# PRD §16, §25). This is the ONE module intentionally exempt from the
# "everything requires auth" rule applied everywhere else in Phase 1A —
# these three routes carry no operational or personal data.

@router.get("/statistics")
def get_public_statistics():
    return content_engine.get_public_statistics()

@router.get("/courses")
def get_courses():
    return content_engine.get_courses()

@router.get("/gallery")
def get_gallery_images():
    return content_engine.get_gallery_images()
