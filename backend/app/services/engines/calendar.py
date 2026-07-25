from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.club import Event, ClubMember
from app.models.faculty import Meeting, Task
from app.models.claim import TimetableSession

class CalendarEngine:
    def get_unified_events(
        self,
        db: Session,
        *,
        user_id: str,
        user_role: str,
        academic_context: Dict[str, str] = None
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
        club_events = db.query(Event).all() # Simplification for Version 1
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
        meetings = db.query(Meeting).all() # Fetch meetings organized by user or in department
        for m in meetings:
            events.append({
                "id": m.id,
                "title": f"[Meeting] {m.title}",
                "description": m.minutes or "Scheduled Meeting",
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
                sessions = db.query(TimetableSession).filter(
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
