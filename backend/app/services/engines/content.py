from datetime import datetime, timezone
from typing import Dict, Any, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.club import Club
from app.models.content import GalleryImage, Programme
from app.models.user import User


class ContentEngine:
    def get_public_statistics(self, db: Session) -> Dict[str, Any]:
        """The numbers on the public site, counted rather than asserted.

        These were the literals 2500 / 85 / 12 / 55. A department page that
        states a student count is making a factual claim, and a hardcoded one
        is wrong the day after it is written.

        Three cheap count() queries; the founding year is the only value that
        genuinely cannot be derived, so it lives in config.
        """
        total_students = db.query(func.count(User.id)).filter(
            User.primary_role == "student", User.status == "active",
        ).scalar() or 0
        faculty_count = db.query(func.count(User.id)).filter(
            User.primary_role == "faculty", User.status == "active",
        ).scalar() or 0
        number_of_clubs = db.query(func.count(Club.id)).filter(
            Club.status == "active",
        ).scalar() or 0

        return {
            "total_students": total_students,
            "faculty_count": faculty_count,
            "number_of_clubs": number_of_clubs,
            "years_established": (
                datetime.now(timezone.utc).year - settings.DEPARTMENT_FOUNDED_YEAR
            ),
            "founded_year": settings.DEPARTMENT_FOUNDED_YEAR,
        }

    def get_club_showcase(self, db: Session) -> List[Dict[str, Any]]:
        """
        Public-safe club cards for the Landing Portal — per the Landing PRD,
        this must expose ONLY Logo/Short Description/contact, never member
        lists, budgets, or any operational data (that's what the real,
        authenticated /clubs endpoints are for, per Phase 1A).
        """
        clubs = db.query(Club).filter(Club.status == "active").all()
        return [
            {
                "id": c.id,
                "name": c.name,
                "category": c.category,
                "logo": c.logo,
                "description": c.description,
                "contact_email": c.contact_email,
            }
            for c in clubs
        ]

    def get_courses(self, db: Session) -> List[Dict[str, Any]]:
        """Programmes, from the database.

        brochure_url is omitted entirely when unset — the hardcoded list
        advertised three PDFs that were never in the repository, so every
        "Download brochure" link 404'd.
        """
        programmes = db.query(Programme).filter(
            Programme.is_published == True  # noqa: E712 — SQL, not Python truthiness
        ).order_by(Programme.display_order, Programme.name).all()

        return [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "brochure_url": p.brochure_url or None,
                "outcomes": p.outcomes_list,
                "careers": p.careers_list,
            }
            for p in programmes
        ]

    def get_gallery_images(self, db: Session) -> List[Dict[str, Any]]:
        images = db.query(GalleryImage).filter(
            GalleryImage.is_published == True  # noqa: E712
        ).order_by(GalleryImage.display_order, GalleryImage.title).all()

        return [
            {"id": i.id, "title": i.title, "url": i.url, "caption": i.caption}
            for i in images
        ]


content_engine = ContentEngine()
