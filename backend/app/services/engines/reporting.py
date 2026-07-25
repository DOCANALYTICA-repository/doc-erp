from collections import Counter
from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.claim import Claim
from app.models.club import (
    Club, Event, ClubMember, Budget, Sponsorship, RecruitmentDrive, RecruitmentApplication,
    EventAttendance,
)
from app.models.faculty import Task

class ReportingEngine:
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

    # --- Clubs PRD §47.2 — the 6 report types beyond Performance ---

    def generate_monthly_club_report(self, db: Session, *, club_id: str, month: str) -> Dict[str, Any]:
        """month is an 'YYYY-MM' prefix matched against Event.date (ISO)."""
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}
        events = db.query(Event).filter(Event.club_id == club_id, Event.date.like(f"{month}%")).all()
        return {
            "club_name": club.name,
            "report_type": "Monthly Club Report",
            "month": month,
            "metrics": {
                "events_held": sum(1 for e in events if e.status == "executed"),
                "events_planned": len(events),
                "total_spend": sum(e.budget for e in events if e.status == "executed"),
            },
            "events": [
                {"title": e.title, "date": e.date, "status": e.status, "budget": e.budget} for e in events
            ],
        }

    def generate_annual_club_report(self, db: Session, *, club_id: str, academic_year: str) -> Dict[str, Any]:
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}
        members = db.query(ClubMember).filter(
            ClubMember.club_id == club_id, ClubMember.academic_year == academic_year
        ).all()
        events = db.query(Event).filter(Event.club_id == club_id).all()
        budget = db.query(Budget).filter(
            Budget.club_id == club_id, Budget.academic_year == academic_year
        ).first()
        sponsorships = db.query(Sponsorship).filter(Sponsorship.club_id == club_id).all()
        return {
            "club_name": club.name,
            "report_type": "Annual Club Report",
            "academic_year": academic_year,
            "metrics": {
                "total_members": len(members),
                "active_members": sum(1 for m in members if m.status == "active"),
                "total_events": len(events),
                "events_executed": sum(1 for e in events if e.status == "executed"),
                "budget_allocated": budget.allocated_amount if budget else 0.0,
                "budget_spent": budget.spent_amount if budget else 0.0,
                "sponsorship_secured": sum(s.amount for s in sponsorships if s.status in ("committed", "received")),
            },
        }

    def generate_budget_summary_report(self, db: Session, *, club_id: str, academic_year: str) -> Dict[str, Any]:
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}
        budget = db.query(Budget).filter(
            Budget.club_id == club_id, Budget.academic_year == academic_year
        ).first()
        events = db.query(Event).filter(Event.club_id == club_id, Event.status == "executed").all()
        allocated = budget.allocated_amount if budget else 0.0
        spent = budget.spent_amount if budget else 0.0
        return {
            "club_name": club.name,
            "report_type": "Budget Summary",
            "academic_year": academic_year,
            "allocated_amount": allocated,
            "spent_amount": spent,
            "remaining_amount": allocated - spent,
            "utilization_percent": round((spent / allocated) * 100, 1) if allocated else 0.0,
            "spend_by_event": [{"title": e.title, "amount": e.budget} for e in events],
        }

    def generate_sponsorship_summary_report(self, db: Session, *, club_id: str) -> Dict[str, Any]:
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}
        sponsorships = db.query(Sponsorship).filter(Sponsorship.club_id == club_id).all()
        by_status = Counter(s.status for s in sponsorships)
        return {
            "club_name": club.name,
            "report_type": "Sponsorship Summary",
            "total_sponsors": len(sponsorships),
            "total_secured": sum(s.amount for s in sponsorships if s.status in ("committed", "received")),
            "leads_value": sum(s.amount for s in sponsorships if s.status == "lead"),
            "by_status": dict(by_status),
            "sponsors": [
                {"sponsor_name": s.sponsor_name, "amount": s.amount, "status": s.status} for s in sponsorships
            ],
        }

    def generate_attendance_report(self, db: Session, *, academic_year: str = None, club_id: str = None) -> Dict[str, Any]:
        """
        Overloaded on purpose: `academic_year` alone (existing Claims usage)
        produces the department-wide attendance-claims summary; `club_id`
        produces the Clubs PRD §47.2 event-attendance report instead.
        """
        if club_id:
            club = db.query(Club).filter(Club.id == club_id).first()
            if not club:
                return {"error": "Club not found"}
            records = db.query(EventAttendance).join(Event, EventAttendance.event_id == Event.id).filter(
                Event.club_id == club_id
            ).all()
            total = len(records)
            present = sum(1 for r in records if r.attended == "present")
            return {
                "club_name": club.name,
                "report_type": "Attendance Report",
                "metrics": {
                    "total_records": total,
                    "present": present,
                    "absent": total - present,
                    "attendance_rate_percent": round((present / total) * 100, 1) if total else 0.0,
                },
            }

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

    def generate_contribution_report(self, db: Session, *, club_id: str) -> Dict[str, Any]:
        """Clubs PRD §26.4 — task completion is the only contribution signal in v1."""
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}
        members = db.query(ClubMember).filter(
            ClubMember.club_id == club_id, ClubMember.status == "active"
        ).all()
        rows = []
        for m in members:
            tasks = db.query(Task).filter(
                Task.assignee_id == m.student_id, Task.source_module == "clubs"
            ).all()
            completed = sum(1 for t in tasks if t.status == "completed")
            rows.append({
                "student_id": m.student_id,
                "student_name": m.student.name if m.student else "Unknown",
                "role": m.role,
                "tasks_assigned": len(tasks),
                "tasks_completed": completed,
            })
        rows.sort(key=lambda r: r["tasks_completed"], reverse=True)
        return {
            "club_name": club.name,
            "report_type": "Contribution Report",
            "members": rows,
        }

    # --- Clubs PRD §48.2 — Analytics Workspace, 9 widgets in priority order ---

    def generate_club_analytics(self, db: Session, *, club_id: str, academic_year: str) -> Dict[str, Any]:
        club = db.query(Club).filter(Club.id == club_id).first()
        if not club:
            return {"error": "Club not found"}

        contribution = self.generate_contribution_report(db, club_id=club_id)
        members = db.query(ClubMember).filter(ClubMember.club_id == club_id).all()
        active_members = [m for m in members if m.status == "active"]

        events = db.query(Event).filter(Event.club_id == club_id).all()
        attendance_records = db.query(EventAttendance).join(Event, EventAttendance.event_id == Event.id).filter(
            Event.club_id == club_id
        ).all()
        present = sum(1 for r in attendance_records if r.attended == "present")
        total_attendance = len(attendance_records)

        drives = db.query(RecruitmentDrive).filter(RecruitmentDrive.club_id == club_id).all()
        applications = db.query(RecruitmentApplication).join(
            RecruitmentDrive, RecruitmentApplication.drive_id == RecruitmentDrive.id
        ).filter(RecruitmentDrive.club_id == club_id).all()

        budget = db.query(Budget).filter(
            Budget.club_id == club_id, Budget.academic_year == academic_year
        ).first()
        all_budgets = db.query(Budget).filter(Budget.club_id == club_id).order_by(Budget.academic_year).all()

        sponsorships = db.query(Sponsorship).filter(Sponsorship.club_id == club_id).all()

        return {
            "club_name": club.name,
            "academic_year": academic_year,
            "widgets": [
                {
                    "key": "contribution_leaderboard",
                    "title": "Contribution Leaderboard",
                    "data": contribution["members"][:10],
                },
                {
                    "key": "member_activity",
                    "title": "Member Activity",
                    "data": {
                        "total_members": len(members),
                        "active_members": len(active_members),
                        "alumni_members": len(members) - len(active_members),
                    },
                },
                {
                    "key": "attendance_trends",
                    "title": "Attendance Trends",
                    "data": {
                        "total_records": total_attendance,
                        "present": present,
                        "attendance_rate_percent": round((present / total_attendance) * 100, 1) if total_attendance else 0.0,
                    },
                },
                {
                    "key": "monthly_progress",
                    "title": "Monthly Progress",
                    "data": self._events_by_month(events),
                },
                {
                    "key": "registration_trends",
                    "title": "Registration Trends",
                    "data": {
                        "total_drives": len(drives),
                        "total_applications": len(applications),
                        "selected": sum(1 for a in applications if a.status == "selected"),
                        "by_status": dict(Counter(a.status for a in applications)),
                    },
                },
                {
                    "key": "budget_utilization",
                    "title": "Budget Utilization",
                    "data": {
                        "allocated_amount": budget.allocated_amount if budget else 0.0,
                        "spent_amount": budget.spent_amount if budget else 0.0,
                        "utilization_percent": round((budget.spent_amount / budget.allocated_amount) * 100, 1)
                        if budget and budget.allocated_amount else 0.0,
                    },
                },
                {
                    "key": "year_over_year_comparison",
                    "title": "Year-over-Year Comparison",
                    "data": [
                        {"academic_year": b.academic_year, "allocated": b.allocated_amount, "spent": b.spent_amount}
                        for b in all_budgets
                    ],
                },
                {
                    "key": "feedback_analysis",
                    "title": "Feedback Analysis",
                    # No feedback-collection mechanism exists in v1 scope yet
                    # (not part of this build-out) — empty state per platform
                    # error/empty-state standards rather than fabricated data.
                    "data": {"available": False, "reason": "Feedback collection is not yet implemented"},
                },
                {
                    "key": "sponsorship_summary",
                    "title": "Sponsorship Summary",
                    "data": {
                        "total_sponsors": len(sponsorships),
                        "total_secured": sum(s.amount for s in sponsorships if s.status in ("committed", "received")),
                    },
                },
            ],
        }

    @staticmethod
    def _events_by_month(events: List[Event]) -> List[Dict[str, Any]]:
        counts: Dict[str, int] = {}
        for e in events:
            try:
                month = datetime.strptime(e.date, "%Y-%m-%d").strftime("%Y-%m")
            except (ValueError, TypeError):
                continue
            counts[month] = counts.get(month, 0) + 1
        return [{"month": m, "events": c} for m, c in sorted(counts.items())]


reporting_engine = ReportingEngine()
