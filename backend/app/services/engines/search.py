from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.club import Club
from app.models.faculty import Meeting, Task

class SearchEngine:
    def global_search(self, db: Session, *, query: str, user_id: str) -> Dict[str, List[Any]]:
        """
        Executes a global query across Users, Clubs, Meetings, and Tasks.
        """
        if len(query) < 2:
            return {"users": [], "clubs": [], "meetings": [], "tasks": []}
            
        term = f"%{query}%"
        
        # 1. Search Users
        users = db.query(User).filter(User.name.like(term) | User.email.like(term)).limit(5).all()
        user_results = [{"id": u.id, "name": u.name, "email": u.email, "role": u.primary_role} for u in users]
        
        # 2. Search Clubs
        clubs = db.query(Club).filter(Club.name.like(term) | Club.description.like(term)).limit(5).all()
        club_results = [{"id": c.id, "name": c.name, "category": c.category} for c in clubs]
        
        # 3. Search Meetings
        meetings = db.query(Meeting).filter(Meeting.title.like(term) | Meeting.venue.like(term)).limit(5).all()
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
