from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import get_current_user
from app.repositories.faculty import note_repo, document_repo, meeting_repo
from app.schemas.faculty import NoteOut, NoteCreate, DocumentOut, DocumentCreate, MeetingOut, MeetingCreate, MeetingMinutesUpdate
from app.models.user import User
from app.models.faculty import Note, Document, Meeting
from app.services.engines.storage import storage_engine
from app.services.engines.task import task_engine
import uuid

router = APIRouter()

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

@router.delete("/notes/{note_id}")
def delete_note(note_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = note_repo.get(db, note_id)
    if not note or note.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    note_repo.remove(db, id=note_id)
    return {"status": "success"}

# 2. Documents Space
@router.get("/documents", response_model=List[DocumentOut])
def list_documents(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return document_repo.get_by_owner(db, owner_id=current_user.id)

@router.post("/documents", response_model=DocumentOut)
def create_document(doc_in: DocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    doc_dict = doc_in.dict()
    doc_dict["id"] = f"doc_{uuid.uuid4().hex[:12]}"
    doc_dict["owner_id"] = current_user.id
    doc_dict["shared_link"] = f"share_{uuid.uuid4().hex[:12]}"
    doc_dict["is_link_revoked"] = False
    return document_repo.create(db, obj_in=doc_dict)

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
    return meeting_repo.create(db, obj_in=meet_dict)

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
