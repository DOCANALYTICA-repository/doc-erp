from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user, get_resolved_permissions
from app.repositories.club import (
    club_repo, member_repo, event_repo, budget_repo, reimbursement_repo, sponsorship_repo,
    recruitment_drive_repo, recruitment_application_repo, announcement_repo,
    annual_plan_repo, club_document_repo, event_attendance_repo,
)
from app.schemas.club import (
    ClubOut, ClubMemberOut, EventOut, EventCreate, BudgetOut, ReimbursementOut, ReimbursementCreate,
    SponsorshipOut, SponsorshipCreate,
    RecruitmentDriveOut, RecruitmentDriveCreate, RecruitmentApplicationOut, RecruitmentApplicationCreate,
    RecruitmentApplicationUpdate, AnnouncementOut, AnnouncementCreate,
    AnnualPlanOut, AnnualPlanCreate, AnnualPlanUpdate, AnnualPlanReviewAction,
    ClubDocumentOut, PermissionTemplateAssign,
)
from app.models.user import User
from app.models.club import EventAttendance
from app.services.engines.reporting import reporting_engine
from app.services.engines.storage import storage_engine
from app.services.engines.notification import notification_engine
import uuid

router = APIRouter()


def _require_active_club_member(db: Session, current_user: User, club_id: str) -> None:
    """
    Every write scoped to a specific club must verify the caller actually
    belongs to THAT club — holding a generic permission string (e.g.
    "events:create" from being President of a different club) is not
    enough. super_admin bypasses this, matching every other endpoint.
    """
    if current_user.primary_role == "super_admin":
        return
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if not membership or membership.status != "active":
        raise HTTPException(status_code=403, detail="You are not an active member of this club")


def _require_club_head_or_admin(db: Session, current_user: User, club_id: str) -> None:
    """
    Permission Template assignment (Clubs PRD §17: "Club Head... including
    permission assignment, subject to faculty oversight") — allowed for the
    club's President/Club Head, any faculty coordinator with plan-approval
    authority, or super_admin.
    """
    if current_user.primary_role == "super_admin":
        return
    if current_user.primary_role == "faculty":
        perms = get_resolved_permissions(current_user)
        if "clubs:approve_plan" in perms:
            return
        raise HTTPException(status_code=403, detail="Not enough permissions")
    membership = member_repo.get_by_student_and_club(db, student_id=current_user.id, club_id=club_id)
    if not membership or membership.status != "active":
        raise HTTPException(status_code=403, detail="You are not an active member of this club")
    if membership.role != "President" and membership.permission_template != "Club Head":
        raise HTTPException(status_code=403, detail="Only the Club Head may assign permission templates")


# Annual Plan approval workflow (Clubs PRD §24.3)
ANNUAL_PLAN_STAGE_PERMISSIONS = {
    "faculty_coordinator_review": "clubs:approve_plan_faculty_coordinator",
    "cultural_coordinator_review": "clubs:approve_plan_cultural_coordinator",
    "hod_review": "clubs:approve_plan_hod",
}
ANNUAL_PLAN_NEXT_STAGE = {
    "faculty_coordinator_review": "cultural_coordinator_review",
    "cultural_coordinator_review": "hod_review",
    "hod_review": "approved",
}


# 1. Club Profiles
@router.get("/", response_model=List[ClubOut])
def get_clubs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return club_repo.get_multi(db)

