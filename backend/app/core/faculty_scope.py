"""Scope-check helpers layered on top of app.core.rbac.

rbac.py answers "can this role/tag ever perform category-of-action X" as a
flat permission string. These helpers answer "is this SPECIFIC claim/club
actually theirs" by querying FacultyAssignment rows. Every caller must check
BOTH — the permission string is necessary but no longer sufficient.

HOD and Cultural Coordinator are intentionally NOT scoped here — they remain
global/department-wide.
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.faculty_assignment import FacultyAssignment
from app.repositories.faculty_assignment import faculty_assignment_repo

CLASS_TEACHER = "Class Teacher"
COURSE_COORDINATOR = "Course Coordinator"
CLUB_FACULTY_COORDINATOR = "Club Faculty Coordinator"


def _active_assignments(db: Session, faculty_id: str, role_tag: str) -> List[FacultyAssignment]:
    return faculty_assignment_repo.get_active_by_faculty_and_tag(db, faculty_id=faculty_id, role_tag=role_tag)


def is_class_teacher_for(db: Session, faculty_id: str, programme: Optional[str], semester: Optional[str], section: Optional[str]) -> bool:
    return any(
        a.programme == programme and a.semester == semester and (a.section is None or a.section == section)
        for a in _active_assignments(db, faculty_id, CLASS_TEACHER)
    )


def is_course_coordinator_for(db: Session, faculty_id: str, programme: Optional[str]) -> bool:
    return any(a.programme == programme for a in _active_assignments(db, faculty_id, COURSE_COORDINATOR))


def is_club_faculty_coordinator_for(db: Session, faculty_id: str, club_id: Optional[str]) -> bool:
    if not club_id:
        return False
    return any(a.club_id == club_id for a in _active_assignments(db, faculty_id, CLUB_FACULTY_COORDINATOR))


def get_class_teacher_scopes(db: Session, faculty_id: str) -> List[FacultyAssignment]:
    return _active_assignments(db, faculty_id, CLASS_TEACHER)


def get_course_coordinator_programmes(db: Session, faculty_id: str) -> List[str]:
    return [a.programme for a in _active_assignments(db, faculty_id, COURSE_COORDINATOR)]


def get_club_coordinator_club_ids(db: Session, faculty_id: str) -> List[str]:
    return [a.club_id for a in _active_assignments(db, faculty_id, CLUB_FACULTY_COORDINATOR) if a.club_id]
