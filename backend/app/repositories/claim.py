from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.repositories.base import BaseRepository

class ClaimRepository(BaseRepository[Claim]):
    def get_by_reference(self, db: Session, *, ref_num: str) -> Optional[Claim]:
        return db.query(Claim).filter(Claim.reference_number == ref_num).first()

    def get_by_submitter(self, db: Session, *, user_id: str) -> List[Claim]:
        return db.query(Claim).filter(Claim.submitted_by == user_id).all()

    def get_by_stage(self, db: Session, *, stage: str) -> List[Claim]:
        return db.query(Claim).filter(Claim.current_workflow_stage == stage).all()

class ClaimParticipantRepository(BaseRepository[ClaimParticipant]):
    def get_by_claim(self, db: Session, *, claim_id: str) -> List[ClaimParticipant]:
        return db.query(ClaimParticipant).filter(ClaimParticipant.claim_id == claim_id).all()

class AttendanceEntryRepository(BaseRepository[AttendanceEntry]):
    def get_by_participant(self, db: Session, *, participant_id: str) -> List[AttendanceEntry]:
        return db.query(AttendanceEntry).filter(AttendanceEntry.claim_participant_id == participant_id).all()

    def get_pending_by_faculty(self, db: Session, *, faculty_id: str) -> List[AttendanceEntry]:
        return db.query(AttendanceEntry).filter(
            AttendanceEntry.subject_faculty_id == faculty_id,
            AttendanceEntry.status == "pending"
        ).all()

class SupportingDocumentRepository(BaseRepository[SupportingDocument]):
    def get_by_claim(self, db: Session, *, claim_id: str) -> List[SupportingDocument]:
        return db.query(SupportingDocument).filter(SupportingDocument.claim_id == claim_id).all()

class TimetableSessionRepository(BaseRepository[TimetableSession]):
    def get_by_academic_context(self, db: Session, *, prog: str, sem: str, sec: str) -> List[TimetableSession]:
        return db.query(TimetableSession).filter(
            TimetableSession.programme == prog,
            TimetableSession.semester == sem,
            TimetableSession.section == sec
        ).all()

    def get_by_faculty(self, db: Session, *, faculty_id: str) -> List[TimetableSession]:
        return db.query(TimetableSession).filter(TimetableSession.faculty_id == faculty_id).all()

claim_repo = ClaimRepository(Claim)
claim_participant_repo = ClaimParticipantRepository(ClaimParticipant)
attendance_entry_repo = AttendanceEntryRepository(AttendanceEntry)
doc_repo = SupportingDocumentRepository(SupportingDocument)
timetable_repo = TimetableSessionRepository(TimetableSession)
