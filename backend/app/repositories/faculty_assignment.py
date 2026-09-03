from typing import List, Optional
from sqlalchemy.orm import Session
from app.repositories.base import BaseRepository
from app.models.faculty_assignment import FacultyAssignment


class FacultyAssignmentRepository(BaseRepository[FacultyAssignment]):
    def get_by_faculty(self, db: Session, *, faculty_id: str) -> List[FacultyAssignment]:
        return db.query(FacultyAssignment).filter(FacultyAssignment.faculty_id == faculty_id).all()

    def get_active_by_faculty_and_tag(self, db: Session, *, faculty_id: str, role_tag: str) -> List[FacultyAssignment]:
        return db.query(FacultyAssignment).filter(
            FacultyAssignment.faculty_id == faculty_id,
            FacultyAssignment.role_tag == role_tag,
            FacultyAssignment.status == "active",
        ).all()

    def get_active_by_club_and_tag(self, db: Session, *, club_id: str, role_tag: str) -> List[FacultyAssignment]:
        return db.query(FacultyAssignment).filter(
            FacultyAssignment.club_id == club_id,
            FacultyAssignment.role_tag == role_tag,
            FacultyAssignment.status == "active",
        ).all()


faculty_assignment_repo = FacultyAssignmentRepository(FacultyAssignment)
