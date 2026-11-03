import React from 'react';
import { Token } from '@astryxdesign/core/Token';
import {
  STATUS_HUES,
  toSemanticStatus,
  type StatusHue,
} from '../../../components/ui/status';
import { Popover } from '@astryxdesign/core/Popover';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { useClaimWorkflow } from '../../../api/hooks';
import type { ClaimWorkflowStage, PendingApproval } from '../../../api/types';
import { PendingApprovals } from './PendingApprovals';

type ClaimStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'closed' | 'rejected' | 'returned';
type WorkflowStage = 'initial_review' | 'subject_faculty' | 'course_coordinator' | 'attendance_office' | 'closed';

interface ClaimStatusStepperProps {
  status: ClaimStatus;
  currentStage: WorkflowStage;
  submissionType?: 'individual' | 'club';
  referenceNumber?: string;
  revisionReason?: string | null;
  /** Which stage sent it back. Recorded by the server; previously unused. */
  lastRevisedStage?: string | null;
  /** Whose signature the claim is still waiting on, from the server. */
  pendingApprovals?: PendingApproval[];
}

/**
 * Fallback stage list, used only until GET /claims/workflow resolves.
 *
 * The live list comes from the server — the same table
 * backend/app/core/claim_workflow.py enforces. This component used to own the
 * ONLY copy, which is how it came to hardcode 'approved' onto stage 3 and grey
 * out the rest: a workaround for an approved claim being invisible to every
 * review queue. The stepper was hiding a dead end rather than showing one.
 */
const FALLBACK_STAGES: ClaimWorkflowStage[] = [
  { id: 'initial_review', label: 'Class Teacher review', club_label: 'Club Faculty Coordinator review', is_terminal: false, is_parallel: false, next_on_approve: 'subject_faculty' },
  { id: 'subject_faculty', label: 'Subject faculty review', club_label: 'Subject faculty review', is_terminal: false, is_parallel: true, next_on_approve: 'course_coordinator' },
  { id: 'course_coordinator', label: 'Course Coordinator / HOD review', club_label: 'Course Coordinator / HOD review', is_terminal: false, is_parallel: false, next_on_approve: 'attendance_office' },
  { id: 'attendance_office', label: 'Forwarded to attendance office', club_label: 'Forwarded to attendance office', is_terminal: true, is_parallel: false, next_on_approve: null },
];

/**
 * Claim status → Astryx `Token` hue, DERIVED from the semantic map.
 *
 * This used to be a hand-written table beside `STATUS_CLASSES`, and the two
 * drifted: `submitted` was mapped to Astryx's `blue`, which rendered a literal
 * #0074e2 chip in the middle of the warm claims table. Routing through
 * `toSemanticStatus` means a new claim status picks up the right colour from
 * the one place statuses are classified, and there is no second table to keep
 * in step.
 *
 * This file is the only place a status is rendered without `StatusChip`,
 * because it needs a clickable `Token` inside a `Popover` to show WHERE in a
 * four-stage workflow a claim sits — which a chip cannot express.
 */
function hueFor(status: ClaimStatus): StatusHue {
  return STATUS_HUES[toSemanticStatus(status)];
}

const StatusLabel: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  closed: 'Closed',
  rejected: 'Rejected',
  returned: 'Returned',
};

function StepperBody({ status, currentStage, submissionType = 'individual', referenceNumber, revisionReason, lastRevisedStage, pendingApprovals = [] }: ClaimStatusStepperProps) {
  const { data: workflow } = useClaimWorkflow();
  const stages = workflow?.stages ?? FALLBACK_STAGES;

  const isTerminalNegative = status === 'rejected' || status === 'returned';
  const currentIndex = stages.findIndex(s => s.id === currentStage);
  // The last stage is terminal — the claim is approved and has been forwarded
  // out of the system, so nothing is still pending and no dot should pulse.
  const isComplete = status === 'closed' || stages[currentIndex]?.is_terminal === true;

  return (
    <div className="p-1 min-w-[260px]">
      {referenceNumber && <div className="text-xs font-bold text-primary mb-3">{referenceNumber}</div>}

      {isTerminalNegative ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusDot variant="success" label="Submitted" />
            <span className="text-xs text-primary">Submitted for review</span>
          </div>
          <div className={`p-3 rounded-lg text-xs ${status === 'rejected' ? 'bg-error-muted text-error' : 'bg-warning-muted text-warning'}`}>
            <div className="font-bold mb-1">{status === 'rejected' ? 'Rejected' : 'Returned for Revision'}</div>
            <p className="leading-relaxed">
              {revisionReason || 'No reason was provided.'}
            </p>
          </div>
          {/* last_revised_stage IS recorded now (claims.py record_revision),
              so name the stage rather than apologising for not knowing it. */}
          {lastRevisedStage ? (
            <p className="text-xs leading-relaxed text-secondary">
              Decided at the{' '}
              {stages.find(s => s.id === lastRevisedStage)?.label ?? lastRevisedStage} stage.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {stages.map((stage, idx) => {
            const label = submissionType === 'club' ? stage.club_label : stage.label;
            // Drive the marker from currentStage in every case.
            //
            // status === 'approved' used to hardcode the marker onto index 3
            // and grey out the rest, ignoring currentStage entirely. That was
            // the frontend author working around the fact that an approved
            // claim disappeared from every review queue and could never be
            // closed — the stepper was hiding a dead end rather than showing
            // one. The queue is fixed, so this can tell the truth now.
            let variant: 'success' | 'accent' | 'neutral' = 'neutral';
            if (isComplete) variant = 'success';
            else if (idx < currentIndex) variant = 'success';
            else if (idx === currentIndex) variant = 'accent';

            return (
              <li key={stage.id} className="flex items-center gap-2.5">
                <StatusDot variant={variant} label={label} isPulsing={variant === 'accent'} />
                <span className={`text-xs ${variant === 'neutral' ? 'text-secondary' : 'text-primary font-medium'}`}>
                  {label}
                </span>
              </li>
            );
          })}
          {/*
            * Named, under the stages they belong to. "Under review" reads the
            * same whether one signature is outstanding or four, and at the
            * subject-faculty stage that is the difference between nearly done
            * and nobody has looked at it.
            */}
          {pendingApprovals.length > 0 ? (
            <li className="border-t border-border pt-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                Waiting on
              </span>
              <PendingApprovals pending={pendingApprovals} />
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

export const ClaimStatusStepper: React.FC<ClaimStatusStepperProps> = (props) => {
  return (
    <Popover
      label="Claim status details"
      placement="below"
      content={<StepperBody {...props} />}
      className=""
      style={{}}
    >
      <Token
        label={StatusLabel[props.status]}
        color={hueFor(props.status)}
        onClick={() => {}}
      />
    </Popover>
  );
};
