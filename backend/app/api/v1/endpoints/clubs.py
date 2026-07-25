from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import PermissionChecker, get_current_user
from app.repositories.club import club_repo, member_repo, event_repo, budget_repo, reimbursement_repo, sponsorship_repo
from app.schemas.club import ClubOut, ClubMemberOut, EventOut, EventCreate, BudgetOut, ReimbursementOut, ReimbursementCreate, SponsorshipOut, SponsorshipCreate
from app.models.user import User
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
