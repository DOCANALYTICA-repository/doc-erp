"""Who may file a club's yellow forms, and who may read them.

FILE (create, edit, submit, delete pre-approvals and claim sheets):
  super_admin; the club's assigned Faculty Coordinator when the club has
  faculty_coordinator_full_access; an active member who is not bottom rank in
  the club hierarchy, or is its top rank, or whose permission template is
  "Club Head". Rank in THIS club only: the Club President / Vice President
  role tags are global, so being President of another club grants nothing.
  Bottom-rank members can read their club's forms but not file them.

READ:
  super_admin and the club's readers (clubs._require_club_reader) see
  everything, drafts included. Holders of yellow_forms:view_all (Associate
  HOD, Claims Coordinator, HOD) see every club's forms once submitted. A
  student listed on a form sees that form and its claim sheet once it is not
  a draft.

The filing rule is written once, over ClubViewerFacts, so the bootstrap's
can_file_yellow_forms and the endpoints cannot disagree.
"""
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core import faculty_scope
from app.core.rbac import get_resolved_permissions
from app.models.user import User

VIEW_ALL = "yellow_forms:view_all"


def can_file_with_facts(facts, club) -> bool:
    """The filing rule over an already-built clubs.ClubViewerFacts."""
    if facts.is_super_admin:
        return True
    if club is not None and club.faculty_coordinator_full_access and facts.is_faculty and facts.is_club_coordinator:
        return True
    if not facts.is_active_member:
        return False
    return (
        not facts.is_bottom_rank
        or facts.is_top_rank
        or facts.membership.permission_template == "Club Head"
    )


def can_file(db: Session, user: User, club_id: str) -> bool:
    # Lazy: clubs.py imports this module.
    from app.api.v1.endpoints.clubs import ClubViewerFacts
    from app.repositories.club import club_repo

    club = club_repo.get(db, club_id)
    if club is None:
        return False
    return can_file_with_facts(ClubViewerFacts(db, user, club_id), club)


def can_read_club(db: Session, user: User, club_id: str) -> bool:
    from app.api.v1.endpoints.clubs import _require_club_reader

    try:
        _require_club_reader(db, user, club_id)
        return True
    except HTTPException:
        return False


def has_view_all(user: User) -> bool:
    permissions = get_resolved_permissions(user)
    return "*" in permissions or VIEW_ALL in permissions


def submitted_club_scope(db: Session, user: User) -> Optional[List[str]]:
    """The clubs whose SUBMITTED forms this user may read, for listings that
    span clubs; None means every club.

    Club-level only: a student listed on one form reads that form, which a
    per-club scope cannot express.
    """
    from app.api.v1.endpoints.clubs import _is_department_wide_reviewer
    from app.models.club import ClubMember

    if has_view_all(user) or _is_department_wide_reviewer(user):
        return None
    member_of = [
        club_id for (club_id,) in db.query(ClubMember.club_id)
        .filter(ClubMember.student_id == user.id, ClubMember.status == "active")
    ]
    return sorted(set(member_of) | set(faculty_scope.get_club_coordinator_club_ids(db, user.id)))


def _listed(students, user_id: str) -> bool:
    return any(s.student_id == user_id for s in students)


def pre_approval_visible(
    user: User, form, *, is_club_reader: bool, view_all: bool, include_listed_students: bool = True,
) -> bool:
    """The read rule, given the two facts that cost queries to establish."""
    if user.primary_role == "super_admin" or is_club_reader:
        return True
    if form.status == "draft":
        return False
    if view_all:
        return True
    return include_listed_students and _listed(form.students, user.id)


def claim_sheet_visible(
    user: User, sheet, *, is_club_reader: bool, view_all: bool, include_listed_students: bool = True,
) -> bool:
    if user.primary_role == "super_admin" or is_club_reader:
        return True
    if sheet.status == "draft":
        return False
    if view_all:
        return True
    return include_listed_students and (
        _listed(sheet.students, user.id) or _listed(sheet.pre_approval.students, user.id)
    )


def can_view_pre_approval(db: Session, user: User, form, *, include_listed_students: bool = True) -> bool:
    return pre_approval_visible(
        user, form,
        is_club_reader=can_read_club(db, user, form.club_id),
        view_all=has_view_all(user),
        include_listed_students=include_listed_students,
    )


def can_view_claim_sheet(db: Session, user: User, sheet, *, include_listed_students: bool = True) -> bool:
    return claim_sheet_visible(
        user, sheet,
        is_club_reader=can_read_club(db, user, sheet.club_id),
        view_all=has_view_all(user),
        include_listed_students=include_listed_students,
    )
