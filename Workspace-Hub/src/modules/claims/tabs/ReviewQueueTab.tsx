import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { CheckCircle2, Paperclip } from 'lucide-react';

import { api } from '../../../services/api';
import { useYellowFormQueue } from '../../../api/hooks';
import { useStore } from '../../../context/useStore';
import { describeError } from '../../../services/errors';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { SupportingDocument } from '../../../api/types';
import { ClaimStatusStepper } from '../components/ClaimStatusStepper';
import { useClaimsWorkspace } from '../ClaimsContext';
import { PagedFooter } from '../../../components/ui/PagedFooter';
import { DataTable } from '../../../components/ui/DataTable';
import { Drawer } from '../../../components/ui/Drawer';
import { YELLOW_FORM_REVIEW_PERMISSIONS, YELLOW_FORMS_TAB } from '../tabs';

export const ReviewQueueTab: React.FC = () => {
  const { claims, totalClaims, page, pageSize, setPage, invalidate } = useClaimsWorkspace();
  const showToast = useToast();

  const [reviewingId, setReviewingId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [docsByClaim, setDocsByClaim] = React.useState<Record<string, SupportingDocument[]>>({});

  const reviewingClaim = claims.find(c => c.id === reviewingId);

  // An empty claims queue must not read as "nothing to do" while yellow forms wait one tab over.
  const navigate = useNavigate();
  const reviewsYellowForms = useStore(s => YELLOW_FORM_REVIEW_PERMISSIONS.some(p => s.hasPermission(p)));
  const yellowQueue = useYellowFormQueue(claims.length === 0 && reviewsYellowForms);
  const yellowWaiting =
    (yellowQueue.data?.pre_approvals?.length ?? 0) + (yellowQueue.data?.claim_sheets?.length ?? 0);

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
    return yellowWaiting > 0 ? (
      <EmptyState
        title="No claims awaiting your review"
        description={`${yellowWaiting} yellow ${yellowWaiting === 1 ? 'form is' : 'forms are'} waiting on you.`}
        icon={CheckCircle2}
        action={
          <Button
            label="Open Yellow Forms"
            variant="primary"
            size="sm"
            clickAction={() => navigate(`/app/claims/${YELLOW_FORMS_TAB}`)}
          />
        }
      />
    ) : (
      <EmptyState
        title="Nothing awaiting your review"
        description="Claims routed to you appear here, and in your inbox."
        icon={CheckCircle2}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Review queue"
        description={`${totalClaims} awaiting your decision`}
      />

      {/*
        * Was a hand-written <table> duplicating DataTable's class strings, for
        * the sole reason that DataTable could not render a detail row. It now
        * can, so this is columns + one detail panel.
        *
        * `showToggle: false` because this screen already has its own triggers
        * in the cells — the paperclip loads documents and "Revise or reject"
        * opens the form. A chevron beside them would be a third control doing
        * the same job.
        *
        * The two detail rows this used to render separately (documents, review
        * form) are now one panel that shows whichever parts are active.
        */}
      <DataTable
        caption="Claims awaiting your review"
        rows={claims}
        getRowKey={claim => claim.id}
        columns={[
          {
            key: 'reference',
            header: 'Reference',
            render: claim => (
              <span className="font-medium text-primary">{claim.reference_number}</span>
            ),
          },
          {
            key: 'student',
            header: 'Student',
            secondary: true,
            render: claim => claim.submitter_name ?? claim.submitted_by,
          },
          {
            key: 'reason',
            header: 'Reason',
            secondary: true,
            render: claim => (
              <span className="block max-w-xs truncate">{claim.reason}</span>
            ),
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
            key: 'action',
            header: 'Action',
            align: 'right',
            render: claim => (
              <div className="flex justify-end gap-2">
                {/*
                  * Approve stays in the row: it is the common case and does
                  * not need the detail. Everything else — the documents, the
                  * reason box, reject — moved into the drawer, because those
                  * are the decisions that need reading the claim first.
                  */}
                <Button
                  label="Approve"
                  variant="primary"
                  size="sm"
                  isDisabled={busyId === claim.id}
                  clickAction={() =>
                    act(
                      claim.id,
                      `/claims/${claim.id}/approve-stage?action=approve`,
                      'Claim approved and moved to the next stage.',
                    )
                  }
                />
                <Button
                  label="Review"
                  variant="secondary"
                  size="sm"
                  clickAction={() => setReviewingId(claim.id)}
                />
              </div>
            ),
          },
        ]}
      />

      {/*
        * The claim detail, in a Drawer rather than a table sub-row.
        *
        * A reviewer works down a queue: open, read, decide, next. As an
        * expanding row the reason box pushed everything below it and the
        * documents list appeared in a third row, so the table reflowed twice
        * per claim. The drawer keeps the queue still.
        *
        * `purpose="form"` because it contains a textarea — a stray backdrop
        * click must not discard a half-typed rejection reason.
        */}
      <Drawer
        isOpen={reviewingClaim !== undefined}
        onClose={() => {
          setReviewingId(null);
          setReason('');
        }}
        purpose="form"
        title={reviewingClaim?.reference_number ?? 'Claim'}
        subtitle={reviewingClaim?.submitter_name ?? reviewingClaim?.submitted_by ?? undefined}
        headerContent={
          reviewingClaim ? (
            <ClaimStatusStepper
              status={reviewingClaim.status as never}
              currentStage={reviewingClaim.current_workflow_stage as never}
              submissionType={reviewingClaim.submission_type as never}
              referenceNumber={reviewingClaim.reference_number}
              revisionReason={reviewingClaim.revision_reason}
              lastRevisedStage={reviewingClaim.last_revised_stage}
              pendingApprovals={reviewingClaim.pending_approvals}
            />
          ) : null
        }
        actions={
          reviewingClaim ? (
            <>
              <Button
                label="Send back to student"
                variant="secondary"
                size="sm"
                isDisabled={busyId === reviewingClaim.id || !reason.trim()}
                clickAction={() =>
                  act(
                    reviewingClaim.id,
                    `/claims/${reviewingClaim.id}/approve-stage?action=revise&feedback=${encodeURIComponent(reason)}`,
                    'Claim returned to the student for revision.',
                  )
                }
              />
              {/* Reject was absent from the UI entirely, though the backend
                  has supported it at every stage. Without it a reviewer could
                  only bounce a claim back indefinitely. */}
              <Button
                label="Reject claim"
                variant="destructive"
                size="sm"
                isDisabled={busyId === reviewingClaim.id || !reason.trim()}
                clickAction={() =>
                  act(
                    reviewingClaim.id,
                    `/claims/${reviewingClaim.id}/approve-stage?action=reject&feedback=${encodeURIComponent(reason)}`,
                    'Claim rejected.',
                  )
                }
              />
            </>
          ) : null
        }
      >
        {reviewingClaim ? (
          <div className="flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">
                Reason given
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-primary">
                {reviewingClaim.reason || 'No reason was provided.'}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">
                Supporting documents
              </h3>
              {docsByClaim[reviewingClaim.id] === undefined ? (
                <Button
                  label="Load documents"
                  variant="secondary"
                  size="sm"
                  clickAction={() => loadDocuments(reviewingClaim.id)}
                />
              ) : docsByClaim[reviewingClaim.id].length === 0 ? (
                <p className="mt-1.5 text-sm text-secondary">None attached.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {docsByClaim[reviewingClaim.id].map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => openDocument(reviewingClaim.id, doc.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-primary transition-colors hover:bg-muted"
                    >
                      <Paperclip className="h-3 w-3" aria-hidden="true" />
                      {doc.document_type}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold uppercase tracking-wide text-secondary"
                htmlFor="review-reason"
              >
                Reason (required to send back or reject — the student sees this)
              </label>
              <textarea
                id="review-reason"
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-primary"
              />
            </div>
          </div>
        ) : null}
      </Drawer>

      <PagedFooter
        page={page}
        pageSize={pageSize}
        total={totalClaims}
        onChange={setPage}
        label="Review queue pages"
      />
    </div>
  );
};
