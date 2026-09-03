from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db_readonly, get_db
from app.core.rbac import PermissionChecker
from app.models.content import GalleryImage, Programme
from app.models.user import User
from app.schemas.content import (
    GalleryImageIn, GalleryImageOut, ProgrammeIn, ProgrammeOut,
)
from app.services.engines.content import content_engine

router = APIRouter()

# ---------------------------------------------------------------------------
# Public, unauthenticated — the Landing Portal is explicitly a
# presentation-only layer over this engine and requires no login (Landing
# PRD §16, §25). This is the ONE module intentionally exempt from the
# "everything requires auth" rule applied everywhere else, because these
# routes carry no operational or personal data.
# ---------------------------------------------------------------------------

@router.get("/statistics")
def get_public_statistics(db: Session = Depends(get_db_readonly)):
    return content_engine.get_public_statistics(db)


@router.get("/courses")
def get_courses(db: Session = Depends(get_db_readonly)):
    return content_engine.get_courses(db)


@router.get("/gallery")
def get_gallery_images(db: Session = Depends(get_db_readonly)):
    return content_engine.get_gallery_images(db)


@router.get("/clubs-showcase")
def get_clubs_showcase(db: Session = Depends(get_db_readonly)):
    return content_engine.get_club_showcase(db)


# ---------------------------------------------------------------------------
# The editor. Gated on content:manage so the public site stops being a static
# brochure maintained by editing Python.
# ---------------------------------------------------------------------------

_require_editor = PermissionChecker(["content:manage"])


@router.get("/admin/programmes", response_model=List[ProgrammeOut])
def list_all_programmes(db: Session = Depends(get_db), _: User = Depends(_require_editor)):
    """Every programme, published or not — the public route hides unpublished ones."""
    return db.query(Programme).order_by(Programme.display_order, Programme.name).all()


@router.put("/admin/programmes/{programme_id}", response_model=ProgrammeOut)
def upsert_programme(
    programme_id: str,
    body: ProgrammeIn,
    db: Session = Depends(get_db),
    _: User = Depends(_require_editor),
):
    programme = db.query(Programme).filter(Programme.id == programme_id).first()
    if programme is None:
        programme = Programme(id=programme_id)
        db.add(programme)

    for field, value in body.model_dump(exclude_unset=True).items():
        # outcomes/careers arrive as lists and are stored comma-separated,
        # matching the existing convention in this schema.
        if field in ("outcomes", "careers") and isinstance(value, list):
            value = ",".join(v.strip() for v in value if v.strip())
        setattr(programme, field, value)

    db.commit()
    db.refresh(programme)
    return programme


@router.delete("/admin/programmes/{programme_id}")
def delete_programme(
    programme_id: str, db: Session = Depends(get_db), _: User = Depends(_require_editor),
):
    programme = db.query(Programme).filter(Programme.id == programme_id).first()
    if not programme:
        raise HTTPException(status_code=404, detail="Programme not found")
    db.delete(programme)
    db.commit()
    return {"status": "success"}


@router.get("/admin/gallery", response_model=List[GalleryImageOut])
def list_all_gallery_images(db: Session = Depends(get_db), _: User = Depends(_require_editor)):
    return db.query(GalleryImage).order_by(
        GalleryImage.display_order, GalleryImage.title
    ).all()


@router.put("/admin/gallery/{image_id}", response_model=GalleryImageOut)
def upsert_gallery_image(
    image_id: str,
    body: GalleryImageIn,
    db: Session = Depends(get_db),
    _: User = Depends(_require_editor),
):
    image = db.query(GalleryImage).filter(GalleryImage.id == image_id).first()
    if image is None:
        image = GalleryImage(id=image_id, title=body.title or image_id, url=body.url or "")
        db.add(image)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(image, field, value)

    db.commit()
    db.refresh(image)
    return image


@router.delete("/admin/gallery/{image_id}")
def delete_gallery_image(
    image_id: str, db: Session = Depends(get_db), _: User = Depends(_require_editor),
):
    image = db.query(GalleryImage).filter(GalleryImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Gallery image not found")
    db.delete(image)
    db.commit()
    return {"status": "success"}