@router.get("/my-memberships", response_model=List[ClubOut])
def get_my_club_memberships(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Powers the frontend club selector (Phase 4) — replaces the previous
    hardcoding to a single club_commerce with no way to switch. super_admin
    sees every club (platform oversight); everyone else sees only clubs
    they actually belong to, supporting the PRD's multi-club-membership
    requirement.
    """
    if current_user.primary_role == "super_admin":
        return club_repo.get_multi(db)
    memberships = member_repo.get_student_memberships(db, student_id=current_user.id)
    club_ids = {m.club_id for m in memberships if m.status == "active"}
    return [c for c in club_repo.get_multi(db) if c.id in club_ids]

@router.get("/{club_id}", response_model=ClubOut)
def get_club(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    club = club_repo.get(db, club_id)
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    return club

# 2. Members
@router.get("/{club_id}/members", response_model=List[ClubMemberOut])
def get_club_members(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return member_repo.get_club_members(db, club_id=club_id)

# 3. Events
@router.get("/{club_id}/events", response_model=List[EventOut])
def get_club_events(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(event_repo.model).filter(event_repo.model.club_id == club_id).all()

@router.post("/{club_id}/events", response_model=EventOut)
def create_club_event(
    club_id: str,
    event_in: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["events:create"]))
):
    _require_active_club_member(db, current_user, club_id)
    event_dict = event_in.dict()
    event_dict["id"] = f"evt_{uuid.uuid4().hex[:12]}"
    event_dict["club_id"] = club_id
    return event_repo.create(db, obj_in=event_dict)

# 4. Budget
@router.get("/{club_id}/budgets", response_model=List[BudgetOut])
def get_club_budgets(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(budget_repo.model).filter(budget_repo.model.club_id == club_id).all()

# 5. Reimbursement
@router.get("/{club_id}/reimbursements", response_model=List[ReimbursementOut])
def get_club_reimbursements(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return reimbursement_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/reimbursements", response_model=ReimbursementOut)
def request_reimbursement(
    club_id: str,
    reimb_in: ReimbursementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["reimbursement:request"]))
):
    _require_active_club_member(db, current_user, club_id)
    reimb_dict = reimb_in.dict()
    reimb_dict["id"] = f"reimb_{uuid.uuid4().hex[:12]}"
    reimb_dict["club_id"] = club_id
    reimb_dict["requested_by"] = current_user.id
    reimb_dict["status"] = "pending"
    return reimbursement_repo.create(db, obj_in=reimb_dict)

# 6. Sponsorship
@router.get("/{club_id}/sponsorships", response_model=List[SponsorshipOut])
def get_club_sponsorships(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return sponsorship_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/sponsorships", response_model=SponsorshipOut)
def create_sponsorship(
    club_id: str,
    spons_in: SponsorshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["sponsorship:manage"]))
):
    _require_active_club_member(db, current_user, club_id)
    spons_dict = spons_in.dict()
    spons_dict["id"] = f"spons_{uuid.uuid4().hex[:12]}"
    spons_dict["club_id"] = club_id
    return sponsorship_repo.create(db, obj_in=spons_dict)

# 7. Reports Engine — club performance report (one of the 7 v1 report types
# named in the Clubs PRD; the other 6 are new Phase 4 build-out, not just
# wiring, since the engine only implements this one today).
@router.get("/{club_id}/reports/performance")
def get_club_performance_report(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_club_performance_report(db, club_id=club_id)

# 8. Recruitment (Phase 4 — new; PRD: "replaces Google Forms" for recruitment)
@router.get("/{club_id}/recruitment-drives", response_model=List[RecruitmentDriveOut])
def get_recruitment_drives(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return recruitment_drive_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/recruitment-drives", response_model=RecruitmentDriveOut)
def create_recruitment_drive(
    club_id: str, drive_in: RecruitmentDriveCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _require_active_club_member(db, current_user, club_id)
    drive_dict = drive_in.dict()
    drive_dict["id"] = f"drive_{uuid.uuid4().hex[:12]}"
    drive_dict["club_id"] = club_id
    return recruitment_drive_repo.create(db, obj_in=drive_dict)

@router.post("/recruitment-drives/{drive_id}/apply", response_model=RecruitmentApplicationOut)
def apply_to_recruitment_drive(
    drive_id: str, app_in: RecruitmentApplicationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    drive = recruitment_drive_repo.get(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Recruitment drive not found")
    if drive.status != "open":
        raise HTTPException(status_code=400, detail="This recruitment drive is not currently accepting applications")
    app_dict = app_in.dict()
    app_dict["id"] = f"rapp_{uuid.uuid4().hex[:12]}"
    app_dict["drive_id"] = drive_id
    app_dict["applicant_id"] = current_user.id
    app_dict["status"] = "applied"
    return recruitment_application_repo.create(db, obj_in=app_dict)

@router.get("/recruitment-drives/{drive_id}/applications", response_model=List[RecruitmentApplicationOut])
def list_recruitment_applications(
    drive_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    drive = recruitment_drive_repo.get(db, drive_id)
    if not drive:
        raise HTTPException(status_code=404, detail="Recruitment drive not found")
    _require_active_club_member(db, current_user, drive.club_id)
    return recruitment_application_repo.get_by_drive(db, drive_id=drive_id)

@router.put("/recruitment-applications/{application_id}", response_model=RecruitmentApplicationOut)
def update_recruitment_application_status(
    application_id: str, update_in: RecruitmentApplicationUpdate, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    application = recruitment_application_repo.get(db, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    drive = recruitment_drive_repo.get(db, application.drive_id)
    _require_active_club_member(db, current_user, drive.club_id)
    return recruitment_application_repo.update(db, db_obj=application, obj_in=update_in.dict())

# 9. Announcements (Phase 4 — new)
@router.get("/{club_id}/announcements", response_model=List[AnnouncementOut])
def get_club_announcements(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return announcement_repo.get_by_club(db, club_id=club_id)

@router.post("/{club_id}/announcements", response_model=AnnouncementOut)
def create_club_announcement(
    club_id: str, ann_in: AnnouncementCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _require_active_club_member(db, current_user, club_id)
    ann_dict = ann_in.dict()
    ann_dict["id"] = f"ann_{uuid.uuid4().hex[:12]}"
    ann_dict["club_id"] = club_id
    ann_dict["author_id"] = current_user.id
    return announcement_repo.create(db, obj_in=ann_dict)


# 10. Annual Planning Workspace (Clubs PRD §24) — new in Phase 4 remainder
@router.get("/{club_id}/annual-plans", response_model=List[AnnualPlanOut])
def list_annual_plans(club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_active_club_member(db, current_user, club_id)
    return annual_plan_repo.get_by_club(db, club_id=club_id)


@router.post("/{club_id}/annual-plans", response_model=AnnualPlanOut)
def create_annual_plan(
    club_id: str,
    plan_in: AnnualPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["annual_plan:manage"])),
):
    _require_active_club_member(db, current_user, club_id)
    existing = annual_plan_repo.get_current(db, club_id=club_id, academic_year=plan_in.academic_year)
    if existing:
        raise HTTPException(status_code=400, detail="An annual plan already exists for this academic year")
    plan_dict = plan_in.dict()
    plan_dict["id"] = f"aplan_{uuid.uuid4().hex[:12]}"
    plan_dict["club_id"] = club_id
    plan_dict["submitted_by"] = current_user.id
    plan_dict["status"] = "draft"
    return annual_plan_repo.create(db, obj_in=plan_dict)


@router.put("/annual-plans/{plan_id}", response_model=AnnualPlanOut)
def update_annual_plan(
    plan_id: str,
    plan_in: AnnualPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["annual_plan:manage"])),
):
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    if plan.status != "draft":
        raise HTTPException(status_code=400, detail="Only a Draft annual plan may be edited")
    _require_active_club_member(db, current_user, plan.club_id)
    return annual_plan_repo.update(db, db_obj=plan, obj_in=plan_in.model_dump(exclude_unset=True))


def _notify_club_leadership(db: Session, *, club_id: str, title: str, content: str) -> None:
    for m in member_repo.get_club_members(db, club_id=club_id):
        if m.status == "active" and m.role in ("President", "Vice President"):
            notification_engine.send_notification(
                db, user_id=m.student_id, title=title, content=content, source_module="clubs"
            )


@router.post("/annual-plans/{plan_id}/submit", response_model=AnnualPlanOut)
def submit_annual_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["annual_plan:manage"])),
):
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    if plan.status != "draft":
        raise HTTPException(status_code=400, detail="Only a Draft annual plan may be submitted for review")
    _require_active_club_member(db, current_user, plan.club_id)
    updated = annual_plan_repo.update(db, db_obj=plan, obj_in={
        "status": "faculty_coordinator_review", "review_comments": None,
    })
    _notify_club_leadership(
        db, club_id=plan.club_id, title="Annual Plan submitted for review",
        content="The annual plan has moved to Faculty Coordinator review.",
    )
    return updated


@router.post("/annual-plans/{plan_id}/review", response_model=AnnualPlanOut)
def review_annual_plan(
    plan_id: str,
    review_in: AnnualPlanReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Advances or rejects an Annual Plan at whichever review stage it's
    currently sitting in. Which permission is required depends on the
    CURRENT stage (Draft -> Faculty Coordinator -> Cultural Coordinator ->
    HOD -> Approved), matching Clubs PRD §24.3 exactly rather than gating
    every stage behind one shared "approver" permission.
    """
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    required_permission = ANNUAL_PLAN_STAGE_PERMISSIONS.get(plan.status)
    if not required_permission:
        raise HTTPException(status_code=400, detail=f"Annual plan in status '{plan.status}' is not awaiting review")

    perms = get_resolved_permissions(current_user)
    if "*" not in perms and required_permission not in perms:
        raise HTTPException(status_code=403, detail=f"Not enough permissions. Missing: {required_permission}")

    if review_in.action == "reject":
        updated = annual_plan_repo.update(db, db_obj=plan, obj_in={
            "status": "draft", "review_comments": review_in.comments,
        })
        _notify_club_leadership(
            db, club_id=plan.club_id, title="Annual Plan returned to Draft",
            content=review_in.comments or "The annual plan was returned for revisions.",
        )
        return updated

    if review_in.action != "approve":
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    next_stage = ANNUAL_PLAN_NEXT_STAGE[plan.status]
    updated = annual_plan_repo.update(db, db_obj=plan, obj_in={
        "status": next_stage, "review_comments": review_in.comments,
    })
    _notify_club_leadership(
        db, club_id=plan.club_id, title=f"Annual Plan advanced to {next_stage.replace('_', ' ').title()}",
        content=review_in.comments or "The annual plan moved to the next review stage.",
    )
    return updated


@router.post("/annual-plans/{plan_id}/lock", response_model=AnnualPlanOut)
def lock_annual_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["clubs:approve_plan_hod"])),
):
    plan = annual_plan_repo.get(db, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Annual plan not found")
    if plan.status != "approved":
        raise HTTPException(status_code=400, detail="Only an Approved annual plan may be locked")
    return annual_plan_repo.update(db, db_obj=plan, obj_in={"status": "locked"})


# 11. Documents Workspace + tag-filtered Knowledge Base (Clubs PRD §28-29) — new
@router.get("/{club_id}/documents", response_model=List[ClubDocumentOut])
def list_club_documents(
    club_id: str, category: Optional[str] = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return club_document_repo.get_by_club(db, club_id=club_id, category=category)


@router.get("/{club_id}/knowledge-base", response_model=List[ClubDocumentOut])
def get_club_knowledge_base(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """
    Minimal Knowledge Base (Clubs PRD §29): a tag-filtered view over the
    same Documents Workspace records — any document tagged
    "knowledge-base" surfaces here, rather than a separate content store.
    """
    _require_active_club_member(db, current_user, club_id)
    return club_document_repo.get_knowledge_base(db, club_id=club_id)


@router.post("/{club_id}/documents", response_model=ClubDocumentOut)
def upload_club_document(
    club_id: str,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    category: str = Form("Templates"),
    tags: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["documents:manage_club"])),
):
    _require_active_club_member(db, current_user, club_id)
    stored_path = storage_engine.upload_file(file, folder=f"club_documents/{club_id}")
    doc_dict = {
        "id": f"cdoc_{uuid.uuid4().hex[:12]}",
        "club_id": club_id,
        "uploaded_by": current_user.id,
        "name": name or file.filename or "Untitled",
        "file_url": stored_path,
        "category": category,
        "tags": tags,
        "version": "1",
        "previous_version_id": None,
    }
    return club_document_repo.create(db, obj_in=doc_dict)


@router.post("/documents/{document_id}/new-version", response_model=ClubDocumentOut)
def upload_new_document_version(
    document_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["documents:manage_club"])),
):
    previous = club_document_repo.get(db, document_id)
    if not previous:
        raise HTTPException(status_code=404, detail="Document not found")
    _require_active_club_member(db, current_user, previous.club_id)
    stored_path = storage_engine.upload_file(file, folder=f"club_documents/{previous.club_id}")
    doc_dict = {
        "id": f"cdoc_{uuid.uuid4().hex[:12]}",
        "club_id": previous.club_id,
        "uploaded_by": current_user.id,
        "name": previous.name,
        "file_url": stored_path,
        "category": previous.category,
        "tags": previous.tags,
        "version": str(int(previous.version) + 1),
        "previous_version_id": previous.id,
    }
    return club_document_repo.create(db, obj_in=doc_dict)


