import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';

import { useYellowFormQueue, useYellowFormsReviewed } from '../../../api/hooks';
import type { ClaimSheet, PreApproval } from '../../../api/types';
import { DataTable } from '../../../components/ui/DataTable';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useStore } from '../../../context/useStore';
import { Notice, YellowFormStatusChip, formatDate, formatDateRange } from '../../yellow-forms';
import { ApproveByCell, OpenFormButton, SectionEmpty } from './parts';
import { useOpenParam } from './useOpenParam';
import { YellowFormDrawer } from './YellowFormDrawer';

type ActionedRow =
  | { kind: 'pre_approval'; item: PreApproval }
  | { kind: 'claim_sheet'; item: ClaimSheet };

const PreApprovalQueue: React.FC<{ forms: PreApproval[]; onOpen: (id: string) => void }> = ({ forms, onOpen }) => (
  <DataTable
    caption="Pre-approvals awaiting your approval"
    rows={forms}
    getRowKey={form => form.id}
    emptyState={<SectionEmpty>No pre-approvals are waiting on you.</SectionEmpty>}
    columns={[
      {
        key: 'event',
        header: 'Event',
        render: form => (
          <OpenFormButton label={form.event_name} detail={form.reference_number} onOpen={() => onOpen(form.id)} />
        ),
      },
      { key: 'club', header: 'Club', render: form => form.club_name },
      {
        key: 'dates',
        header: 'Event dates',
        secondary: true,
        render: form => (
          <span className="whitespace-nowrap">{formatDateRange(form.event_start_date, form.event_end_date)}</span>
        ),
      },
      {
        key: 'students',
        header: 'Students',
        secondary: true,
        align: 'right',
        render: form => <span className="tabular-nums">{form.student_count}</span>,
      },
      { key: 'deadline', header: 'Approve by', render: form => <ApproveByCell deadline={form.approval_deadline} /> },
      {
        key: 'stage',
        header: 'Stage',
        secondary: true,
        render: form => <YellowFormStatusChip status={form.status} label={form.status_label} isExpired={form.is_expired} />,
      },
    ]}
  />
);

const ClaimSheetQueue: React.FC<{ sheets: ClaimSheet[]; onOpen: (id: string) => void }> = ({ sheets, onOpen }) => (
  <DataTable
    caption="Claim sheets awaiting your review"
    rows={sheets}
    getRowKey={sheet => sheet.id}
    emptyState={<SectionEmpty>No claim sheets are waiting on you.</SectionEmpty>}
    columns={[
      {
        key: 'event',
        header: 'Event',
        render: sheet => (
          <OpenFormButton label={sheet.event_name} detail={sheet.reference_number} onOpen={() => onOpen(sheet.id)} />
        ),
      },
      { key: 'club', header: 'Club', render: sheet => sheet.club_name },
      {
        key: 'submitted',
        header: 'Submitted',
        render: sheet => (
          <span className="flex flex-col whitespace-nowrap">
            <span className="tabular-nums">{sheet.submitted_at ? formatDate(sheet.submitted_at) : '—'}</span>
            {sheet.late_submission_flag ? <span className="text-xs font-medium text-warning">Filed late</span> : null}
          </span>
        ),
      },
      {
        key: 'size',
        header: 'Students',
        secondary: true,
        align: 'right',
        render: sheet => (
          <span className="whitespace-nowrap tabular-nums">
            {sheet.student_count} · {sheet.row_count} {sheet.row_count === 1 ? 'row' : 'rows'}
          </span>
        ),
      },
    ]}
  />
);

