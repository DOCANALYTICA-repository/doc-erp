"""The shape of "where is everything stuck".

Two invisible state machines — the claim workflow and the annual-plan workflow
— ran with nobody able to see them in aggregate. A department head could tell
you how one claim was doing only by opening it.
"""
from typing import List, Optional

from pydantic import BaseModel


class PipelineItem(BaseModel):
    """One thing sitting at one stage."""
    id: str
    kind: str  # claim | annual_plan | pre_approval | claim_sheet
    reference: str
    title: str

    stage: str
    stage_label: str

    #: Who the item is waiting on. Named where a specific person is known,
    #: described by role where the stage has many possible reviewers.
    waiting_on: str

    days_waiting: int
    #: Past the SLA for this stage. The reason this view exists.
    is_breaching_sla: bool
    sla_days: int

    href: str
    owner: Optional[str] = None


class PipelineStage(BaseModel):
    id: str
    label: str
    count: int
    breaching: int
    #: Slowest item at this stage, in days. A stage with a healthy median and
    #: one item stuck for three weeks looks fine on an average.
    oldest_days: int = 0
    items: List[PipelineItem] = []


class Pipeline(BaseModel):
    stages: List[PipelineStage] = []
    total: int = 0
    total_breaching: int = 0
    #: Everything past its SLA, across every stage, oldest first — the
    #: escalation list.
    escalations: List[PipelineItem] = []
