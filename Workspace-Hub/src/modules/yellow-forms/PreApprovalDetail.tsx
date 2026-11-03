import React from 'react';
import { StatusDot } from '@astryxdesign/core/StatusDot';

import { useYellowFormWorkflow } from '../../api/hooks';
import type { PreApproval } from '../../api/types';
import { formatDate, formatDateRange } from './dates';
import { MetaList, Notice, SectionLabel } from './parts';
import { PreApprovalStudentTable } from './PreApprovalStudentTable';
import { PreApprovalStepper } from './YellowFormStepper';
import { stageLabelFor, statusLabelFor } from './workflow';

/** Statuses still heading for approval, where the day-before-the-event deadline applies. */
const AWAITING_APPROVAL = ['draft', 'returned', 'faculty_coordinator_review', 'associate_hod_review'];

type TrailState = 'done' | 'pending' | 'waiting';

const TRAIL_DOT: Record<TrailState, 'success' | 'accent' | 'neutral'> = {
  done: 'success',
  pending: 'accent',
  waiting: 'neutral',
};

const TrailItem: React.FC<{ state: TrailState; title: string; detail: string }> = ({ state, title, detail }) => (
  <li className="flex items-start gap-2.5">
    <StatusDot
      variant={TRAIL_DOT[state]}
      label={state === 'done' ? 'Done' : state === 'pending' ? 'Pending' : 'Not reached'}
      className="mt-1.5"
    />
    <div className="min-w-0">
      <p className="text-sm font-medium text-primary">{title}</p>
      <p className="text-xs text-secondary">{detail}</p>
    </div>
  </li>
);

function approvalTrailItem(
  status: string,
  stage: string,
  name: string | null | undefined,
  at: string | null | undefined,
): { state: TrailState; detail: string } {
  if (name) return { state: 'done', detail: `Approved by ${name}${at ? ` on ${formatDate(at)}` : ''}` };
  if (status === stage) return { state: 'pending', detail: 'Awaiting approval' };
  return { state: 'waiting', detail: 'Not yet' };
}

/**
 * Everything about one pre-approval a reader needs: the event, where it is in
 * the approval chain, its deadline or expiry, the reviewer's comments, who
 * signed and when, and the students. Actions are the caller's, rendered from
 * the form's `viewer_can_*` flags.
 */
export const PreApprovalDetail: React.FC<{
  form: PreApproval;
  /** Hide the student table when the caller shows the list elsewhere. */
  showStudents?: boolean;
}> = ({ form, showStudents = true }) => {
  const { data: workflow } = useYellowFormWorkflow();
  const awaiting = !form.is_expired && AWAITING_APPROVAL.includes(form.status);
  const sentBack = form.status === 'returned' || form.status === 'rejected';

  const fc = approvalTrailItem(
    form.status,
    'faculty_coordinator_review',
    form.faculty_coordinator_approved_by_name,
    form.faculty_coordinator_approved_at,
  );
  const ahod = approvalTrailItem(
    form.status,
    'associate_hod_review',
    form.associate_hod_approved_by_name,
    form.associate_hod_approved_at,
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-secondary">
            {form.reference_number} · {form.club_name}
          </p>
          <h3 className="font-heading text-base font-semibold text-primary">{form.event_name}</h3>
        </div>
        <MetaList
          items={[
            { label: 'Event dates', value: formatDateRange(form.event_start_date, form.event_end_date) },
            { label: 'Venue', value: form.venue || <span className="text-secondary">Not given</span> },
            { label: 'Academic year', value: form.academic_year },
          ]}
        />
        {form.event_description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-primary">{form.event_description}</p>
        ) : null}
      </section>

      <PreApprovalStepper form={form} />

      {sentBack && form.review_comments ? (
        <Notice
          tone={form.status === 'rejected' ? 'error' : 'warning'}
          title={
            `${form.status === 'rejected' ? 'Rejected' : 'Sent back'} by ` +
            `${form.last_reviewed_by_name ?? 'the reviewer'}` +
            (form.last_reviewed_stage
              ? ` at the ${stageLabelFor(workflow?.pre_approval, form.last_reviewed_stage)} stage`
              : '')
          }
        >
          <p className="whitespace-pre-line">{form.review_comments}</p>
        </Notice>
      ) : null}

      {form.is_expired ? (
        <Notice tone="error" title="Expired">
          The event started on {formatDate(form.event_start_date)} before pre-approval was complete,
          so it can no longer be submitted or approved.
        </Notice>
      ) : null}

      {awaiting ? (
        <Notice
          tone="info"
          title={`Needs Faculty Coordinator and Associate HOD approval by ${formatDate(form.approval_deadline)}`}
        >
          {form.pending_with
            ? `Waiting on ${form.pending_with}.`
            : form.status === 'returned'
              ? 'Back with the club. Resubmitting sends it to the Faculty Coordinator again.'
              : `Not submitted yet. Approvals close when the event starts on ${formatDate(form.event_start_date)}.`}
        </Notice>
      ) : null}

      {form.status === 'approved' ? (
        form.claim_sheet_id ? (
          <Notice tone="info" title={`Claim sheet ${form.claim_sheet_reference ?? ''}`.trim()}>
            {statusLabelFor(workflow?.claim_sheet, form.claim_sheet_status)}
          </Notice>
        ) : (
          <Notice tone="success" title="Pre-approved">
            {form.event_completed
              ? 'The event is over. The claim sheet has not been filed yet.'
              : `The claim sheet can be filed once the event ends on ${formatDate(form.event_end_date)}.`}
          </Notice>
        )
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Approval trail</SectionLabel>
        <ol className="flex flex-col gap-3">
          <TrailItem
            state={form.submitted_at ? 'done' : 'pending'}
            title={`Filed by ${form.created_by_name}`}
            detail={form.submitted_at ? `Submitted on ${formatDate(form.submitted_at)}` : 'Not submitted yet'}
          />
          <TrailItem state={fc.state} title="Faculty Coordinator" detail={fc.detail} />
          <TrailItem state={ahod.state} title="Associate HOD" detail={ahod.detail} />
        </ol>
      </section>

      {showStudents ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Students ({form.student_count})</SectionLabel>
          <PreApprovalStudentTable students={form.students} />
        </section>
      ) : null}
    </div>
  );
};
