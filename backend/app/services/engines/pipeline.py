"""Aggregate the two workflows into something a department can manage.

The claim state machine and the annual-plan state machine both worked, and
neither was visible in aggregate: you could ask how ONE claim was doing, and
nothing could tell you that six of them had been sitting at subject-faculty
review for a fortnight.

SLA days are per STAGE, not per item, because that is where work actually
stalls — and the stage that stalls is the one with many possible reviewers and
therefore no single person who feels responsible.
"""
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session, selectinload

from app.core import claim_workflow
from app.core.rbac import get_resolved_permissions
from app.models.claim import Claim
from app.models.club import AnnualPlan, Club
from app.models.user import User
from app.schemas.pipeline import Pipeline, PipelineItem, PipelineStage

#: How long an item may sit at a stage before it is an escalation.
#: The subject-faculty stage gets longer because it is genuinely parallel —
#: it waits on several people independently.
CLAIM_STAGE_SLA_DAYS = {
    "initial_review": 3,
    "subject_faculty": 5,
    "course_coordinator": 3,
    "attendance_office": 2,
}

PLAN_STAGE_SLA_DAYS = {
    "faculty_coordinator_review": 7,
    "cultural_coordinator_review": 7,
    "hod_review": 7,
}

#: Who each stage waits on, when no single person can be named.
CLAIM_STAGE_WAITING_ON = {
    "initial_review": "Class Teacher / Club Faculty Coordinator",
    "subject_faculty": "Subject faculty",
    "course_coordinator": "Course Coordinator / HOD",
    "attendance_office": "Attendance office",
}

PLAN_STAGE_WAITING_ON = {
    "faculty_coordinator_review": "Club Faculty Coordinator",
    "cultural_coordinator_review": "Cultural Coordinator",
    "hod_review": "HOD",
}

PLAN_STAGE_LABELS = {
    "faculty_coordinator_review": "Faculty Coordinator review",
    "cultural_coordinator_review": "Cultural Coordinator review",
    "hod_review": "HOD review",
}


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _days_since(value: Optional[date], today: date) -> int:
    if value is None:
        return 0
    return max(0, (today - value).days)


class PipelineEngine:
    def build(self, db: Session, viewer: User) -> Pipeline:
        today = datetime.now(timezone.utc).date()
        stages: List[PipelineStage] = []

        stages.extend(self._claim_stages(db, today))
        stages.extend(self._plan_stages(db, today))

        all_items = [item for stage in stages for item in stage.items]
        escalations = sorted(
            (i for i in all_items if i.is_breaching_sla),
            key=lambda i: i.days_waiting,
            reverse=True,
        )

        return Pipeline(
            stages=stages,
            total=len(all_items),
            total_breaching=len(escalations),
            escalations=escalations,
        )

    # ---- claims -----------------------------------------------------------

    def _claim_stages(self, db: Session, today: date) -> List[PipelineStage]:
        claims = (
            db.query(Claim)
            # submitter.name is read for every row; without this the pipeline
            # is one extra SELECT per claim.
            .options(selectinload(Claim.submitter))
            .filter(Claim.current_workflow_stage.in_(list(CLAIM_STAGE_SLA_DAYS)))
            .all()
        )

        by_stage: dict = {stage: [] for stage in CLAIM_STAGE_SLA_DAYS}
        for claim in claims:
            stage = claim.current_workflow_stage
            spec = claim_workflow.STAGES.get(stage)
            sla = CLAIM_STAGE_SLA_DAYS[stage]

            # Time at THIS stage is not knowable without a stage-transition
            # log, so age since submission is the honest approximation — and
            # it is the number a student actually feels.
            days = _days_since(_parse_date(claim.submission_date), today)

            by_stage[stage].append(PipelineItem(
                id=claim.id,
                kind="claim",
                reference=claim.reference_number,
                title=f"{claim.category.replace('_', ' ').title()} claim — {claim.date_range}",
                stage=stage,
                stage_label=claim_workflow.label_for(spec, claim.submission_type) if spec else stage,
                waiting_on=CLAIM_STAGE_WAITING_ON.get(stage, "a reviewer"),
                days_waiting=days,
                is_breaching_sla=days > sla,
                sla_days=sla,
                href=f"/app/claims/review_queue?claim={claim.id}",
                owner=claim.submitter.name if claim.submitter else None,
            ))

        return [
            self._to_stage(
                stage_id,
                claim_workflow.STAGES[stage_id].label if stage_id in claim_workflow.STAGES else stage_id,
                items,
            )
            for stage_id, items in by_stage.items()
        ]

    # ---- annual plans -----------------------------------------------------

    def _plan_stages(self, db: Session, today: date) -> List[PipelineStage]:
        rows = (
            db.query(AnnualPlan, Club.name)
            .join(Club, Club.id == AnnualPlan.club_id)
            .filter(AnnualPlan.status.in_(list(PLAN_STAGE_SLA_DAYS)))
            .all()
        )

        by_stage: dict = {stage: [] for stage in PLAN_STAGE_SLA_DAYS}
        for plan, club_name in rows:
            stage = plan.status
            sla = PLAN_STAGE_SLA_DAYS[stage]
            # AnnualPlan carries no submission date, so updated_at is the best
            # available proxy for "when it landed at this stage".
            updated = plan.updated_at.date() if plan.updated_at else None
            days = _days_since(updated, today)

            by_stage[stage].append(PipelineItem(
                id=plan.id,
                kind="annual_plan",
                reference=plan.academic_year,
                title=f"{club_name} annual plan",
                stage=stage,
                stage_label=PLAN_STAGE_LABELS.get(stage, stage),
                waiting_on=PLAN_STAGE_WAITING_ON.get(stage, "a reviewer"),
                days_waiting=days,
                is_breaching_sla=days > sla,
                sla_days=sla,
                href=f"/app/clubs/annual-plan?club={plan.club_id}",
                owner=club_name,
            ))

        return [
            self._to_stage(stage_id, PLAN_STAGE_LABELS.get(stage_id, stage_id), items)
            for stage_id, items in by_stage.items()
        ]

    @staticmethod
    def _to_stage(stage_id: str, label: str, items: List[PipelineItem]) -> PipelineStage:
        ordered = sorted(items, key=lambda i: i.days_waiting, reverse=True)
        return PipelineStage(
            id=stage_id,
            label=label,
            count=len(ordered),
            breaching=sum(1 for i in ordered if i.is_breaching_sla),
            oldest_days=ordered[0].days_waiting if ordered else 0,
            items=ordered,
        )


pipeline_engine = PipelineEngine()
