from typing import List
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.club import ClubMember, ClubHierarchyLevel
from app.repositories.club import hierarchy_repo, member_repo
from app.services.engines.notification import notification_engine

DEFAULT_LEVELS = [(10, "President"), (20, "Vice President"), (30, "Core Member"), (40, "Member")]


class ClubHierarchyEngine:
    """Consolidates every place that used to hardcode a `.role == "President"`
    string comparison into rank (level_order) comparisons against a club's
    own configurable hierarchy. A member with no hierarchy_level_id assigned
    is treated as bottom-rank everywhere (most restrictive default)."""

    def ensure_default_hierarchy(self, db: Session, club_id: str) -> List[ClubHierarchyLevel]:
        """Materialize a club's default hierarchy the first time it is read.

        The primary keys are deterministic (chl_<club_id>_<order>), so two
        concurrent readers used to race straight into an IntegrityError — and
        this ran from GET /clubs/{id} as well as GET /clubs/{id}/hierarchy, so
        simply opening a club workspace was enough to trigger it. It is now
        called from one place, and it loses the race gracefully rather than
        500ing the reader that arrived second.
        """
        existing = hierarchy_repo.get_by_club(db, club_id=club_id)
        if existing:
            return existing

        for level_order, title in DEFAULT_LEVELS:
            db.add(ClubHierarchyLevel(
                id=f"chl_{club_id}_{level_order}", club_id=club_id, level_order=level_order, title=title,
            ))
        try:
            db.commit()
        except IntegrityError:
            # Another request created them between our read and our write.
            # Its rows are just as good as ours would have been.
            db.rollback()

        return hierarchy_repo.get_by_club(db, club_id=club_id)

    def get_level_order_for_member(self, db: Session, member: ClubMember) -> int:
        if member.hierarchy_level and member.hierarchy_level.level_order is not None:
            return member.hierarchy_level.level_order
        bottom = hierarchy_repo.get_bottom_level_order(db, club_id=member.club_id)
        return bottom if bottom is not None else 0

    def is_top_level(self, db: Session, member: ClubMember) -> bool:
        top = hierarchy_repo.get_top_level_order(db, club_id=member.club_id)
        if top is None:
            return False
        return self.get_level_order_for_member(db, member) == top

    def is_bottom_level(self, db: Session, member: ClubMember) -> bool:
        bottom = hierarchy_repo.get_bottom_level_order(db, club_id=member.club_id)
        if bottom is None:
            return True
        return self.get_level_order_for_member(db, member) == bottom

    def notify_club_leadership(self, db: Session, *, club_id: str, title: str, content: str, top_n_ranks: int = 2) -> None:
        levels = hierarchy_repo.get_by_club(db, club_id=club_id)
        top_ranks = sorted({l.level_order for l in levels})[:top_n_ranks]
        for m in member_repo.get_club_members(db, club_id=club_id):
            if m.status != "active":
                continue
            if self.get_level_order_for_member(db, m) in top_ranks:
                notification_engine.send_notification(
                    db, user_id=m.student_id, title=title, content=content, source_module="clubs"
                )


club_hierarchy_engine = ClubHierarchyEngine()
