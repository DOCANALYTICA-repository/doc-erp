from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.club import (
    Club, ClubMember, Event, Budget, Reimbursement, Sponsorship, RecruitmentDrive, RecruitmentApplication,
    Announcement, AnnualPlan, ClubDocument, EventAttendance,
)
from app.repositories.base import BaseRepository

class ClubRepository(BaseRepository[Club]):
    def get_by_name(self, db: Session, *, name: str) -> Optional[Club]:
        return db.query(Club).filter(Club.name == name).first()

class ClubMemberRepository(BaseRepository[ClubMember]):
    def get_by_student_and_club(self, db: Session, *, student_id: str, club_id: str) -> Optional[ClubMember]:
        return db.query(ClubMember).filter(
            ClubMember.student_id == student_id,
            ClubMember.club_id == club_id
        ).first()

    def get_club_members(self, db: Session, *, club_id: str) -> List[ClubMember]:
        return db.query(ClubMember).filter(ClubMember.club_id == club_id).all()

    def get_student_memberships(self, db: Session, *, student_id: str) -> List[ClubMember]:
        return db.query(ClubMember).filter(ClubMember.student_id == student_id).all()

class EventRepository(BaseRepository[Event]):
    def get_upcoming_club_events(self, db: Session, *, club_id: str) -> List[Event]:
        return db.query(Event).filter(
            Event.club_id == club_id,
            Event.status.in_(["approved", "executed"])
        ).all()

    def get_all_approved(self, db: Session) -> List[Event]:
        return db.query(Event).filter(Event.status == "approved").all()

class BudgetRepository(BaseRepository[Budget]):
    def get_club_budget(self, db: Session, *, club_id: str, academic_year: str) -> Optional[Budget]:
        return db.query(Budget).filter(
            Budget.club_id == club_id,
            Budget.academic_year == academic_year
        ).first()

class ReimbursementRepository(BaseRepository[Reimbursement]):
    def get_by_club(self, db: Session, *, club_id: str) -> List[Reimbursement]:
        return db.query(Reimbursement).filter(Reimbursement.club_id == club_id).all()

class SponsorshipRepository(BaseRepository[Sponsorship]):
    def get_by_club(self, db: Session, *, club_id: str) -> List[Sponsorship]:
        return db.query(Sponsorship).filter(Sponsorship.club_id == club_id).all()

class RecruitmentDriveRepository(BaseRepository[RecruitmentDrive]):
    def get_by_club(self, db: Session, *, club_id: str) -> List[RecruitmentDrive]:
        return db.query(RecruitmentDrive).filter(RecruitmentDrive.club_id == club_id).all()

class RecruitmentApplicationRepository(BaseRepository[RecruitmentApplication]):
    def get_by_drive(self, db: Session, *, drive_id: str) -> List[RecruitmentApplication]:
        return db.query(RecruitmentApplication).filter(RecruitmentApplication.drive_id == drive_id).all()

    def get_by_applicant(self, db: Session, *, applicant_id: str) -> List[RecruitmentApplication]:
        return db.query(RecruitmentApplication).filter(RecruitmentApplication.applicant_id == applicant_id).all()

class AnnouncementRepository(BaseRepository[Announcement]):
    def get_by_club(self, db: Session, *, club_id: str) -> List[Announcement]:
        return db.query(Announcement).filter(Announcement.club_id == club_id).order_by(
            Announcement.created_at.desc()
        ).all()

class AnnualPlanRepository(BaseRepository[AnnualPlan]):
    def get_by_club(self, db: Session, *, club_id: str) -> List[AnnualPlan]:
        return db.query(AnnualPlan).filter(AnnualPlan.club_id == club_id).order_by(
            AnnualPlan.academic_year.desc()
        ).all()

    def get_current(self, db: Session, *, club_id: str, academic_year: str) -> Optional[AnnualPlan]:
        return db.query(AnnualPlan).filter(
            AnnualPlan.club_id == club_id, AnnualPlan.academic_year == academic_year
        ).first()

class ClubDocumentRepository(BaseRepository[ClubDocument]):
    def get_by_club(self, db: Session, *, club_id: str, category: Optional[str] = None) -> List[ClubDocument]:
        q = db.query(ClubDocument).filter(ClubDocument.club_id == club_id)
        if category:
            q = q.filter(ClubDocument.category == category)
        return q.order_by(ClubDocument.created_at.desc()).all()

    def get_knowledge_base(self, db: Session, *, club_id: str) -> List[ClubDocument]:
        return [
            d for d in db.query(ClubDocument).filter(ClubDocument.club_id == club_id).all()
            if "knowledge-base" in [t.strip() for t in d.tags.split(",")]
        ]

    def get_versions(self, db: Session, *, document_id: str) -> List[ClubDocument]:
        """Walk the previous_version_id chain, newest first."""
        versions = []
        current = self.get(db, document_id)
        while current:
            versions.append(current)
            current = self.get(db, current.previous_version_id) if current.previous_version_id else None
        return versions

class EventAttendanceRepository(BaseRepository[EventAttendance]):
    def get_by_event(self, db: Session, *, event_id: str) -> List[EventAttendance]:
        return db.query(EventAttendance).filter(EventAttendance.event_id == event_id).all()

    def get_by_club(self, db: Session, *, club_id: str) -> List[EventAttendance]:
        return db.query(EventAttendance).join(Event, EventAttendance.event_id == Event.id).filter(
            Event.club_id == club_id
        ).all()

club_repo = ClubRepository(Club)
member_repo = ClubMemberRepository(ClubMember)
event_repo = EventRepository(Event)
budget_repo = BudgetRepository(Budget)
reimbursement_repo = ReimbursementRepository(Reimbursement)
sponsorship_repo = SponsorshipRepository(Sponsorship)
recruitment_drive_repo = RecruitmentDriveRepository(RecruitmentDrive)
recruitment_application_repo = RecruitmentApplicationRepository(RecruitmentApplication)
announcement_repo = AnnouncementRepository(Announcement)
annual_plan_repo = AnnualPlanRepository(AnnualPlan)
club_document_repo = ClubDocumentRepository(ClubDocument)
event_attendance_repo = EventAttendanceRepository(EventAttendance)
