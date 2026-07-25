from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.claim import Claim
from app.models.club import Club, Event

class ReportingEngine:
    def generate_attendance_report(self, db: Session, *, academic_year: str) -> Dict[str, Any]:
        """
        Compiles a departmental summary of attendance claims.
        """
        claims = db.query(Claim).filter(Claim.academic_year == academic_year).all()
        total_claims = len(claims)
        approved_claims = sum(1 for c in claims if c.status == "approved")
        medical_claims = sum(1 for c in claims if c.category == "medical")
        cocurricular_claims = sum(1 for c in claims if c.category == "co_curricular")
        
        return {
            "academic_year": academic_year,
            "report_type": "Attendance Claims Summary",
            "metrics": {
                "total_claims_submitted": total_claims,
                "approved_claims": approved_claims,
                "pending_claims": sum(1 for c in claims if c.status == "submitted" or c.status == "under_review"),
                "medical_count": medical_claims,
                "co_curricular_count": cocurricular_claims
            },
            "records": [
                {
                    "reference": c.reference_number,
                    "student_name": c.submitter.name if c.submitter else "Unknown",
                    "category": c.category,
                    "date_range": c.date_range,
                    "status": c.status
                }
                for c in claims
            ]
        }

    def generate_club_performance_report(self, db: Session, *, club_id: str) -> Dict[str, Any]:
        """
        Compiles event execution, budgets, and member activity for a club.
        """
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}
            
        events = db.query(Event).filter(Event.club_id == club_id).all()
        total_events = len(events)
        approved_events = sum(1 for e in events if e.status in ["approved", "executed"])
        total_budget_spent = sum(e.budget for e in events if e.status == "executed")
        
        return {
            "club_name": club.name,
            "category": club.category,
            "status": club.status,
            "metrics": {
                "total_events": total_events,
                "executed_events": approved_events,
                "total_budget_spent": total_budget_spent,
                "active_members": len(club.members)
            },
            "events": [
                {
                    "title": e.title,
                    "date": e.date,
                    "venue": e.venue,
                    "budget": e.budget,
                    "status": e.status
                }
                for e in events
            ]
        }

reporting_engine = ReportingEngine()
