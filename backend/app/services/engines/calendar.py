from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session, selectinload
from app.core import visibility
from app.models.club import Event, ClubMember
from app.models.faculty import Meeting, Task
from app.models.claim import TimetableSession
from app.models.user import User

class CalendarEngine:
    def get_unified_events(
        self,
        db: Session,
        *,
        user_id: str,
        user_role: str,
        academic_context: Dict[str, str] = None,
        current_user: Optional[User] = None,
    ) -> List[Dict[str, Any]]:
        """
        Gathers calendar events from multiple domains:
        1. Club Events (relevant to the student or coordinator)
        2. Meetings (relevant to organizers/participants)
        3. Timetable Sessions (if academic context provided)
        4. Tasks due
        """
        events: List[Dict[str, Any]] = []

        # 1. Gather Club Events
        club_events = db.query(Event).options(selectinload(Event.club)).all()
        for ce in club_events:
            events.append({
                "id": ce.id,
                "title": f"[{ce.club.name if ce.club else 'Club'}] {ce.title}",
                "description": ce.description,
                "start": ce.date,
                "end": ce.date,
                "type": "club_event",
                "venue": ce.venue
            })

        # 2. Gather Meetings
        #
        # This used to be a bare `db.query(Meeting).all()` and it put EVERY
        # meeting on the platform — including the full minutes text — on every
        # user's calendar, students included. Scope the rows first, then decide
        # separately whether this caller may read the minutes: being able to
        # see that a meeting happened is not the same as being entitled to
        # read what was decided in it.
        meetings = db.query(Meeting).options(selectinload(Meeting.organizer)).all()
        if current_user is not None:
            meetings = visibility.visible_meetings(db, current_user, meetings)
        for m in meetings:
            may_read = current_user is not None and visibility.may_read_minutes(current_user, m)
            events.append({
                "id": m.id,
                "title": f"[Meeting] {m.title}",
                "description": (m.minutes if may_read else None) or "Scheduled Meeting",
                "start": f"{m.date}T{m.time[:5] if ':' in m.time else '09:00'}",
                "end": m.date,
                "type": "meeting",
                "venue": m.venue
            })

        # 3. Gather Tasks (by due date)
        tasks = db.query(Task).filter(Task.assignee_id == user_id).all()
        for t in tasks:
            events.append({
                "id": t.id,
                "title": f"[Task] {t.title}",
                "description": t.description,
                "start": t.due_date,
                "end": t.due_date,
                "type": "task",
                "priority": t.priority
            })

        # 4. Gather Timetable Sessions if academic context is available
        if academic_context:
            prog = academic_context.get("programme")
            sem = academic_context.get("semester")
            sec = academic_context.get("section")
            if prog and sem and sec:
                sessions = db.query(TimetableSession).options(
                    selectinload(TimetableSession.faculty)
                ).filter(
                    TimetableSession.programme == prog,
                    TimetableSession.semester == sem,
                    TimetableSession.section == sec
                ).all()
                for s in sessions:
                    events.append({
                        "id": s.id,
                        "title": f"[Class] {s.subject}",
                        "description": f"Faculty: {s.faculty.name if s.faculty else 'Department'}",
                        "start": s.day_of_week, # For scheduler mapping (e.g. Monday, 9:00)
                        "hour": s.hour,
                        "type": "timetable"
                    })

        return events

calendar_engine = CalendarEngine()
