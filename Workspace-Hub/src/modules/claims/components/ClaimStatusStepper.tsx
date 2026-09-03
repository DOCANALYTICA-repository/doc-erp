import React from 'react';
import { Token } from '@astryxdesign/core/Token';
import { Popover } from '@astryxdesign/core/Popover';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { useClaimWorkflow } from '../../../api/hooks';
import type { ClaimWorkflowStage } from '../../../api/types';

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
  { id: 'attendance_office', label: 'Attendance office update', club_label: 'Attendance office update', is_terminal: false, is_parallel: false, next_on_approve: 'closed' },
  { id: 'closed', label: 'Closed', club_label: 'Closed', is_terminal: true, is_parallel: false, next_on_approve: null },
];

const TOKEN_COLOR: Record<ClaimStatus, 'blue' | 'yellow' | 'green' | 'red' | 'orange' | 'gray'> = {
  draft: 'gray',
  submitted: 'blue',
  under_review: 'yellow',
  approved: 'green',
  closed: 'green',
  rejected: 'red',
  returned: 'orange',
};

const StatusLabel: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  closed: 'Closed',
  rejected: 'Rejected',
  returned: 'Returned',
};

function StepperBody({ status, currentStage, submissionType = 'individual', referenceNumber, revisionReason, lastRevisedStage }: ClaimStatusStepperProps) {
  const { data: workflow } = useClaimWorkflow();
  const stages = workflow?.stages ?? FALLBACK_STAGES;

  const isTerminalNegative = status === 'rejected' || status === 'returned';
  const currentIndex = stages.findIndex(s => s.id === currentStage);

  return (
    <div className="p-1 min-w-[260px]">
      {referenceNumber && <div className="text-xs font-bold text-slate-900 mb-3">{referenceNumber}</div>}

      {isTerminalNegative ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StatusDot variant="success" label="Submitted" />
            <span className="text-xs text-slate-700">Submitted for review</span>
          </div>
          <div className={`p-3 rounded-lg text-xs ${status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
            <div className="font-bold mb-1">{status === 'rejected' ? 'Rejected' : 'Returned for Revision'}</div>
            <p className="leading-relaxed">
              {revisionReason || 'No reason was provided.'}
            </p>
          </div>
          {/* last_revised_stage IS recorded now (claims.py record_revision),
              so name the stage rather than apologising for not knowing it. */}
          {lastRevisedStage ? (
            <p className="text-xs leading-relaxed text-slate-500">
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
            if (status === 'closed') variant = 'success';
            else if (idx < currentIndex) variant = 'success';
            else if (idx === currentIndex) variant = 'accent';

            return (
              <li key={stage.id} className="flex items-center gap-2.5">
                <StatusDot variant={variant} label={label} isPulsing={variant === 'accent'} />
                <span className={`text-xs ${variant === 'neutral' ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                  {label}
                </span>
              </li>
            );
          })}
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
        color={TOKEN_COLOR[props.status]}
        onClick={() => {}}
      />
    </Popover>
  );
};
