import React from 'react';
import { Token } from '@astryxdesign/core/Token';
import { Popover } from '@astryxdesign/core/Popover';
import { StatusDot } from '@astryxdesign/core/StatusDot';

type ClaimStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'closed' | 'rejected' | 'returned';
type WorkflowStage = 'initial_review' | 'subject_faculty' | 'course_coordinator' | 'attendance_office' | 'closed';

interface ClaimStatusStepperProps {
  status: ClaimStatus;
  currentStage: WorkflowStage;
  submissionType?: 'individual' | 'club';
  referenceNumber?: string;
  revisionReason?: string | null;
}

const STAGES: { id: WorkflowStage; individualLabel: string; clubLabel: string }[] = [
  { id: 'initial_review', individualLabel: 'Class Teacher Review', clubLabel: 'Club Faculty Coordinator Review' },
  { id: 'subject_faculty', individualLabel: 'Subject Faculty Review', clubLabel: 'Subject Faculty Review' },
  { id: 'course_coordinator', individualLabel: 'Course Coordinator / HOD Review', clubLabel: 'Course Coordinator / HOD Review' },
  { id: 'attendance_office', individualLabel: 'Attendance Office Update', clubLabel: 'Attendance Office Update' },
  { id: 'closed', individualLabel: 'Closed', clubLabel: 'Closed' },
];

const STAGE_ORDER = STAGES.map(s => s.id);

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

function StepperBody({ status, currentStage, submissionType = 'individual', referenceNumber, revisionReason }: ClaimStatusStepperProps) {
  const isTerminalNegative = status === 'rejected' || status === 'returned';
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

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
          <p className="text-xs text-slate-400 leading-relaxed">
            The exact review stage that made this decision isn't tracked yet — only that the claim was returned/rejected after submission.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {STAGES.map((stage, idx) => {
            const label = submissionType === 'club' ? stage.clubLabel : stage.individualLabel;
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
