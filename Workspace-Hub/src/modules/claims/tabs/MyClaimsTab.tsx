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
import { useClaimsWorkspace } from '../ClaimsContext';

type DateRange = { start: IsoDate; end: IsoDate };

export const MyClaimsTab: React.FC = () => {
  const { claims, invalidate } = useClaimsWorkspace();
  const showToast = useToast();

  const [resubmittingId, setResubmittingId] = React.useState<string | null>(null);
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Your attendance claims</caption>
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-6 py-3">Reference</th>
              <th scope="col" className="hidden px-6 py-3 sm:table-cell">Category</th>
              <th scope="col" className="hidden px-6 py-3 sm:table-cell">Dates</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {claims.map(claim => (
              <React.Fragment key={claim.id}>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">{claim.reference_number}</td>
                  <td className="hidden px-6 py-4 uppercase text-slate-500 sm:table-cell">{claim.category}</td>
                  <td className="hidden px-6 py-4 sm:table-cell">{claim.date_range}</td>
                  <td className="px-6 py-4">
                    <ClaimStatusStepper
                      status={claim.status as never}
                      currentStage={claim.current_workflow_stage as never}
                      submissionType={claim.submission_type as never}
                      referenceNumber={claim.reference_number}
                      revisionReason={claim.revision_reason}
                      lastRevisedStage={claim.last_revised_stage}
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    {claim.status === 'returned' ? (
                      <Button
                        label="Resubmit"
                        variant="secondary"
                        size="sm"
                        clickAction={() => setResubmittingId(resubmittingId === claim.id ? null : claim.id)}
                      />
                    ) : null}
                  </td>
                </tr>

                {resubmittingId === claim.id ? (
                  <tr>
                    <td colSpan={5} className="bg-slate-50 px-6 py-4">
                      <div className="flex max-w-md flex-col gap-3">
                        <p className="text-sm text-slate-600">
                          Sent back because: {claim.revision_reason || 'no reason was given.'}
                        </p>
                        <DateRangeInput label="Updated date range" value={dateRange} onChange={setDateRange} />
                        <label className="text-sm font-medium text-slate-600" htmlFor={`resubmit-reason-${claim.id}`}>
                          Updated reason
                        </label>
                        <textarea
                          id={`resubmit-reason-${claim.id}`}
                          rows={3}
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder={claim.reason ?? ''}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