const ActionedTable: React.FC<{ rows: ActionedRow[]; onOpen: (id: string) => void }> = ({ rows, onOpen }) => (
  <DataTable
    caption="Yellow forms you have already decided"
    rows={rows}
    getRowKey={row => row.item.id}
    emptyState={<SectionEmpty>Forms you approve, send back or reject move here.</SectionEmpty>}
    columns={[
      {
        key: 'event',
        header: 'Event',
        render: row => (
          <OpenFormButton
            label={row.item.event_name}
            detail={row.item.reference_number}
            onOpen={() => onOpen(row.item.id)}
          />
        ),
      },
      {
        key: 'type',
        header: 'Type',
        secondary: true,
        render: row => (row.kind === 'pre_approval' ? 'Pre-approval' : 'Claim sheet'),
      },
      { key: 'club', header: 'Club', secondary: true, render: row => row.item.club_name },
      {
        key: 'now',
        header: 'Now',
        render: row => (
          <YellowFormStatusChip
            status={row.item.status}
            label={row.item.status_label}
            isExpired={row.kind === 'pre_approval' ? row.item.is_expired : false}
          />
        ),
      },
    ]}
  />
);

/**
 * The reviewer's desk: what is waiting on this reviewer, then what they have
 * already decided. Sections follow the viewer's stage permissions, so a
 * Faculty Coordinator is not shown an always-empty claim-sheet queue.
 */
export const ReviewerYellowForms: React.FC = () => {
  const navigate = useNavigate();
  const hasPermission = useStore(s => s.hasPermission);
  const { openId, open, close } = useOpenParam();

  const reviewsPreApprovals =
    hasPermission('yellow_forms:approve_faculty_coordinator') || hasPermission('yellow_forms:approve_associate_hod');
  const reviewsClaimSheets = hasPermission('yellow_forms:review_claim_sheet');
  const reviews = reviewsPreApprovals || reviewsClaimSheets;

  const queue = useYellowFormQueue(reviews);
  const reviewed = useYellowFormsReviewed(reviews);

  const lists = [queue.data, reviewed.data].filter(
    (bundle): bundle is NonNullable<typeof bundle> => bundle !== undefined,
  );
  const drawer = (
    <YellowFormDrawer openId={openId} onOpen={open} onClose={close} lists={lists} allowReview />
  );

  if (!reviews) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="Oversight of every club's yellow forms">
          Pre-approvals and claim sheets in flight are on the Pipeline, and its links open them here.
        </Notice>
        <div>
          <Button label="Open the pipeline" variant="secondary" size="sm" clickAction={() => navigate('/app/pipeline')} />
        </div>
        {drawer}
      </div>
    );
  }

  if (queue.isLoading || reviewed.isLoading) {
    return (
      <>
        <PageSkeleton variant="table" label="Loading yellow forms" />
        {drawer}
      </>
    );
  }

  if (queue.isError || reviewed.isError) {
    return (
      <>
        <ErrorState
          title="Yellow forms didn't load"
          error={queue.error ?? reviewed.error}
          onRetry={() => {
            void queue.refetch();
            void reviewed.refetch();
          }}
        />
        {drawer}
      </>
    );
  }

  const waitingForms = queue.data?.pre_approvals ?? [];
  const waitingSheets = queue.data?.claim_sheets ?? [];
  const actioned: ActionedRow[] = [
    ...(reviewed.data?.pre_approvals ?? []).map(item => ({ kind: 'pre_approval' as const, item })),
    ...(reviewed.data?.claim_sheets ?? []).map(item => ({ kind: 'claim_sheet' as const, item })),
  ];

  return (
    <div className="flex flex-col gap-8">
      {reviewsPreApprovals ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Pre-approvals awaiting you"
            description={
              waitingForms.length > 0
                ? `${waitingForms.length} waiting · approval closes the day before each event starts`
                : 'Approval closes the day before each event starts.'
            }
          />
          <PreApprovalQueue forms={waitingForms} onOpen={open} />
        </section>
      ) : null}

      {reviewsClaimSheets ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Claim sheets awaiting you"
            description={
              waitingSheets.length > 0
                ? `${waitingSheets.length} waiting · approving forwards the sheet to the attendance office`
                : 'Approving a claim sheet forwards it to the attendance office.'
            }
          />
          <ClaimSheetQueue sheets={waitingSheets} onOpen={open} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Recently actioned" description="Where each form you decided is now." />
        <ActionedTable rows={actioned} onOpen={open} />
      </section>

      {drawer}
    </div>
  );
};
