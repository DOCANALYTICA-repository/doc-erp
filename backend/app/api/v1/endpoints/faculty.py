from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user, PermissionChecker
from app.repositories.faculty import note_repo, document_repo, meeting_repo, reminder_repo, widget_preference_repo
from app.repositories.faculty_assignment import faculty_assignment_repo
from app.schemas.faculty import (
    NoteOut, NoteCreate, NoteUpdate, DocumentOut, MeetingOut, MeetingCreate, MeetingMinutesUpdate,
    ReminderOut, ReminderCreate, ReminderUpdate,
    DashboardWidgetPreferenceItem, DashboardWidgetPreferenceOut,
    FacultyAssignmentOut, FacultyAssignmentCreate,
)
from app.models.user import User
from app.models.faculty import Note, Document, Meeting
from app.services.engines.storage import storage_engine
from app.services.engines.task import task_engine
from app.services.engines.notification import notification_engine
from app.services.engines.club_hierarchy import club_hierarchy_engine
from app.repositories.club import member_repo
import uuid

router = APIRouter()

# Scoped faculty role assignments — the admin surface for Class Teacher /
# Course Coordinator / Club Faculty Coordinator scoping (see
# app/core/faculty_scope.py). Gated by the existing "rbac:assign_roles"
# permission, already HOD/super_admin-only — no new permission needed.
VALID_ASSIGNMENT_TAGS = {"Class Teacher", "Course Coordinator", "Club Faculty Coordinator"}


@router.get("/assignments", response_model=List[FacultyAssignmentOut])
def list_faculty_assignments(
    faculty_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["rbac:assign_roles"])),
):
    if faculty_id:
        return faculty_assignment_repo.get_by_faculty(db, faculty_id=faculty_id)
    return faculty_assignment_repo.get_multi(db, limit=1000)


