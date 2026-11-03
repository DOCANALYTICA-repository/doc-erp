import React from 'react';

import type { ClaimSheet } from '../../api/types';
import { ClaimSheetGrid } from './ClaimSheetGrid';
import { formatDate, formatDateRange } from './dates';
import { MetaList, Notice, SectionLabel } from './parts';
import { PreApprovalStudentTable } from './PreApprovalStudentTable';
import { ClaimSheetStepper } from './YellowFormStepper';

function signedBy(name: string | null | undefined, role: string, at: string | null | undefined): string | null {
  if (!name) return null;
  return `${name} (${role})${at ? ` on ${formatDate(at)}` : ''}`;
}

/**
 * A claim sheet for reading and reviewing: the event, where the sheet is, the
 * Claims Coordinator's decision, the attached pre-approved list with its
 * signatures, and the sheet itself in the template's layout. Actions
 * (export, review, edit) are the caller's, rendered from `viewer_can_*`.
 */
export const ClaimSheetDetail: React.FC<{
  sheet: ClaimSheet;
  /** Hide the attached pre-approved list, e.g. on a screen that already shows the pre-approval. */
  showPreApprovedList?: boolean;
}> = ({ sheet, showPreApprovedList = true }) => {
  const signatures = [
    signedBy(
      sheet.pre_approval.faculty_coordinator_approved_by_name,
      'Faculty Coordinator',
      sheet.pre_approval.faculty_coordinator_approved_at,
    ),
    signedBy(
      sheet.pre_approval.associate_hod_approved_by_name,
      'Associate HOD',
      sheet.pre_approval.associate_hod_approved_at,
    ),
  ].filter((line): line is string => line !== null);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-secondary">
            {sheet.reference_number} · {sheet.club_name}
          </p>
          <h3 className="font-heading text-base font-semibold text-primary">{sheet.event_name}</h3>
        </div>
        <MetaList
          items={[
            { label: 'Event dates', value: formatDateRange(sheet.event_start_date, sheet.event_end_date) },
            { label: 'Pre-approval', value: sheet.pre_approval_reference },
            { label: 'Filed by', value: sheet.created_by_name },
            {
              label: 'Submitted',
              value: sheet.submitted_at ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {formatDate(sheet.submitted_at)}
                  {sheet.late_submission_flag ? (
                    <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">
                      Filed late
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-secondary">Not submitted yet</span>
              ),
            },
          ]}
        />
      </section>

      <ClaimSheetStepper sheet={sheet} />

      {sheet.status === 'approved' ? (
        <Notice tone="success" title="Approved — forwarded to the attendance office">
          {sheet.reviewed_by_name
            ? `Approved by ${sheet.reviewed_by_name}${sheet.reviewed_at ? ` on ${formatDate(sheet.reviewed_at)}` : ''}.`
            : null}
        </Notice>
      ) : null}

      {(sheet.status === 'returned' || sheet.status === 'rejected') && sheet.review_comments ? (
        <Notice
          tone={sheet.status === 'rejected' ? 'error' : 'warning'}
          title={`${sheet.status === 'rejected' ? 'Rejected' : 'Sent back'} by ${sheet.reviewed_by_name ?? 'the Claims Coordinator'}`}
        >
          <p className="whitespace-pre-line">{sheet.review_comments}</p>
        </Notice>
      ) : null}

      {showPreApprovedList ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Attached pre-approved list ({sheet.pre_approval.students.length})</SectionLabel>
          <p className="text-xs text-secondary">
            {sheet.pre_approval.reference_number}
            {signatures.length > 0 ? ` · Pre-approved by ${signatures.join(' and ')}` : ''}
          </p>
          <PreApprovalStudentTable
            students={sheet.pre_approval.students}
            caption="Students pre-approved for this event"
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionLabel>
          Claim sheet · {sheet.student_count} {sheet.student_count === 1 ? 'student' : 'students'} ·{' '}
          {sheet.row_count} {sheet.row_count === 1 ? 'row' : 'rows'}
        </SectionLabel>
        {sheet.attendance_redacted ? (
          <p className="text-xs text-secondary">
            Attendance is shown only for you. The club&apos;s leadership, its Faculty Coordinator and the
            reviewers see everyone&apos;s.
          </p>
        ) : null}
        <ClaimSheetGrid students={sheet.students} caption={`Claim sheet ${sheet.reference_number}`} />
      </section>
    </div>
  );
};
