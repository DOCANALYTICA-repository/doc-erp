from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user
from app.repositories.club import (
    club_repo, member_repo, event_repo, budget_repo, reimbursement_repo, sponsorship_repo,
    recruitment_drive_repo, recruitment_application_repo, announcement_repo,
)
from app.schemas.club import (
    ClubOut, ClubMemberOut, EventOut, EventCreate, BudgetOut, ReimbursementOut, ReimbursementCreate,
    SponsorshipOut, SponsorshipCreate,
    RecruitmentDriveOut, RecruitmentDriveCreate, RecruitmentApplicationOut, RecruitmentApplicationCreate,
    RecruitmentApplicationUpdate, AnnouncementOut, AnnouncementCreate,
)
from app.models.user import User
from app.services.engines.reporting import reporting_engine
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