@router.post("/assignments", response_model=FacultyAssignmentOut)
def create_faculty_assignment(
    assignment_in: FacultyAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["rbac:assign_roles"])),
):
    if assignment_in.role_tag not in VALID_ASSIGNMENT_TAGS:
        raise HTTPException(status_code=400, detail=f"role_tag must be one of {sorted(VALID_ASSIGNMENT_TAGS)}")
    target = db.query(User).filter(User.id == assignment_in.faculty_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Faculty member not found")
    if assignment_in.role_tag not in target.role_tags_list:
        raise HTTPException(status_code=400, detail=f"{target.name} does not hold the '{assignment_in.role_tag}' tag")

    assignment_dict = assignment_in.dict()
    assignment_dict["id"] = f"fa_{uuid.uuid4().hex[:12]}"
    assignment_dict["status"] = "active"
    return faculty_assignment_repo.create(db, obj_in=assignment_dict)


@router.delete("/assignments/{assignment_id}")
def revoke_faculty_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["rbac:assign_roles"])),
):
    assignment = faculty_assignment_repo.get(db, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    faculty_assignment_repo.update(db, db_obj=assignment, obj_in={"status": "revoked"})
    return {"status": "success"}


@router.get("/my-assignments", response_model=List[FacultyAssignmentOut])
def get_my_assignments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [a for a in faculty_assignment_repo.get_by_faculty(db, faculty_id=current_user.id) if a.status == "active"]

# 1. Personal Notes
@router.get("/notes", response_model=List[NoteOut])
def list_notes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return note_repo.get_by_owner(db, owner_id=current_user.id)

@router.post("/notes", response_model=NoteOut)
def create_note(note_in: NoteCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note_dict = note_in.dict()
    note_dict["id"] = f"note_{uuid.uuid4().hex[:12]}"
    note_dict["owner_id"] = current_user.id
    return note_repo.create(db, obj_in=note_dict)

@router.put("/notes/{note_id}", response_model=NoteOut)
def update_note(
    note_id: str,
    note_in: NoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Previously missing entirely — notes could be created and listed but
    never edited, so pinning/favoriting after creation (which the
    dashboard's "Pinned Notes" widget depends on) had no way to happen.
    """
    note = note_repo.get(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note_repo.update(db, db_obj=note, obj_in=note_in.model_dump(exclude_unset=True))

@router.delete("/notes/{note_id}")
def delete_note(note_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = note_repo.get(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    note_repo.remove(db, id=note_id)
    return {"status": "success"}

# 2. Documents Space — real upload via the Storage Engine (Phase 1C). This
# used to accept a client-supplied fake file_url string; it now accepts an
# actual file and stores it in Supabase Storage.
@router.get("/documents", response_model=List[DocumentOut])
def list_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return document_repo.get_by_owner(db, owner_id=current_user.id)

@router.post("/documents", response_model=DocumentOut)
async def create_document(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    folder_path: str = Form("/"),
    tags: str = Form(""),
    is_favorite: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stored_path = await storage_engine.upload_file(file, folder=f"faculty_documents/{current_user.id}")
    doc_dict = {
        "id": f"doc_{uuid.uuid4().hex[:12]}",
        "owner_id": current_user.id,
        "name": name or file.filename or "Untitled",
        "file_url": stored_path,
        "folder_path": folder_path,
        "tags": tags,
        "is_favorite": is_favorite,
        "shared_link": f"share_{uuid.uuid4().hex[:12]}",
        "is_link_revoked": False,
    }
    return document_repo.create(db, obj_in=doc_dict)

@router.get("/documents/{document_id}/download-url")
def get_document_download_url(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = document_repo.get(db, document_id)
    if not doc or doc.owner_id != current_user.id or doc.is_link_revoked:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"url": storage_engine.get_signed_url(doc.file_url)}

# 3. Meetings
@router.get("/meetings", response_model=List[MeetingOut])
def list_meetings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return meeting_repo.get_by_organizer(db, organizer_id=current_user.id)

@router.post("/meetings", response_model=MeetingOut)
def create_meeting(meet_in: MeetingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meet_dict = meet_in.dict()
    meet_dict["id"] = f"meet_{uuid.uuid4().hex[:12]}"
    meet_dict["organizer_id"] = current_user.id
    meet_dict["status"] = "scheduled"
    created = meeting_repo.create(db, obj_in=meet_dict)

    # Cross-module regression fix (Phase 7): a club-linked meeting used to
    # notify nobody in that club — Master Plan §44's Meeting -> Notification
    # Engine -> Faculty Notified chain, mirrored here for the club side.
    if created.club_id:
        club_hierarchy_engine.notify_club_leadership(
            db, club_id=created.club_id, title="New club meeting scheduled",
            content=f"{created.title} on {created.date} at {created.time}.",
        )
    return created

@router.post("/meetings/{meeting_id}/minutes", response_model=MeetingOut)
def record_meeting_minutes(
    meeting_id: str,
    minutes_in: MeetingMinutesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    meeting = meeting_repo.get(db, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the meeting organizer can record minutes")

    # Explicit, validated gate (Phase 6): a meeting cannot be marked complete
    # without real minutes, decisions, and action items — this used to be
    # an implicit side effect of merely calling this endpoint at all.
    if not minutes_in.minutes.strip():
        raise HTTPException(status_code=400, detail="Minutes are required to complete a meeting")
    if not minutes_in.decisions:
        raise HTTPException(status_code=400, detail="At least one decision is required to complete a meeting")

    meeting.minutes = minutes_in.minutes
    meeting.decisions = ",".join(minutes_in.decisions)
    meeting.status = "completed"

    # Sync meeting action items as formal tasks inside the Platform Task Engine
    task_engine.sync_meeting_action_items(
        db,
        meeting_id=meeting_id,
        organizer_id=current_user.id,
        action_items=minutes_in.action_items
    )

    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting

# 4. Reminders (Faculty PRD v1 workspace — previously had no model or endpoints at all)
@router.get("/reminders", response_model=List[ReminderOut])
def list_reminders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return reminder_repo.get_by_owner(db, owner_id=current_user.id)

@router.post("/reminders", response_model=ReminderOut)
def create_reminder(
    reminder_in: ReminderCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    reminder_dict = reminder_in.dict()
    reminder_dict["id"] = f"rem_{uuid.uuid4().hex[:12]}"
    reminder_dict["owner_id"] = current_user.id
    reminder_dict["status"] = "scheduled"
    return reminder_repo.create(db, obj_in=reminder_dict)

@router.put("/reminders/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: str,
    reminder_in: ReminderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reminder = reminder_repo.get(db, reminder_id)
    if not reminder or reminder.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder_repo.update(db, db_obj=reminder, obj_in=reminder_in.model_dump(exclude_unset=True))

@router.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reminder = reminder_repo.get(db, reminder_id)
    if not reminder or reminder.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    reminder_repo.remove(db, id=reminder_id)
    return {"status": "success"}

# 5. Dashboard widget preferences — minimum-viable Workspace Engine (Phase 2).
# v1 scope is deliberately just order + show/hide; drag-and-drop/collapse is
# faculty.dashboard_customization_advanced (coming_soon).
DEFAULT_WIDGET_ORDER = [
    "todays_schedule", "tasks", "notification_summary", "calendar_preview",
    "meetings", "reminders", "notes", "quick_actions",
]

@router.get("/dashboard-preferences", response_model=List[DashboardWidgetPreferenceOut])
def get_dashboard_preferences(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = widget_preference_repo.get_by_owner(db, owner_id=current_user.id)
    if existing:
        return existing

    # First visit: return the documented default order WITHOUT persisting it.
    #
    # This used to perform 8 inserts and 8 separate commits inside a GET. Two
    # tabs opened at once raced into duplicate rows, and at 127 ms per round
    # trip it also made a read take about a second. Nothing needs these rows
    # to exist until the user actually reorders something — which is a PUT,
    # and the PUT already upserts.
    return [
        DashboardWidgetPreferenceOut(
            id=f"default_{key}",
            owner_id=current_user.id,
            widget_key=key,
            order=str(i),
            visible=True,
        )
        for i, key in enumerate(DEFAULT_WIDGET_ORDER)
    ]

@router.put("/dashboard-preferences", response_model=List[DashboardWidgetPreferenceOut])
def update_dashboard_preferences(
    prefs_in: List[DashboardWidgetPreferenceItem],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = []
    for item in prefs_in:
        existing = widget_preference_repo.get_one(db, owner_id=current_user.id, widget_key=item.widget_key)
        if existing:
            result.append(widget_preference_repo.update(db, db_obj=existing, obj_in=item.model_dump()))
        else:
            result.append(widget_preference_repo.create(db, obj_in={
                "id": f"widgetpref_{uuid.uuid4().hex[:12]}",
                "owner_id": current_user.id,
                **item.model_dump(),
            }))
    return result
