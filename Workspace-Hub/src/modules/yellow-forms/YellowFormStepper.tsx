import React from 'react';
import { ChevronRight } from 'lucide-react';
import { StatusDot } from '@astryxdesign/core/StatusDot';

import { useYellowFormWorkflow } from '../../api/hooks';
import type { ClaimSheet, PreApproval } from '../../api/types';
import {
  CLAIM_SHEET_REVIEW_STAGE,
  computeSteps,
  workflowPart,
  type StepState,
  type YellowFormKind,
} from './workflow';

const DOT_VARIANT: Record<StepState, 'success' | 'accent' | 'neutral' | 'warning' | 'error'> = {
  done: 'success',
  current: 'accent',
  upcoming: 'neutral',
  returned: 'warning',
  rejected: 'error',
  expired: 'error',
};

const STATE_TEXT: Record<StepState, string> = {
  done: 'Complete',
  current: 'In progress',
  upcoming: 'Not started',
  returned: 'Sent back',
  rejected: 'Rejected',
  expired: 'Expired',
};

export interface YellowFormStepperProps {
  kind: YellowFormKind;
  status: string;
  /** Where a returned or rejected document was decided. */
  lastReviewedStage?: string | null;
  isExpired?: boolean;
  className?: string;
}

/** The document's happy path, from GET /yellow-forms/workflow, with its position marked. */
export const YellowFormStepper: React.FC<YellowFormStepperProps> = ({
  kind,
  status,
  lastReviewedStage,
  isExpired = false,
  className = '',
}) => {
  const { data: workflow } = useYellowFormWorkflow();

  if (!workflow) {
    return <div className={`h-5 w-56 animate-pulse rounded-md bg-muted ${className}`} aria-hidden="true" />;
  }

  const steps = computeSteps(workflowPart(workflow, kind), status, { lastReviewedStage, isExpired });

  return (
    <ol
      aria-label={kind === 'pre_approval' ? 'Pre-approval progress' : 'Claim sheet progress'}
      className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${className}`}
    >
      {steps.map((step, index) => (
        <li key={step.id} className="flex items-center gap-2">
          {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-sand-400" aria-hidden="true" /> : null}
          <StatusDot
            variant={DOT_VARIANT[step.state]}
            label={STATE_TEXT[step.state]}
            isPulsing={step.state === 'current'}
          />
          <span
            className={`text-xs ${step.state === 'upcoming' ? 'text-secondary' : 'font-medium text-primary'}`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
};

export const PreApprovalStepper: React.FC<{
  form: Pick<PreApproval, 'status' | 'last_reviewed_stage' | 'is_expired'>;
  className?: string;
}> = ({ form, className }) => (
  <YellowFormStepper
    kind="pre_approval"
    status={form.status}
    lastReviewedStage={form.last_reviewed_stage}
    isExpired={form.is_expired}
    className={className}
  />
);

export const ClaimSheetStepper: React.FC<{
  sheet: Pick<ClaimSheet, 'status'>;
  className?: string;
}> = ({ sheet, className }) => (
  <YellowFormStepper
    kind="claim_sheet"
    status={sheet.status}
    lastReviewedStage={CLAIM_SHEET_REVIEW_STAGE}
    className={className}
  />
);
