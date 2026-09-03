from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from app.core import visibility
from app.models.user import User
from app.models.club import Club
from app.models.faculty import Meeting, Task

class SearchEngine:
    def global_search(
        self, db: Session, *, query: str, user_id: str, current_user: Optional[User] = None
    ) -> Dict[str, List[Any]]:
        """Global query across Users, Clubs, Meetings, and Tasks.

        Results are scoped to the caller. Previously this returned every user
        and every meeting on the platform regardless of who was asking, which
        made search a way around the gates on every other read.
        """
        if len(query) < 2:
            return {"users": [], "clubs": [], "meetings": [], "tasks": []}
            
        term = f"%{query}%"
        
        # 1. Search Users
        #
        # Students may find faculty (that is what the directory is for); they
        # may not enumerate the whole student body through the search box.
        user_q = db.query(User).filter(User.name.like(term) | User.email.like(term))
        if current_user is not None and not visibility.is_faculty_side(current_user):
            user_q = user_q.filter(User.primary_role == "faculty")
        users = user_q.order_by(User.name).limit(5).all()
        user_results = [{"id": u.id, "name": u.name, "email": u.email, "role": u.primary_role} for u in users]
        
        # 2. Search Clubs
        clubs = db.query(Club).filter(Club.name.like(term) | Club.description.like(term)).order_by(Club.name).limit(5).all()
        club_results = [{"id": c.id, "name": c.name, "category": c.category} for c in clubs]
        
        # 3. Search Meetings — scoped the same way the calendar is.
        meetings = db.query(Meeting).filter(Meeting.title.like(term) | Meeting.venue.like(term)).all()
        if current_user is not None:
            meetings = visibility.visible_meetings(db, current_user, meetings)
        meetings = meetings[:5]
        meeting_results = [{"id": m.id, "title": m.title, "date": m.date, "venue": m.venue} for m in meetings]
        
        # 4. Search Tasks (only those assigned to user)
        tasks = db.query(Task).filter(
            Task.assignee_id == user_id,
            Task.title.like(term) | Task.description.like(term)
        ).limit(5).all()
        task_results = [{"id": t.id, "title": t.title, "priority": t.priority, "status": t.status} for t in tasks]
        
        return {
            "users": user_results,
            "clubs": club_results,
            "meetings": meeting_results,
            "tasks": task_results
        }

search_engine = SearchEngine()
