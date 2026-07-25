from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.club import Club

class ContentEngine:
    def get_public_statistics(self) -> Dict[str, Any]:
        return {
            "total_students": 2500,
            "faculty_count": 85,
            "number_of_clubs": 12,
            "years_established": 55
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

    def get_courses(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "bcom_regular",
                "name": "B.Com (Regular)",
                "description": "A comprehensive undergraduate program focusing on commerce, accounting, and business finance.",
                "brochure_url": "/brochures/bcom_regular.pdf",
                "outcomes": ["Strong foundation in Accounting principles", "Understanding of Financial markets", "Business Law literacy"],
                "careers": ["Financial Analyst", "Audit Associate", "Accountant"]
            },
            {
                "id": "bcom_hons",
                "name": "B.Com (Honours)",
                "description": "Advanced commerce curriculum with specialization tracks in Finance, Investment, and Business Analytics.",
                "brochure_url": "/brochures/bcom_hons.pdf",
                "outcomes": ["Mastery of Corporate Valuation", "Proficiency in Data Analytics tools", "Advanced Taxation concepts"],
                "careers": ["Investment Banker", "Risk Analyst", "Data Consultant"]
            },
            {
                "id": "bcom_fna",
                "name": "B.Com (Finance and Accountancy)",
                "description": "Professional program integrated with globally recognized accounting curriculums (ACCA / CPA).",
                "brochure_url": "/brochures/bcom_fna.pdf",
                "outcomes": ["Exemption in global certification exams", "Strategic business leadership insights", "Taxation compliance expertise"],
                "careers": ["Chartered Accountant", "Management Consultant", "Corporate Secretary"]
            }
        ]

    def get_gallery_images(self) -> List[Dict[str, Any]]:
        return [
            {"id": "gal_1", "title": "Department Inauguration 2025", "url": "https://picsum.photos/id/101/800/600"},
            {"id": "gal_2", "title": "National Commerce Conclave", "url": "https://picsum.photos/id/102/800/600"},
            {"id": "gal_3", "title": "Club Recruitment Day", "url": "https://picsum.photos/id/103/800/600"},
            {"id": "gal_4", "title": "Inter-Collegiate Cultural Festival", "url": "https://picsum.photos/id/104/800/600"}
        ]

content_engine = ContentEngine()
