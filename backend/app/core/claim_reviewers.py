"""Who a claim is waiting on, right now.

A student looking at "Under review" has one question the stepper could not
answer: *who?* The stage told them which desk it was on, not which of the four
people at that desk had yet to decide — and at the subject-faculty stage that
is the whole question, because the claim waits for every one of them
independently.

The lookups are memoised per instance because a list of claims is nearly
always a list of claims from ONE class: resolving the Class Teacher once per
(programme, semester, section) rather than once per claim is the difference
between two queries and two hundred.

Build one per request and pass it down; never cache one between requests, or a
role change goes unnoticed until the process restarts.
"""
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core import faculty_scope
from app.models.claim import Claim
from app.models.faculty_assignment import FacultyAssignment
from app.models.user import User
from app.schemas.claim import PendingApprovalOut

#: Stages where the claim is still waiting on somebody inside this system.
_WAITING_STAGES = ("initial_review", "subject_faculty", "course_coordinator")


class ReviewerDirectory:
    def __init__(self, db: Session):
        self._db = db
        self._by_key: Dict[Tuple, List[Tuple[str, str]]] = {}

    # ---- assignment lookups ------------------------------------------------

    def _assigned(self, role_tag: str, **filters) -> List[Tuple[str, str]]:
        """(id, name) of every active holder of `role_tag` matching `filters`."""
        key = (role_tag, tuple(sorted(filters.items())))
        if key not in self._by_key:
            q = (
                self._db.query(FacultyAssignment.faculty_id, User.name)
                .join(User, User.id == FacultyAssignment.faculty_id)
                .filter(
                    FacultyAssignment.role_tag == role_tag,
                    FacultyAssignment.status == "active",
                )
            )
            for column, value in filters.items():
                q = q.filter(getattr(FacultyAssignment, column) == value)
            self._by_key[key] = [(fid, name) for fid, name in q.all()]
        return self._by_key[key]

    def class_teachers(self, programme, semester, section) -> List[Tuple[str, str]]:
        # A Class Teacher assignment may leave `section` NULL, meaning the
        # whole year — is_class_teacher_for() honours that, so this must too
        # rather than matching the section column exactly.
        return [
            (fid, name)
            for fid, name in self._assigned(
                faculty_scope.CLASS_TEACHER, programme=programme, semester=semester
            )
            if self._section_matches(fid, programme, semester, section)
        ]

    def _section_matches(self, faculty_id, programme, semester, section) -> bool:
        return faculty_scope.is_class_teacher_for(
            self._db, faculty_id, programme, semester, section
        )

    def club_coordinators(self, club_id: Optional[str]) -> List[Tuple[str, str]]:
        if not club_id:
            return []
        return self._assigned(faculty_scope.CLUB_FACULTY_COORDINATOR, club_id=club_id)

    def course_coordinators(self, programme: Optional[str]) -> List[Tuple[str, str]]:
        return self._assigned(faculty_scope.COURSE_COORDINATOR, programme=programme)

    # ---- the question this module exists to answer -------------------------

    def pending_for(self, claim: Claim) -> List[PendingApprovalOut]:
        """Everyone whose decision this claim is still waiting on.

        Empty once the claim is finished, rejected or returned: nobody is
        waiting on a claim that has stopped moving, and saying "awaiting
        Dr. X" under a rejection would be a lie.
        """
        stage = claim.current_workflow_stage
        if stage not in _WAITING_STAGES or claim.status in ("draft", "rejected", "returned"):
            return []

        if stage == "initial_review":
            if claim.submission_type == "club":
                people = self.club_coordinators(claim.club_id)
                role = "Club Faculty Coordinator"
            else:
                people = self.class_teachers(claim.programme, claim.semester, claim.section)
                role = "Class Teacher"
            return [
                PendingApprovalOut(stage=stage, role=role, faculty_id=fid, faculty_name=name)
                for fid, name in people
            ] or [PendingApprovalOut(stage=stage, role=role)]

        if stage == "subject_faculty":
            # One line per hour still unapproved, named. These come off the
            # entries already loaded for ClaimOut, so they cost nothing.
            out: List[PendingApprovalOut] = []
            for participant in claim.participants:
                for entry in participant.entries:
                    if entry.status != "pending":
                        continue
                    out.append(PendingApprovalOut(
                        stage=stage,
                        role="Subject Faculty",
                        faculty_id=entry.subject_faculty_id,
                        faculty_name=entry.subject_faculty_name or None,
                        co_faculty_id=entry.co_faculty_id,
                        co_faculty_name=entry.co_faculty_name,
                        subject=entry.subject,
                        course_code=entry.course_code,
                    ))
            return out

        people = self.course_coordinators(claim.programme)
        return [
            PendingApprovalOut(
                stage=stage, role="Course Coordinator", faculty_id=fid, faculty_name=name,
            )
            for fid, name in people
        ] or [PendingApprovalOut(stage=stage, role="Course Coordinator")]
