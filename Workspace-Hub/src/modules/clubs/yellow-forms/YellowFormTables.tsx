import React from 'react';

import type { ClaimSheet, PreApproval } from '../../../api/types';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { YellowFormStatusChip, formatDate, formatDateRange } from '../../yellow-forms';
import { preApprovalHint, type PreApprovalHintTone } from './listing';

const HINT_TONE: Record<PreApprovalHintTone, string> = {
  neutral: 'text-secondary',
  warning: 'font-medium text-warning',
  error: 'font-medium text-error',
};

export const PreApprovalsTable: React.FC<{
  forms: PreApproval[];
  hrefFor: (id: string) => string;
  claimSheetLabel: (status: string) => string;
  emptyState: React.ReactNode;
}> = ({ forms, hrefFor, claimSheetLabel, emptyState }) => {
  const columns: Column<PreApproval>[] = [
    {
      key: 'event',
      header: 'Event',
      isRowLink: true,
      render: form => (
        <span className="flex flex-col">
          <span className="font-medium text-primary">{form.event_name}</span>
          <span className="text-xs text-secondary">{form.reference_number}</span>
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: form => (
        <span className="whitespace-nowrap">{formatDateRange(form.event_start_date, form.event_end_date)}</span>
      ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'right',
      secondary: true,
      render: form => <span className="tabular-nums">{form.student_count}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: form => (
        <YellowFormStatusChip status={form.status} label={form.status_label} isExpired={form.is_expired} />
      ),
    },
    {
      key: 'next',
      header: 'Next',
      render: form => {
        const hint = preApprovalHint(form, claimSheetLabel);
        return hint ? (
          <span className={`text-xs ${HINT_TONE[hint.tone]}`}>{hint.text}</span>
        ) : (
          <span className="text-xs text-secondary">—</span>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={forms}
      getRowKey={form => form.id}
      caption="Pre-approvals"
      rowHref={form => hrefFor(form.id)}
      emptyState={emptyState}
    />
  );
};

export const ClaimSheetsTable: React.FC<{
  sheets: ClaimSheet[];
  hrefFor: (id: string) => string;
  emptyState: React.ReactNode;
}> = ({ sheets, hrefFor, emptyState }) => {
  const columns: Column<ClaimSheet>[] = [
    {
      key: 'reference',
      header: 'Reference',
      isRowLink: true,
      render: sheet => <span className="whitespace-nowrap font-medium text-primary">{sheet.reference_number}</span>,
    },
    {
      key: 'event',
      header: 'Event',
      render: sheet => (
        <span className="flex flex-col">
          <span className="text-primary">{sheet.event_name}</span>
          <span className="text-xs text-secondary">
            {formatDateRange(sheet.event_start_date, sheet.event_end_date)}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: sheet => <YellowFormStatusChip status={sheet.status} label={sheet.status_label} />,
    },
    {
      key: 'submitted',
      header: 'Submitted',
      secondary: true,
      render: sheet =>
        sheet.submitted_at ? (
          <span className="inline-flex flex-wrap items-center gap-2 whitespace-nowrap">
            {formatDate(sheet.submitted_at)}
            {sheet.late_submission_flag ? (
              <span className="rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">
                Filed late
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-secondary">Not submitted</span>
        ),
    },
    {
      key: 'rows',
      header: 'Rows',
      align: 'right',
      secondary: true,
      render: sheet => <span className="tabular-nums">{sheet.row_count}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={sheets}
      getRowKey={sheet => sheet.id}
      caption="Claim sheets"
      rowHref={sheet => hrefFor(sheet.id)}
      emptyState={emptyState}
    />
  );
};
