from typing import List, Optional
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.repositories.base import BaseRepository

#: Everything ClaimOut reads beyond the claim row itself: the submitter (for
#: submitter_name) and participants with their entries.
#:
#: Serialising a claim without these is two extra SELECTs PER CLAIM — a list
#: of six claims cost fourteen queries, and the only reason no test caught it
#: is that the fixtures had two. selectinload issues a fixed number of queries
#: whatever the row count, which is the property that matters.
CLAIM_OUT_LOADERS = (
    selectinload(Claim.submitter),
    selectinload(Claim.participants)
    .selectinload(ClaimParticipant.entries)
    .selectinload(AttendanceEntry.subject_faculty),
    selectinload(Claim.participants)
    .selectinload(ClaimParticipant.entries)
    .selectinload(AttendanceEntry.co_faculty),
)


def _teaches_entry(faculty_id: str):
    """Either teacher of the hour — the slot's own, or its co-teacher."""
    return or_(AttendanceEntry.subject_faculty_id == faculty_id, AttendanceEntry.co_faculty_id == faculty_id)


class ClaimRepository(BaseRepository[Claim]):
    def get_by_reference(self, db: Session, *, ref_num: str) -> Optional[Claim]:
        return db.query(Claim).filter(Claim.reference_number == ref_num).first()

    def get_multi(self, db: Session, *, skip: int = 0, limit: Optional[int] = None) -> List[Claim]:
        q = db.query(Claim).options(*CLAIM_OUT_LOADERS).order_by(
            Claim.submission_date.desc(), Claim.id.desc()
        ).offset(skip)
        return (q.limit(limit) if limit is not None else q).all()

    # Newest first. Without an ORDER BY, Postgres returns rows in whatever
    # order it likes, so a student's claim list visibly reshuffled between
    # loads — a present-tense bug, not a future one.
    def get_by_submitter(self, db: Session, *, user_id: str) -> List[Claim]:
        return db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.submitted_by == user_id
        ).order_by(Claim.submission_date.desc(), Claim.id.desc()).all()

    def get_decided_by_subject_faculty(self, db: Session, *, faculty_id: str) -> List[Claim]:
        """Claims carrying at least one entry this faculty member has already
        approved or rejected — their "done" pile.

        A join rather than a walk over every entry: a subject faculty member
        accumulates one decided entry per claim per semester, and loading them
        all to filter in Python is the shape that gets slower every week.
        """
        return (
            db.query(Claim)
            .options(*CLAIM_OUT_LOADERS)
            .join(ClaimParticipant, ClaimParticipant.claim_id == Claim.id)
            .join(AttendanceEntry, AttendanceEntry.claim_participant_id == ClaimParticipant.id)
            .filter(
                _teaches_entry(faculty_id),
                AttendanceEntry.status != "pending",
            )
            .order_by(Claim.submission_date.desc(), Claim.id.desc())
            .distinct()
            .all()
        )

    def get_by_stage(self, db: Session, *, stage: str) -> List[Claim]:
        return db.query(Claim).options(*CLAIM_OUT_LOADERS).filter(
            Claim.current_workflow_stage == stage
        ).order_by(Claim.submission_date.desc(), Claim.id.desc()).all()

class ClaimParticipantRepository(BaseRepository[ClaimParticipant]):
    def get_by_claim(self, db: Session, *, claim_id: str) -> List[ClaimParticipant]:
        return db.query(ClaimParticipant).filter(ClaimParticipant.claim_id == claim_id).all()

class AttendanceEntryRepository(BaseRepository[AttendanceEntry]):
    def get_by_participant(self, db: Session, *, participant_id: str) -> List[AttendanceEntry]:
        return db.query(AttendanceEntry).filter(AttendanceEntry.claim_participant_id == participant_id).all()

    def get_pending_by_faculty(self, db: Session, *, faculty_id: str) -> List[AttendanceEntry]:
        return db.query(AttendanceEntry).filter(
            _teaches_entry(faculty_id),
            AttendanceEntry.status == "pending"
        ).all()

class SupportingDocumentRepository(BaseRepository[SupportingDocument]):
    def get_by_claim(self, db: Session, *, claim_id: str) -> List[SupportingDocument]:
        return db.query(SupportingDocument).filter(SupportingDocument.claim_id == claim_id).all()

class TimetableSessionRepository(BaseRepository[TimetableSession]):
    # Both reads eager-load the faculty relationships that
    # TimetableSession.faculty_name and co_faculty_name read. Without them,
    # rendering a timetable is extra SELECTs per slot.
    def get_by_academic_context(
        self, db: Session, *, prog: str, sem: str, sec: str, batch: Optional[str] = None
    ) -> List[TimetableSession]:
        """Every slot this class sits in.

        `batch` narrows to one lab/tutorial batch: a batched slot belongs only
        to its own batch, while an unbatched slot (batch IS NULL) is attended
        by the whole class and is therefore always included. Passing None
        returns the class's complete grid, which is what a Class Teacher or
        the HOD wants to see when maintaining it.
        """
        q = db.query(TimetableSession).options(
            selectinload(TimetableSession.faculty), selectinload(TimetableSession.co_faculty)
        ).filter(
            TimetableSession.programme == prog,
            TimetableSession.semester == sem,
            TimetableSession.section == sec
        )
        if batch:
            q = q.filter(or_(TimetableSession.batch.is_(None), TimetableSession.batch == batch))
        return q.order_by(TimetableSession.day_of_week, TimetableSession.hour).all()

    def get_by_faculty(self, db: Session, *, faculty_id: str) -> List[TimetableSession]:
        return db.query(TimetableSession).options(
            selectinload(TimetableSession.faculty), selectinload(TimetableSession.co_faculty)
        ).filter(or_(
            TimetableSession.faculty_id == faculty_id, TimetableSession.co_faculty_id == faculty_id
        )).order_by(
            TimetableSession.day_of_week, TimetableSession.hour
        ).all()

claim_repo = ClaimRepository(Claim)
claim_participant_repo = ClaimParticipantRepository(ClaimParticipant)
attendance_entry_repo = AttendanceEntryRepository(AttendanceEntry)
doc_repo = SupportingDocumentRepository(SupportingDocument)
timetable_repo = TimetableSessionRepository(TimetableSession)
