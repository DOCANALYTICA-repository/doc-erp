from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user, get_resolved_permissions
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
        "current_workflow_stage": "initial_review" # Class Teacher or Club Faculty Coordinator
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
    return _to_claim_out(db_claim)


def _to_claim_out(claim: Claim) -> ClaimOut:
    """Attach the real submitter name via the existing relationship instead
    of trusting any client-supplied value — fixes the hardcoded
    'Vikram Aditya' display bug that existed purely on the frontend."""
    out = ClaimOut.model_validate(claim)
    out.submitter_name = claim.submitter.name if claim.submitter else "Unknown"
    return out


def _claims_pending_for_subject_faculty(db: Session, faculty_id: str) -> List[Claim]:
    """Every claim where this faculty member has at least one of their own
    pending AttendanceEntry rows — this is what get_pending_by_faculty()
    already computed but that list_claims() never called."""
    entries = attendance_entry_repo.get_pending_by_faculty(db, faculty_id=faculty_id)
    seen = {}
    for entry in entries:
        claim = entry.participant.claim if entry.participant else None
        if claim and claim.id not in seen:
            seen[claim.id] = claim
    return list(seen.values())


# 3. Retrieve Claims — scoped to what THIS user is actually allowed/expected to see
@router.get("/", response_model=List[ClaimOut])
def list_claims(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.primary_role == "super_admin":
        return [_to_claim_out(c) for c in claim_repo.get_multi(db)]

    if current_user.primary_role == "faculty":
        permissions = get_resolved_permissions(current_user)
        tags = set(current_user.role_tags_list)
        results = {}

        if "Class Teacher" in tags:
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage == "initial_review",
                Claim.submission_type == "individual",
            ).all():
                results[c.id] = c

        if "Club Faculty Coordinator" in tags:
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage == "initial_review",
                Claim.submission_type == "club",
            ).all():
                results[c.id] = c

        if "claims:review_faculty" in permissions:
            for c in _claims_pending_for_subject_faculty(db, current_user.id):
                results[c.id] = c

        if "Course Coordinator" in tags or "HOD" in tags:
            for c in db.query(Claim).filter(Claim.current_workflow_stage == "course_coordinator").all():
                results[c.id] = c

        return [_to_claim_out(c) for c in results.values()]

    # Students (and club accounts, once modeled) see their own submitted claims
    return [_to_claim_out(c) for c in claim_repo.get_by_submitter(db, user_id=current_user.id)]


@router.get("/{claim_id}", response_model=ClaimOut)
def get_claim(claim_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.primary_role == "super_admin":
        return _to_claim_out(claim)
    if claim.submitted_by == current_user.id:
        return _to_claim_out(claim)
    if any(p.student_id == current_user.id for p in claim.participants):
        return _to_claim_out(claim)
    if current_user.primary_role == "faculty":
        tags = set(current_user.role_tags_list)
        permissions = get_resolved_permissions(current_user)
        is_reviewer = (
            ("Class Teacher" in tags and claim.submission_type == "individual")
            or ("Club Faculty Coordinator" in tags and claim.submission_type == "club")
            or ("Course Coordinator" in tags or "HOD" in tags)
            or (
                "claims:review_faculty" in permissions
                and any(
                    entry.subject_faculty_id == current_user.id
                    for participant in claim.participants
                    for entry in participant.entries
                )
            )
        )
        if is_reviewer:
            return _to_claim_out(claim)

    raise HTTPException(status_code=403, detail="You do not have access to this claim")


# 4. Review Claim Approval Actions — per-stage authorization + real per-reviewer
#    scoping at the parallel "subject_faculty" stage (a subject faculty may only
#    act on entries actually assigned to them, and the claim only advances past
#    this stage once every participant's entries are no longer pending).
@router.post("/{claim_id}/approve-stage")
def approve_claim_stage(
    claim_id: str,
    action: str,  # approve, reject, revise
    feedback: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if action not in ("approve", "reject", "revise"):
        raise HTTPException(status_code=400, detail="Invalid action")

    stage = claim.current_workflow_stage
    tags = set(current_user.role_tags_list)
    permissions = get_resolved_permissions(current_user)
    is_super_admin = current_user.primary_role == "super_admin"

    def deny(detail: str):
        raise HTTPException(status_code=403, detail=detail)

    if stage == "initial_review":
        allowed = is_super_admin or (
            claim.submission_type == "individual" and "claims:review_class_teacher" in permissions
        ) or (
            claim.submission_type == "club" and "claims:review_faculty_coordinator" in permissions
        )
        if not allowed:
            deny("Only the assigned Class Teacher or Club Faculty Coordinator may act at this stage")

        if action == "approve":
            claim.current_workflow_stage = "subject_faculty"
            claim.status = "under_review"
        else:
            claim.status = "returned" if action == "revise" else "rejected"
            claim.current_workflow_stage = "closed"

    elif stage == "subject_faculty":
        if not (is_super_admin or "claims:review_faculty" in permissions):
            deny("Only Subject Faculty may act at this stage")

        my_pending_entries = [
            entry
            for participant in claim.participants
            for entry in participant.entries
            if entry.subject_faculty_id == current_user.id and entry.status == "pending"
        ]
        if not is_super_admin and not my_pending_entries:
            deny("You have no pending attendance entries on this claim")

        if action == "approve":
            for entry in my_pending_entries:
                entry.status = "approved"
                db.add(entry)
            db.flush()
            all_entries = [e for p in claim.participants for e in p.entries]
            if all(e.status != "pending" for e in all_entries):
                claim.current_workflow_stage = "course_coordinator"
        else:
            for entry in my_pending_entries:
                entry.status = "rejected"
                entry.feedback = feedback
                db.add(entry)
            claim.status = "returned" if action == "revise" else "rejected"
            claim.current_workflow_stage = "closed"

    elif stage == "course_coordinator":
        if not (is_super_admin or "claims:approve_coordinator" in permissions):
            deny("Only the Course Coordinator / HOD may act at this stage")

        if action == "approve":
            claim.current_workflow_stage = "attendance_office"
            claim.status = "approved"
        else:
            claim.status = "returned" if action == "revise" else "rejected"
            claim.current_workflow_stage = "closed"

    elif stage == "attendance_office":
        if not (is_super_admin or "claims:approve_coordinator" in permissions):
            deny("Only the Course Coordinator / HOD may close this claim")
        claim.current_workflow_stage = "closed"
        claim.status = "closed"

    else:
        deny("This claim is already closed")

    db.add(claim)
    db.commit()
    return {"status": "success", "new_stage": claim.current_workflow_stage, "claim_status": claim.status}
