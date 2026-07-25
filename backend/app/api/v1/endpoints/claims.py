from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user, get_resolved_permissions
from app.repositories.claim import claim_repo, claim_participant_repo, attendance_entry_repo, timetable_repo, doc_repo
from app.schemas.claim import (
    ClaimOut, ClaimCreate, TimetableSessionOut, TimetableSessionCreate,
    SupportingDocumentOut, DuplicateClaimWarning,
)
from app.models.user import User
from app.models.claim import Claim, ClaimParticipant, AttendanceEntry, SupportingDocument, TimetableSession
from app.services.engines.storage import storage_engine
from app.services.engines.ai import ai_engine
from app.services.engines.reporting import reporting_engine
from app.services.engines.notification import notification_engine
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


# 1a. Timetable administration (Class Teacher / HOD / super_admin) — this
# didn't exist at all before Phase 5; there was no way to populate or
# maintain the timetable data the entire claims workflow depends on beyond
# the one-time seed script.
@router.post("/timetable", response_model=TimetableSessionOut)
def create_timetable_session(
    session_in: TimetableSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    session_dict = session_in.dict()
    session_dict["id"] = f"tt_{uuid.uuid4().hex[:12]}"
    return timetable_repo.create(db, obj_in=session_dict)

@router.put("/timetable/{session_id}", response_model=TimetableSessionOut)
def update_timetable_session(
    session_id: str,
    session_in: TimetableSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    session = timetable_repo.get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Timetable session not found")
    return timetable_repo.update(db, db_obj=session, obj_in=session_in.dict())

@router.delete("/timetable/{session_id}")
def delete_timetable_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    session = timetable_repo.get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Timetable session not found")
    timetable_repo.remove(db, id=session_id)
    return {"status": "success"}

# 1b. Duplicate-claim check — SOFT WARNING ONLY, never blocks submission
# (per the Claims PRD: "recommend withdrawal of the previous claim but
# shall not block submission").
@router.get("/duplicate-check", response_model=DuplicateClaimWarning)
def check_duplicate_claim(
    date_range: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = claim_repo.get_by_submitter(db, user_id=current_user.id)
    match = next((c for c in existing if c.date_range == date_range and c.status != "rejected"), None)
    if match:
        return DuplicateClaimWarning(
            has_potential_duplicate=True,
            message=f"You already have a claim ({match.reference_number}) covering {date_range}. "
                    f"Consider withdrawing it before submitting a new one for the same dates.",
        )
    return DuplicateClaimWarning(has_potential_duplicate=False)


# 2. Submit Claim
@router.post("/", response_model=ClaimOut)
def submit_attendance_claim(
    claim_in: ClaimCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:submit"]))
):
    claim_id = f"cl_{uuid.uuid4().hex[:12]}"
    ref_num = f"ACP-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    # Late-submission flag: >7 calendar days after the LAST date covered by
    # the claim. Per the PRD this is informational only — late claims remain
    # fully eligible for review, never auto-rejected.
    late_flag = False
    try:
        last_date_str = claim_in.date_range.split("to")[-1].strip()
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
        late_flag = (datetime.now(timezone.utc).replace(tzinfo=None) - last_date).days > 7
    except (ValueError, IndexError):
        pass  # Unparseable date_range format — leave flag False rather than guess

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
        "late_submission_flag": late_flag,
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

    for s_id in student_ids:
        notification_engine.send_notification(
            db, user_id=s_id, title="Claim submitted",
            content=f"Your {claim_in.category} claim ({ref_num}) has been submitted for initial review.",
            source_module="claims",
        )

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

    participant_ids = {p.student_id for p in claim.participants}
    for s_id in participant_ids:
        notification_engine.send_notification(
            db, user_id=s_id, title=f"Claim {claim.reference_number} update",
            content=f"Your claim moved to stage '{claim.current_workflow_stage}' (status: {claim.status}).",
            source_module="claims",
        )
    # The stage that just approved forward to Subject Faculty review is the
    # one moment a SPECIFIC reviewer (not a role-wide permission holder) is
    # known — each attendance entry names its own subject_faculty_id.
    if stage == "initial_review" and claim.current_workflow_stage == "subject_faculty":
        faculty_ids = {
            entry.subject_faculty_id
            for participant in claim.participants
            for entry in participant.entries
            if entry.status == "pending"
        }
        for f_id in faculty_ids:
            notification_engine.send_notification(
                db, user_id=f_id, title="Claim pending your review",
                content=f"Claim {claim.reference_number} has attendance entries awaiting your approval.",
                source_module="claims",
            )

    return {"status": "success", "new_stage": claim.current_workflow_stage, "claim_status": claim.status}


# 5. Supporting Documents — real upload via the Storage Engine (Phase 1C/5).
# Previously the medical-certificate file input on the frontend wasn't wired
# to any handler at all; selecting a file silently did nothing.
@router.post("/{claim_id}/documents", response_model=SupportingDocumentOut)
def upload_supporting_document(
    claim_id: str,
    document_type: str = Form(...),  # medical_certificate, pre_approval_form
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.submitted_by != current_user.id and current_user.primary_role != "super_admin":
        raise HTTPException(status_code=403, detail="Only the claim's submitter may attach supporting documents")

    stored_path = storage_engine.upload_file(file, folder=f"claims/{claim_id}")
    doc = SupportingDocument(
        id=f"doc_{uuid.uuid4().hex[:12]}",
        claim_id=claim_id,
        document_type=document_type,
        file_url=stored_path,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{claim_id}/documents/{document_id}/download-url")
def get_supporting_document_url(
    claim_id: str, document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    doc = doc_repo.get(db, document_id)
    if not doc or doc.claim_id != claim_id:
        raise HTTPException(status_code=404, detail="Document not found")
    # Reuse the same access rule as viewing the claim itself.
    get_claim(claim_id, db, current_user)
    return {"url": storage_engine.get_signed_url(doc.file_url)}


# 6. AI Engine — faculty-facing reason summarization (bounded, advisory-only,
# in v1; the open-ended Student AI Assistant stays claims.student_ai_assistant
# / coming_soon, see backend/app/core/capabilities.py).
@router.get("/{claim_id}/ai-summary")
def get_claim_ai_summary(
    claim_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:review_faculty"])),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return {"summary": ai_engine.summarize_claim_reason(claim.reason or "")}


# 7. Reports Engine — attendance claims summary (one of the two v1 report
# types named in the Claims PRD; gated to faculty/admin, matching the PRD's
# framing that these are operational reports, not student-facing).
@router.get("/reports/attendance-summary")
def get_attendance_summary_report(
    academic_year: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["reports:view"])),
):
    return reporting_engine.generate_attendance_report(db, academic_year=academic_year)
