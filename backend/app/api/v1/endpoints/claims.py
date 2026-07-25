from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user
from app.repositories.claim import claim_repo, claim_participant_repo, attendance_entry_repo, timetable_repo
from app.schemas.claim import ClaimOut, ClaimCreate, TimetableSessionOut
from app.models.user import User
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry
import uuid
from datetime import datetime, timezone

router = APIRouter()

# 1. Timetable fetch helper (Missed class selection)
@router.get("/timetable", response_model=List[TimetableSessionOut])
def get_student_timetable(
    programme: str,
    semester: str,
    section: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return timetable_repo.get_by_academic_context(db, prog=programme, sem=semester, sec=section)

# 2. Submit Claim
@router.post("/", response_model=ClaimOut)
def submit_attendance_claim(
    claim_in: ClaimCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:submit"]))
):
    claim_id = f"cl_{uuid.uuid4().hex[:12]}"
    ref_num = f"ACP-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"
    
    # Create main Claim record
    claim_dict = {
        "id": claim_id,
        "reference_number": ref_num,
        "category": claim_in.category,
        "academic_year": claim_in.academic_year,
        "semester": claim_in.semester,
        "programme": claim_in.programme,
        "section": claim_in.section,
        "submission_type": claim_in.submission_type,
        "submitted_by": current_user.id,
        "submission_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "date_range": claim_in.date_range,
        "reason": claim_in.reason,
        "status": "submitted",
        "late_submission_flag": False,
        "current_workflow_stage": "initial_review" # Class Teacher or Coordinator
    }
    db_claim = Claim(**claim_dict)
    db.add(db_claim)
    
    # Group submission: multiple students, else just the submitter
    student_ids = claim_in.student_ids or [current_user.id]
    for s_id in student_ids:
        cp_id = f"cp_{uuid.uuid4().hex[:12]}"
        db_participant = ClaimParticipant(
            id=cp_id,
            claim_id=claim_id,
            student_id=s_id,
            status="pending"
        )
        db.add(db_participant)
        
        # Missed classes entries
        for mc in claim_in.missed_classes:
            entry_id = f"ae_{uuid.uuid4().hex[:12]}"
            db_entry = AttendanceEntry(
                id=entry_id,
                claim_participant_id=cp_id,
                subject=mc.subject,
                date=mc.date,
                hour=mc.hour,
                subject_faculty_id=mc.subject_faculty_id,
                status="pending"
            )
            db.add(db_entry)
            
    db.commit()
    db.refresh(db_claim)
    return db_claim

# 3. Retrieve Claims
@router.get("/", response_model=List[ClaimOut])
def list_claims(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.primary_role == "super_admin":
        return claim_repo.get_multi(db)
    elif current_user.primary_role == "faculty":
        # Faculty see all claims under review or where they are subject teachers
        return db.query(Claim).filter(Claim.status.in_(["submitted", "under_review"])).all()
    else:
        # Students see their own claims
        return claim_repo.get_by_submitter(db, user_id=current_user.id)

@router.get("/{claim_id}", response_model=ClaimOut)
def get_claim(claim_id: str, db: Session = Depends(get_db)):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim

# 4. Review Claim Approval Actions
@router.post("/{claim_id}/approve-stage")
def approve_claim_stage(
    claim_id: str,
    action: str, # approve, reject, revise
    feedback: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
        
    if action == "revise":
        claim.status = "returned"
        claim.current_workflow_stage = "closed"
    elif action == "reject":
        claim.status = "rejected"
        claim.current_workflow_stage = "closed"
    else: # approve
        if claim.current_workflow_stage == "initial_review":
            # Initial verification complete. Move to parallel Subject Faculty review
            claim.current_workflow_stage = "subject_faculty"
            claim.status = "under_review"
        elif claim.current_workflow_stage == "subject_faculty":
            # Move to Course Coordinator review
            claim.current_workflow_stage = "course_coordinator"
        elif claim.current_workflow_stage == "course_coordinator":
            # Final approval. Forward to Attendance Office
            claim.current_workflow_stage = "attendance_office"
            claim.status = "approved"
        elif claim.current_workflow_stage == "attendance_office":
            claim.current_workflow_stage = "closed"
            claim.status = "closed"
            
    db.add(claim)
    db.commit()
    return {"status": "success", "new_stage": claim.current_workflow_stage, "claim_status": claim.status}