@router.get("/documents/{document_id}/versions", response_model=List[ClubDocumentOut])
def get_document_versions(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    doc = club_document_repo.get(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _require_active_club_member(db, current_user, doc.club_id)
    return club_document_repo.get_versions(db, document_id=document_id)


@router.get("/documents/{document_id}/download-url")
def get_club_document_download_url(
    document_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    doc = club_document_repo.get(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    _require_active_club_member(db, current_user, doc.club_id)
    return {"url": storage_engine.get_signed_url(doc.file_url)}


# 12. Event Attendance — backs the Attendance Report (Clubs PRD §47.2)
@router.post("/{club_id}/events/{event_id}/attendance")
def mark_event_attendance(
    club_id: str,
    event_id: str,
    records: List[dict],  # [{"student_id": str, "attended": "present"|"absent"}]
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["events:create"])),
):
    _require_active_club_member(db, current_user, club_id)
    event = event_repo.get(db, event_id)
    if not event or event.club_id != club_id:
        raise HTTPException(status_code=404, detail="Event not found")
    created = []
    for r in records:
        att_dict = {
            "id": f"att_{uuid.uuid4().hex[:12]}",
            "event_id": event_id,
            "student_id": r["student_id"],
            "attended": r.get("attended", "present"),
        }
        created.append(event_attendance_repo.create(db, obj_in=att_dict))
    return {"marked": len(created)}


@router.get("/{club_id}/events/{event_id}/attendance")
def get_event_attendance(
    club_id: str, event_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return [
        {"student_id": r.student_id, "attended": r.attended}
        for r in event_attendance_repo.get_by_event(db, event_id=event_id)
    ]


# 13. Reports Engine — the remaining 6 of 7 v1 report types (Clubs PRD §47.2)
@router.get("/{club_id}/reports/monthly")
def get_monthly_club_report(
    club_id: str, month: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_monthly_club_report(db, club_id=club_id, month=month)


@router.get("/{club_id}/reports/annual")
def get_annual_club_report(
    club_id: str, academic_year: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_annual_club_report(db, club_id=club_id, academic_year=academic_year)


@router.get("/{club_id}/reports/budget-summary")
def get_budget_summary_report(
    club_id: str, academic_year: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_budget_summary_report(db, club_id=club_id, academic_year=academic_year)


@router.get("/{club_id}/reports/sponsorship-summary")
def get_sponsorship_summary_report(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_sponsorship_summary_report(db, club_id=club_id)


@router.get("/{club_id}/reports/attendance")
def get_club_attendance_report(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_attendance_report(db, club_id=club_id)


@router.get("/{club_id}/reports/contribution")
def get_contribution_report(
    club_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_contribution_report(db, club_id=club_id)


# 14. Analytics Workspace — 9 widgets in PRD §48.2 priority order
@router.get("/{club_id}/analytics")
def get_club_analytics(
    club_id: str, academic_year: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    _require_active_club_member(db, current_user, club_id)
    return reporting_engine.generate_club_analytics(db, club_id=club_id, academic_year=academic_year)


# 15. Club Settings — permission template assignment (Clubs PRD §17)
@router.put("/{club_id}/members/{member_id}/permission-template", response_model=ClubMemberOut)
def assign_permission_template(
    club_id: str,
    member_id: str,
    assignment: PermissionTemplateAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_club_head_or_admin(db, current_user, club_id)
    member = member_repo.get(db, member_id)
    if not member or member.club_id != club_id:
        raise HTTPException(status_code=404, detail="Club member not found")
    valid_templates = {
        "Club Head", "Documentation Head", "Events Head", "Sponsorship Head", "Finance Head", None,
    }
    if assignment.permission_template not in valid_templates:
        raise HTTPException(status_code=400, detail="Invalid permission template")
    updated = member_repo.update(db, db_obj=member, obj_in={"permission_template": assignment.permission_template})
    notification_engine.send_notification(
        db, user_id=member.student_id, title="Club permission template updated",
        content=f"You have been assigned the '{assignment.permission_template or 'Member'}' permission template.",
        source_module="clubs",
    )
    return updated
