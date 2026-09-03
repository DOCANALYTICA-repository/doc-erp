"""Row-level read scoping for the cross-cutting surfaces.

The Clubs content engine already states the design intent explicitly
(content.py: the public showcase must never expose "member lists, budgets, or
any operational data — that's what the real, authenticated /clubs endpoints are
for"). The problem was that the authenticated endpoints enforced nothing: the
calendar returned every meeting on the platform, minutes text included, to
every user; global search did the same.

These helpers give calendar, search and the directory one shared answer to
"which of these rows may this caller see".
"""
from typing import List, Sequence

from sqlalchemy.orm import Session

from app.models.club import ClubMember
from app.models.faculty import Meeting
from app.models.user import User


def is_faculty_side(user: User) -> bool:
    return user.primary_role in ("faculty", "super_admin")


def active_club_ids_for(db: Session, user: User) -> set:
    rows = db.query(ClubMember.club_id).filter(
        ClubMember.student_id == user.id,
        ClubMember.status == "active",
    ).all()
    return {r[0] for r in rows}


def visible_meetings(db: Session, user: User, meetings: Sequence[Meeting]) -> List[Meeting]:
    """Filter meetings to those the caller has any business seeing.

    Visible when the caller is super_admin, the organizer, a faculty member
    looking at a department meeting, or an active member of the club a club
    meeting belongs to. Everything else is somebody else's meeting.
    """
    if user.primary_role == "super_admin":
        return list(meetings)

    faculty = is_faculty_side(user)
    club_ids = None  # computed lazily; most callers never need it

    visible = []
    for m in meetings:
        if m.organizer_id == user.id:
            visible.append(m)
            continue
        if m.club_id:
            if club_ids is None:
                club_ids = active_club_ids_for(db, user)
            if m.club_id in club_ids:
                visible.append(m)
            continue
        if faculty and m.type == "department":
            visible.append(m)
    return visible


def may_read_minutes(user: User, meeting: Meeting) -> bool:
    """Minutes are a narrower grant than the meeting's existence.

    Knowing a department meeting is on the calendar is not the same as being
    entitled to read what was decided in it.
    """
    if user.primary_role == "super_admin":
        return True
    if meeting.organizer_id == user.id:
        return True
    return is_faculty_side(user)
