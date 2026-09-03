from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user, get_resolved_permissions
from app.core import claim_workflow, faculty_scope
from app.repositories.claim import claim_repo, claim_participant_repo, attendance_entry_repo, timetable_repo, doc_repo
from app.schemas.claim import (
    ClaimOut, ClaimCreate, ClaimResubmit, TimetableSessionOut, TimetableSessionCreate,
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
def _require_timetable_scope(db: Session, current_user: User, programme, semester, section) -> None:
    """A Class Teacher may only maintain THEIR OWN class's timetable.

    claims:manage_timetable was permission-gated but not scope-gated, so any
    Class Teacher could rewrite or delete any other class's timetable — and the
    whole claims workflow is built on that data. HOD and super_admin stay
    department-wide by design.
    """
    if current_user.primary_role == "super_admin":
        return
    if "claims:manage_timetable_all" in get_resolved_permissions(current_user):
        return
    if faculty_scope.is_class_teacher_for(db, current_user.id, programme, semester, section):
        return
    raise HTTPException(
        status_code=403,
        detail="You are not the Class Teacher for this programme/semester/section",
    )


@router.post("/timetable", response_model=TimetableSessionOut)
def create_timetable_session(
    session_in: TimetableSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    _require_timetable_scope(db, current_user, session_in.programme, session_in.semester, session_in.section)
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
    # Scope BOTH the row being edited and the values being written, or a Class
    # Teacher could move another class's slot into their own scope, or their
    # own out of it.
    _require_timetable_scope(db, current_user, session.programme, session.semester, session.section)
    _require_timetable_scope(db, current_user, session_in.programme, session_in.semester, session_in.section)
    return timetable_repo.update(db, db_obj=session, obj_in=session_in.model_dump(exclude_unset=True))

@router.delete("/timetable/{session_id}")
def delete_timetable_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:manage_timetable"])),
):
    session = timetable_repo.get(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Timetable session not found")
    _require_timetable_scope(db, current_user, session.programme, session.semester, session.section)
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
@router.post("", response_model=ClaimOut)
def submit_attendance_claim(
    claim_in: ClaimCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["claims:submit"]))
):
    if claim_in.submission_type == "club" and not claim_in.club_id:
        raise HTTPException(status_code=400, detail="club_id is required when submission_type is 'club'")

    claim_id = f"cl_{uuid.uuid4().hex[:12]}"
    ref_num = f"ACP-{datetime.now().year}-{uuid.uuid4().hex[:6].upper()}"

    # Late-submission flag: more than CLAIM_SUBMISSION_SLA_DAYS calendar days
    # after the LAST date covered by the claim. Per the PRD this is
    # informational only — late claims remain fully eligible for review and
    # are never auto-rejected.
    late_flag = False
    try:
        last_date_str = claim_in.date_range.split("to")[-1].strip()
        last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
        late_flag = (
            datetime.now(timezone.utc).replace(tzinfo=None) - last_date
        ).days > settings.CLAIM_SUBMISSION_SLA_DAYS
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
        "club_id": claim_in.club_id,
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
            source_module="claims", entity_type="claim", entity_id=claim_id,
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
    pending AttendanceEntry rows AND the claim has actually reached the
    subject_faculty stage. AttendanceEntry rows are all created "pending"
    at submission time (before Class Teacher review even happens), so
    without the stage check a subject faculty member would see claims still
    awaiting Class Teacher approval in their Review Queue — confirmed bug."""
    entries = attendance_entry_repo.get_pending_by_faculty(db, faculty_id=faculty_id)
    seen = {}
    for entry in entries:
        claim = entry.participant.claim if entry.participant else None
        if claim and claim.current_workflow_stage == "subject_faculty" and claim.id not in seen:
            seen[claim.id] = claim
    return list(seen.values())


# 3. Retrieve Claims — scoped to what THIS user is actually allowed/expected to see
@router.get("", response_model=List[ClaimOut])
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
                if faculty_scope.is_class_teacher_for(db, current_user.id, c.programme, c.semester, c.section):
                    results[c.id] = c

        if "Club Faculty Coordinator" in tags:
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage == "initial_review",
                Claim.submission_type == "club",
            ).all():
                if faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, c.club_id):
                    results[c.id] = c

        if "claims:review_faculty" in permissions:
            for c in _claims_pending_for_subject_faculty(db, current_user.id):
                results[c.id] = c

        if "Course Coordinator" in tags or "HOD" in tags:
            # attendance_office belongs here too. Omitting it meant that the
            # moment a Course Coordinator approved a claim, it disappeared
            # from EVERY review queue permanently — there is no other route
            # that lists claims at that stage, so nothing could ever close.
            # get_claim already grants read access at this stage; only the
            # list query was missing it.
            for c in db.query(Claim).filter(
                Claim.current_workflow_stage.in_(["course_coordinator", "attendance_office"])
            ).all():
                if "HOD" in tags or faculty_scope.is_course_coordinator_for(db, current_user.id, c.programme):
                    results[c.id] = c

        return [_to_claim_out(c) for c in results.values()]

    # Students (and club accounts, once modeled) see their own submitted claims
    return [_to_claim_out(c) for c in claim_repo.get_by_submitter(db, user_id=current_user.id)]


@router.get("/workflow")
def get_claim_workflow():
    """The claim state machine, as data.

    ClaimStatusStepper.tsx kept its own hardcoded copy of the stage list and
    labels — which is how it came to hardcode 'approved' onto stage 3 as a
    workaround for a backend bug, permanently greying out the stage that
    actually needed attention. Serving the same table both sides read from
    removes the temptation.

    MUST stay above the /{claim_id} route below, or "workflow" is matched as
    a claim id and this endpoint never runs — the same trap that hid the
    reviewer inbox in clubs.py.
    """
    return claim_workflow.as_json()


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
            (
                "Class Teacher" in tags and claim.submission_type == "individual"
                and faculty_scope.is_class_teacher_for(db, current_user.id, claim.programme, claim.semester, claim.section)
            )
            or (
                "Club Faculty Coordinator" in tags and claim.submission_type == "club"
                and faculty_scope.is_club_faculty_coordinator_for(db, current_user.id, claim.club_id)
            )
            or ("HOD" in tags and claim.current_workflow_stage in ("course_coordinator", "attendance_office"))
            or (
                "Course Coordinator" in tags
                and claim.current_workflow_stage in ("course_coordinator", "attendance_office")
                and faculty_scope.is_course_coordinator_for(db, current_user.id, claim.programme)
            )
            or (
                "claims:review_faculty" in permissions
                and claim.current_workflow_stage == "subject_faculty"
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
    """Advance, return or reject a claim at whichever stage it is sitting in.

    This was a 130-line if/elif chain, and three separate defects in it were
    really one defect: a branch that forgot to honour `action` (a rejection
    recorded as a success), a branch that forgot super_admin (an admin unable
    to rescue a stuck claim), and a branch that forgot to record the revision.
    Each was patched individually.

    The stages now live in app/core/claim_workflow.STAGES, and this endpoint is
    the three steps that are true of every stage: look up the spec, authorize,
    apply. A new stage cannot forget any of them.
    """
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if action not in claim_workflow.ACTIONS:
        raise HTTPException(status_code=400, detail="Invalid action")
    if action == claim_workflow.REVISE and not (feedback and feedback.strip()):
        raise HTTPException(status_code=400, detail="A reason is required to revise a claim")

    stage = claim.current_workflow_stage
    spec = claim_workflow.STAGES.get(stage)
    if spec is None or spec.is_terminal:
        raise HTTPException(
            status_code=403,
            detail=spec.denial if spec else f"Unknown workflow stage '{stage}'",
        )

    # ---- 1. authorize -----------------------------------------------------
    if not claim_workflow.may_act(db, current_user, claim, spec):
        raise HTTPException(status_code=403, detail=spec.denial)

    is_super_admin = current_user.primary_role == "super_admin"

    def record_revision():
        """Always called on a non-approval, for every stage."""
        claim.revision_reason = feedback
        claim.last_revised_by = current_user.id
        claim.last_revised_stage = stage

    def send_back():
        claim.status = "returned" if action == claim_workflow.REVISE else "rejected"
        claim.current_workflow_stage = "closed"
        record_revision()

    # ---- 2. apply ---------------------------------------------------------
    if spec.is_parallel:
        # Many independent reviewers: each acts only on their OWN entries, and
        # the claim advances only once none are left pending.
        my_pending = [
            entry
            for participant in claim.participants
            for entry in participant.entries
            if entry.status == "pending"
            and (is_super_admin or entry.subject_faculty_id == current_user.id)
        ]
        if not my_pending:
            raise HTTPException(
                status_code=403,
                detail="You have no pending attendance entries on this claim",
            )

        if action == claim_workflow.APPROVE:
            for entry in my_pending:
                entry.status = "approved"
                db.add(entry)
            db.flush()
            all_entries = [e for p in claim.participants for e in p.entries]
            if all(e.status != "pending" for e in all_entries):
                claim.current_workflow_stage = spec.on_approve
        else:
            for entry in my_pending:
                entry.status = "rejected"
                entry.feedback = feedback
                db.add(entry)
            send_back()

    elif action == claim_workflow.APPROVE:
        claim.current_workflow_stage = spec.on_approve
        if spec.approve_status:
            claim.status = spec.approve_status

    else:
        send_back()

    db.add(claim)
    db.commit()

    participant_ids = {p.student_id for p in claim.participants}
    for s_id in participant_ids:
        notification_engine.send_notification(
            db, user_id=s_id, title=f"Claim {claim.reference_number} update",
            content=f"Your claim moved to stage '{claim.current_workflow_stage}' (status: {claim.status}).",
            source_module="claims", entity_type="claim", entity_id=claim.id,
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
                source_module="claims", entity_type="claim", entity_id=claim.id,
            )

    return {"status": "success", "new_stage": claim.current_workflow_stage, "claim_status": claim.status}


# 4b. Resubmit — edits a returned claim in place (per product decision: no
# new linked claim, same record, reviewers see continuity) and notifies the
# reviewer who returned it (plus whoever now holds initial_review scope,
# since the two may differ) with a plain-dict diff of what changed.
@router.put("/{claim_id}/resubmit", response_model=ClaimOut)
def resubmit_claim(
    claim_id: str,
    resubmit_in: ClaimResubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.submitted_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the claim's submitter may resubmit it")
    if claim.status != "returned":
        raise HTTPException(status_code=400, detail="Only a returned claim may be resubmitted")

    diff = {}

    if resubmit_in.date_range is not None and resubmit_in.date_range != claim.date_range:
        diff["date_range"] = {"old": claim.date_range, "new": resubmit_in.date_range}
        claim.date_range = resubmit_in.date_range

    if resubmit_in.reason is not None and resubmit_in.reason != claim.reason:
        diff["reason"] = {"old": claim.reason, "new": resubmit_in.reason}
        claim.reason = resubmit_in.reason

    if resubmit_in.missed_classes is not None:
        old_labels = [f"{e.subject} ({e.date} {e.hour})" for p in claim.participants for e in p.entries]
        for participant in claim.participants:
            for entry in list(participant.entries):
                db.delete(entry)
        db.flush()
        new_labels = []
        for participant in claim.participants:
            for mc in resubmit_in.missed_classes:
                entry_id = f"ae_{uuid.uuid4().hex[:12]}"
                db.add(AttendanceEntry(
                    id=entry_id,
                    claim_participant_id=participant.id,
                    subject=mc.subject,
                    date=mc.date,
                    hour=mc.hour,
                    subject_faculty_id=mc.subject_faculty_id,
                    status="pending",
                ))
                new_labels.append(f"{mc.subject} ({mc.date} {mc.hour})")
        if old_labels != new_labels:
            diff["missed_classes"] = {"old": old_labels, "new": new_labels}

    if resubmit_in.removed_document_ids:
        removed = []
        for doc_id in resubmit_in.removed_document_ids:
            doc = doc_repo.get(db, doc_id)
            if doc and doc.claim_id == claim_id:
                removed.append(doc.document_type)
                db.delete(doc)
        if removed:
            diff["documents_removed"] = removed

    reviewer_id = claim.last_revised_by
    reviewer_stage = claim.last_revised_stage

    # Reset EVERY participant and entry back to pending — the same state they
    # get at creation.
    #
    # This only happened when the student supplied new missed_classes (which
    # deletes and recreates the entries). Resubmitting a corrected *reason*
    # left the previously-rejected entries rejected, so the subject faculty's
    # pending list was empty and they got a permanent 403 at the very stage
    # the claim had just been sent back to. The claim could never leave
    # subject_faculty again.
    for participant in claim.participants:
        participant.status = "pending"
        db.add(participant)
        for entry in participant.entries:
            entry.status = "pending"
            entry.feedback = None
            db.add(entry)

    claim.status = "submitted"
    claim.current_workflow_stage = "initial_review"
    claim.revision_reason = None
    db.add(claim)
    db.commit()
    db.refresh(claim)

    diff_parts = []
    if "date_range" in diff:
        diff_parts.append(f"date range: '{diff['date_range']['old']}' -> '{diff['date_range']['new']}'")
    if "reason" in diff:
        diff_parts.append("reason updated")
    if "missed_classes" in diff:
        diff_parts.append("missed classes updated")
    if "documents_removed" in diff:
        diff_parts.append(f"{len(diff['documents_removed'])} document(s) removed")
    diff_summary = "; ".join(diff_parts) if diff_parts else "no fields changed"

    notify_ids = set()
    if reviewer_id:
        notify_ids.add(reviewer_id)

    if claim.submission_type == "individual":
        for candidate in db.query(User).filter(User.role_tags_str.like("%Class Teacher%")).all():
            if faculty_scope.is_class_teacher_for(db, candidate.id, claim.programme, claim.semester, claim.section):
                notify_ids.add(candidate.id)
    else:
        for candidate in db.query(User).filter(User.role_tags_str.like("%Club Faculty Coordinator%")).all():
            if faculty_scope.is_club_faculty_coordinator_for(db, candidate.id, claim.club_id):
                notify_ids.add(candidate.id)

    for uid in notify_ids:
        notification_engine.send_notification(
            db, user_id=uid, title=f"Claim {claim.reference_number} resubmitted",
            content=f"The claim was resubmitted after being sent back at the {reviewer_stage or 'review'} stage. Changes: {diff_summary}.",
            source_module="claims", entity_type="claim", entity_id=claim.id,
        )

    return _to_claim_out(claim)


# 4c. List Supporting Documents — every reviewer who can see the claim can
# see its documents (previously no reviewer role could see any document).
@router.get("/{claim_id}/documents", response_model=List[SupportingDocumentOut])
def list_claim_documents(claim_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_claim(claim_id, db, current_user)  # reuses the exact same visibility rule, raises 403/404 as needed
    return doc_repo.get_by_claim(db, claim_id=claim_id)


# 5. Supporting Documents — real upload via the Storage Engine (Phase 1C/5).
# Previously the medical-certificate file input on the frontend wasn't wired
# to any handler at all; selecting a file silently did nothing.
@router.post("/{claim_id}/documents", response_model=SupportingDocumentOut)
async def upload_supporting_document(
    claim_id: str,
    # Constrained, not free text. The comment here used to claim these were
    # the two accepted values while the signature accepted any string at all.
    document_type: Literal["medical_certificate", "pre_approval_form", "supporting_evidence"] = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    claim = claim_repo.get(db, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.submitted_by != current_user.id and current_user.primary_role != "super_admin":
        raise HTTPException(status_code=403, detail="Only the claim's submitter may attach supporting documents")

    stored_path = await storage_engine.upload_file(file, folder=f"claims/{claim_id}")
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
