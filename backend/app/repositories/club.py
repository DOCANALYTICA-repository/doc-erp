from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.club import Club, ClubMember, Event, Budget, Reimbursement, Sponsorship
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

club_repo = ClubRepository(Club)
member_repo = ClubMemberRepository(ClubMember)
event_repo = EventRepository(Event)
budget_repo = BudgetRepository(Budget)
reimbursement_repo = ReimbursementRepository(Reimbursement)
sponsorship_repo = SponsorshipRepository(Sponsorship)
