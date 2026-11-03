import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import { useToast } from '@astryxdesign/core/Toast';
import { FileText } from 'lucide-react';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { IsoDate } from '../../../lib/date';
import { ClaimStatusStepper } from '../components/ClaimStatusStepper';
import { ClaimDetailDrawer, ClaimReferenceButton } from '../components/ClaimDetailDrawer';
import { PendingApprovals } from '../components/PendingApprovals';
import { useClaimsWorkspace } from '../ClaimsContext';
import { PagedFooter } from '../../../components/ui/PagedFooter';
import { DataTable } from '../../../components/ui/DataTable';

type DateRange = { start: IsoDate; end: IsoDate };

export const MyClaimsTab: React.FC = () => {
  const { claims, totalClaims, page, pageSize, setPage, invalidate } = useClaimsWorkspace();
  const showToast = useToast();

  const [resubmittingId, setResubmittingId] = React.useState<string | null>(null);
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [dateRange, setDateRange] = React.useState<DateRange | null>(null);
  const [reason, setReason] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const resubmit = async (claimId: string) => {
    setIsSaving(true);
    try {
      const body: Record<string, string> = {};
      if (dateRange) body.date_range = `${dateRange.start} to ${dateRange.end}`;
      // Resubmit could previously only change the date range, even though a
      // corrected reason is the most common thing a claim is sent back for.
      if (reason.trim()) body.reason = reason.trim();

      await api.put(`/claims/${claimId}/resubmit`, body);
      showToast({ body: 'Claim resubmitted for review.', type: 'info' });
      setResubmittingId(null);
      setDateRange(null);
      setReason('');
      invalidate();
    } catch (e) {
      showToast({ body: `Could not resubmit: ${describeError(e)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (claims.length === 0) {
    return (
      <EmptyState
        title="You haven't submitted any claims"
        description="Use the New submission tab to file one."
        icon={FileText}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="All claims" />

      {/*
        * This was a hand-written <table> that copied DataTable's exact class
        * strings, purely because DataTable could not do a detail row. Three
        * tables then had to be restyled in lockstep with nothing to catch a
        * drift — and two had already drifted. DataTable now supports
        * `expandable`, so this is a column definition instead of a table.
        */}
      <DataTable
        caption="Your attendance claims"
        rows={claims}
        getRowKey={claim => claim.id}
        expandable={{
          expandedKeys: resubmittingId ? [resubmittingId] : [],
          onToggle: key => setResubmittingId(resubmittingId === key ? null : key),
          // Only a claim that was sent back can be resubmitted — the old
          // hand-rolled table expressed this by showing a "Resubmit" button
          // solely on returned rows, and losing it would offer the form for
          // claims the API would reject.
          canExpand: claim => claim.status === 'returned',
          toggleLabel: isOpen =>
            isOpen ? 'Hide resubmission form' : 'Resubmit this claim',
          renderDetail: claim => (
            <div className="flex max-w-md flex-col gap-3">
              <p className="text-sm text-secondary">
                Sent back because: {claim.revision_reason || 'no reason was given.'}
              </p>
              <DateRangeInput
                label="Updated date range"
                value={dateRange}
                onChange={setDateRange}
              />
              <label
                className="text-sm font-medium text-secondary"
                htmlFor={`resubmit-reason-${claim.id}`}
              >
                Updated reason
              </label>
              <textarea
                id={`resubmit-reason-${claim.id}`}
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={claim.reason ?? ''}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
              <div>
                <Button
                  label={isSaving ? 'Resubmitting…' : 'Submit resubmission'}
                  variant="primary"
                  size="sm"
                  isDisabled={isSaving}
                  clickAction={() => resubmit(claim.id)}
                />
              </div>
            </div>
          ),
        }}
        columns={[
          {
            key: 'reference',
            header: 'Reference',
            render: claim => (
              // The form a student submitted used to be write-once: they could
              // see a status chip and never the claim behind it, which is
              // exactly what they need when one comes back for correction.
              <ClaimReferenceButton
                reference={claim.reference_number}
                onOpen={() => setViewingId(claim.id)}
              />
            ),
          },
          {
            key: 'category',
            header: 'Category',
            secondary: true,
            render: claim => (
              <span className="uppercase text-secondary">{claim.category}</span>
            ),
          },
          {
            key: 'dates',
            header: 'Dates',
            secondary: true,
            render: claim => claim.date_range,
          },
          {
            key: 'status',
            header: 'Status',
            render: claim => (
              <ClaimStatusStepper
                status={claim.status as never}
                currentStage={claim.current_workflow_stage as never}
                submissionType={claim.submission_type as never}
                referenceNumber={claim.reference_number}
                revisionReason={claim.revision_reason}
                lastRevisedStage={claim.last_revised_stage}
                pendingApprovals={claim.pending_approvals}
              />
            ),
          },
          {
            key: 'waiting_on',
            header: 'Waiting on',
            secondary: true,
            render: claim => (
              <span className="block max-w-[14rem] text-sm">
                <PendingApprovals pending={claim.pending_approvals ?? []} variant="inline" />
              </span>
            ),
          },
        ]}
      />

      <ClaimDetailDrawer
        claim={claims.find(c => c.id === viewingId)}
        onClose={() => setViewingId(null)}
      />

      <PagedFooter
        page={page}
        pageSize={pageSize}
        total={totalClaims}
        onChange={setPage}
        label="Your claims pages"
      />
    </div>
  );
};
