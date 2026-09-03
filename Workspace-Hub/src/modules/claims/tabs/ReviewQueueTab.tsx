import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { CheckCircle2, Paperclip } from 'lucide-react';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { SupportingDocument } from '../../../api/types';
import { ClaimStatusStepper } from '../components/ClaimStatusStepper';
import { useClaimsWorkspace } from '../ClaimsContext';

export const ReviewQueueTab: React.FC = () => {
  const { claims, invalidate } = useClaimsWorkspace();
  const showToast = useToast();

  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [docsByClaim, setDocsByClaim] = React.useState<Record<string, SupportingDocument[]>>({});

  /*
   * Every action below has a try/catch.
   *
   * Astryx's Button.clickAction is try/finally with NO catch, so a rejected
   * write was an unhandled rejection: the spinner stopped and nothing else
   * happened. A reviewer clicking Approve on a claim they were not scoped for
   * saw no error, no toast and no change — indistinguishable from success.
   */
  const act = async (claimId: string, url: string, success: string) => {
    setBusyId(claimId);
    try {
      await api.post(url, {});
      showToast({ body: success, type: 'info' });
      setReviewingId(null);
      setReason('');
      invalidate();
    } catch (e) {
      // ApiError.message carries the FastAPI detail, so the real reason
      // ("You are not the assigned Course Coordinator for this programme")
      // reaches the user for free.
      showToast({ body: describeError(e), type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const loadDocuments = async (claimId: string) => {
    if (docsByClaim[claimId]) return;
    try {
      const docs = await api.get<SupportingDocument[]>(`/claims/${claimId}/documents`);
      setDocsByClaim(prev => ({ ...prev, [claimId]: docs }));
    } catch (e) {
      showToast({ body: `Could not list documents: ${describeError(e)}`, type: 'error' });
    }
  };

  const openDocument = async (claimId: string, documentId: string) => {
    try {
      const { url } = await api.get<{ url: string }>(
        `/claims/${claimId}/documents/${documentId}/download-url`,
      );
      if (!url) {
        // The upload path used to commit a row even when the store rejected
        // the bytes, so a claim could display a certificate that was never
        // written. Say so rather than opening a blank tab.
        showToast({ body: 'That document has no stored file.', type: 'error' });
        return;
      }
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      showToast({ body: `Could not open the document: ${describeError(e)}`, type: 'error' });
    }
  };

  if (claims.length === 0) {
    return (
      <EmptyState
        title="Nothing awaiting your review"
        description="Claims routed to you appear here, and in your inbox."
        icon={CheckCircle2}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Review queue" description={`${claims.length} awaiting you`} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Claims awaiting your review</caption>
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-6 py-3">Reference</th>
              <th scope="col" className="hidden px-6 py-3 sm:table-cell">Student</th>
              <th scope="col" className="hidden px-6 py-3 lg:table-cell">Reason</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="hidden px-6 py-3 sm:table-cell">Docs</th>
              <th scope="col" className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {claims.map(claim => (
              <React.Fragment key={claim.id}>
                <tr>
                  <td className="px-6 py-4 font-medium text-slate-900">{claim.reference_number}</td>
                  <td className="hidden px-6 py-4 sm:table-cell">{claim.submitter_name ?? claim.submitted_by}</td>
                  <td className="hidden max-w-xs truncate px-6 py-4 lg:table-cell">{claim.reason}</td>
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
                  <td className="hidden px-6 py-4 sm:table-cell">
                    <button
                      type="button"
                      onClick={() => loadDocuments(claim.id)}
                      aria-label={`Show supporting documents for ${claim.reference_number}`}
                      className="flex items-center gap-1 text-slate-500 hover:text-slate-900"
                    >
                      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      {docsByClaim[claim.id]?.length ?? '—'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        label="Approve" variant="primary" size="sm"
                        isDisabled={busyId === claim.id}
                        clickAction={() => act(
                          claim.id,
                          `/claims/${claim.id}/approve-stage?action=approve`,
                          'Claim approved and moved to the next stage.',
                        )}
                      />
                      <Button
                        label="Revise or reject" variant="secondary" size="sm"
                        clickAction={() => setReviewingId(reviewingId === claim.id ? null : claim.id)}
                      />
                    </div>
                  </td>
                </tr>

                {docsByClaim[claim.id]?.length ? (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 px-6 py-3">
                      <div className="flex flex-wrap gap-2">
                        {docsByClaim[claim.id].map(doc => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => openDocument(claim.id, doc.id)}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                          >
                            {doc.document_type}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}

                {reviewingId === claim.id ? (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 px-6 py-4">
                      <div className="flex max-w-md flex-col gap-3">
                        <label className="text-sm font-medium text-slate-600" htmlFor={`review-reason-${claim.id}`}>
                          Reason (required, shown to the student)
                        </label>
                        <textarea
                          id={`review-reason-${claim.id}`}
                          rows={2}
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            label="Send back to student" variant="secondary" size="sm"
                            isDisabled={busyId === claim.id || !reason.trim()}
                            clickAction={() => act(
                              claim.id,
                              `/claims/${claim.id}/approve-stage?action=revise&feedback=${encodeURIComponent(reason)}`,
                              'Claim returned to the student for revision.',
                            )}
                          />
                          {/* Reject was absent from the UI entirely, though the
                              backend has supported it at every stage. Without
                              it a reviewer could only bounce a claim back
                              indefinitely. */}
                          <Button
                            label="Reject claim" variant="destructive" size="sm"
                            isDisabled={busyId === claim.id || !reason.trim()}
                            clickAction={() => act(
                              claim.id,
                              `/claims/${claim.id}/approve-stage?action=reject&feedback=${encodeURIComponent(reason)}`,
                              'Claim rejected.',
                            )}
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          Sending back lets the student correct and resubmit. Rejecting closes the claim.
                        </p>
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
