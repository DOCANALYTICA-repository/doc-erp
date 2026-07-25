from fastapi import APIRouter
from app.api.v1.endpoints import auth, clubs, claims, faculty, tasks, notifications, content, search, calendar, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(clubs.router, prefix="/clubs", tags=["clubs"])
api_router.include_router(claims.router, prefix="/claims", tags=["claims"])
api_router.include_router(faculty.router, prefix="/faculty", tags=["faculty"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(content.router, prefix="/content", tags=["content"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
