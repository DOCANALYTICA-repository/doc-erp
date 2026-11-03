import type { YellowFormWorkflow, YellowFormWorkflowPart } from '../../api/types';

export type YellowFormKind = 'pre_approval' | 'claim_sheet';

export type StepState = 'done' | 'current' | 'upcoming' | 'returned' | 'rejected' | 'expired';

export interface WorkflowStep {
  id: string;
  label: string;
  isReview: boolean;
  state: StepState;
}

/** The only stage a claim sheet can be sent back or rejected from. */
export const CLAIM_SHEET_REVIEW_STAGE = 'claims_coordinator_review';

export function workflowPart(workflow: YellowFormWorkflow, kind: YellowFormKind): YellowFormWorkflowPart {
  return kind === 'pre_approval' ? workflow.pre_approval : workflow.claim_sheet;
}

/** `?open=<id>` deep links carry either kind; the id prefix says which. */
export function yellowFormKindOf(id: string | null | undefined): YellowFormKind | null {
  if (!id) return null;
  if (id.startsWith('paf_')) return 'pre_approval';
  if (id.startsWith('ccs_')) return 'claim_sheet';
  return null;
}

export function statusLabelFor(part: YellowFormWorkflowPart | undefined, status: string | null | undefined): string {
  if (!status) return '';
  return part?.status_labels[status] ?? status.replace(/_/g, ' ');
}

export function stageLabelFor(part: YellowFormWorkflowPart | undefined, stageId: string | null | undefined): string {
  if (!stageId) return '';
  return part?.stages.find(stage => stage.id === stageId)?.label ?? stageId.replace(/_/g, ' ');
}

/**
 * Where a document sits on its happy path.
 *
 * Returned and rejected documents are marked at the stage that sent them back
 * (`lastReviewedStage`, or the first review stage if unknown), with the earlier
 * steps done. An expired pre-approval marks its active step as expired: nothing
 * can move it forward any more.
 */
export function computeSteps(
  part: YellowFormWorkflowPart,
  status: string,
  options: { lastReviewedStage?: string | null; isExpired?: boolean } = {},
): WorkflowStep[] {
  const stages = part.stages.length > 0
    ? part.stages
    : part.stage_order.map(id => ({ id, label: part.status_labels[id] ?? id, is_review: false }));
  const lastIndex = stages.length - 1;

  let activeIndex: number;
  let activeState: StepState;
  if (status === 'returned' || status === 'rejected') {
    const reviewedAt = stages.findIndex(stage => stage.id === options.lastReviewedStage);
    const firstReview = stages.findIndex(stage => stage.is_review);
    activeIndex = reviewedAt !== -1 ? reviewedAt : firstReview !== -1 ? firstReview : 0;
    activeState = status;
  } else {
    activeIndex = stages.findIndex(stage => stage.id === status);
    activeState = 'current';
  }
  if (options.isExpired && activeIndex !== -1) activeState = 'expired';

  const isComplete = activeIndex === lastIndex && activeState === 'current';

  return stages.map((stage, index) => {
    let state: StepState = 'upcoming';
    if (activeIndex !== -1 && (isComplete || index < activeIndex)) state = 'done';
    else if (index === activeIndex) state = activeState;
    return { id: stage.id, label: stage.label, isReview: stage.is_review, state };
  });
}
