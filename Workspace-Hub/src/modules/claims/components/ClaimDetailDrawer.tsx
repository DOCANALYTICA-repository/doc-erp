import React from 'react';
import { useToast } from '@astryxdesign/core/Toast';
import { Paperclip } from 'lucide-react';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Claim, SupportingDocument } from '../../../api/types';
import { ClaimStatusStepper } from './ClaimStatusStepper';
import { PendingApprovals } from './PendingApprovals';
import { Drawer } from '../../../components/ui/Drawer';

/**
 * A submitted claim, read-only.
 *
 * A student could see a status chip and nothing else: no way to check what
 * they had actually put on the form, which hours they had claimed, or what
 * they had attached — the one thing you want when a claim comes back asking
 * for a correction. Reviewers get the same view for claims they have already
 * decided, where there is nothing left to do but read.
 *
 * `purpose="info"` (the default): nothing here is editable, so dismissing on a
 * backdrop click cannot lose anything.
 */
export const ClaimDetailDrawer: React.FC<{
  claim: Claim | undefined;
  onClose: () => void;
}> = ({ claim, onClose }) => {
  const showToast = useToast();
  const [documents, setDocuments] = React.useState<SupportingDocument[] | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = React.useState(false);

  const claimId = claim?.id;

  // Documents are a separate resource, so they load when a claim is opened
  // rather than being fetched for every row of a table nobody has clicked.
  React.useEffect(() => {
    if (!claimId) { setDocuments(null); return; }
    let cancelled = false;
    setIsLoadingDocs(true);
    api.get<SupportingDocument[]>(`/claims/${claimId}/documents`)
      .then(docs => { if (!cancelled) setDocuments(docs); })
      .catch(e => {
        if (cancelled) return;
        setDocuments([]);
        showToast({ body: `Could not list documents: ${describeError(e)}`, type: 'error' });
      })
      .finally(() => { if (!cancelled) setIsLoadingDocs(false); });
    return () => { cancelled = true; };
  }, [claimId, showToast]);

  const openDocument = async (documentId: string) => {
    if (!claimId) return;
    try {
      const { url } = await api.get<{ url: string }>(
        `/claims/${claimId}/documents/${documentId}/download-url`,
      );
      if (!url) {
        showToast({ body: 'That document has no stored file.', type: 'error' });
        return;
      }
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      showToast({ body: `Could not open the document: ${describeError(e)}`, type: 'error' });
    }
  };

  const entries = (claim?.participants ?? []).flatMap(p => p.entries ?? []);

  return (
    <Drawer
      isOpen={claim !== undefined}
      onClose={onClose}
      title={claim?.reference_number ?? 'Claim'}
      subtitle={claim ? `${claim.category === 'medical' ? 'Medical' : 'Co-curricular'} · ${claim.date_range}` : undefined}
      headerContent={
        claim ? (
          <ClaimStatusStepper
            status={claim.status as never}
            currentStage={claim.current_workflow_stage as never}
            submissionType={claim.submission_type as never}
            referenceNumber={claim.reference_number}
            revisionReason={claim.revision_reason}
            lastRevisedStage={claim.last_revised_stage}
            pendingApprovals={claim.pending_approvals}
          />
        ) : null
      }
    >
      {claim ? (
        <div className="flex flex-col gap-5">
          {claim.revision_reason ? (
            <div className="rounded-md bg-warning-muted p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-warning">
                Sent back
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-primary">
                {claim.revision_reason}
              </p>
            </div>
          ) : null}

          <Section title="Still to approve">
            <PendingApprovals pending={claim.pending_approvals ?? []} />
          </Section>

          <Section title="Reason given">
            <p className="mt-1.5 text-sm leading-relaxed text-primary">
              {claim.reason || 'No reason was provided.'}
            </p>
          </Section>

          <Section title={`Classes claimed (${entries.length})`}>
            {entries.length === 0 ? (
              <p className="mt-1.5 text-sm text-secondary">No hours were listed.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {entries.map(entry => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-primary">
                        {entry.subject}
                        {entry.course_code ? (
                          <span className="ml-1.5 font-normal text-secondary">
                            {entry.course_code}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-secondary">
                        {entry.date} · {entry.hour}
                      </p>
                      <p className="text-secondary">
                        {[entry.subject_faculty_name, entry.co_faculty_name].filter(Boolean).join(' / ') ||
                          'Faculty TBC'}
                      </p>
                      {/* Feedback is only ever set when an hour is refused,
                          and it is the reason the claim came back. */}
                      {entry.feedback ? (
                        <p className="mt-1 text-secondary">“{entry.feedback}”</p>
                      ) : null}
                    </div>
                    <StatusChip status={entry.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Supporting documents">
            {isLoadingDocs ? (
              <p className="mt-1.5 text-sm text-secondary">Loading…</p>
            ) : !documents || documents.length === 0 ? (
              <p className="mt-1.5 text-sm text-secondary">None attached.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {documents.map(doc => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => openDocument(doc.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-primary transition-colors hover:bg-muted"
                  >
                    <Paperclip className="h-3 w-3" aria-hidden="true" />
                    {doc.document_type}
                  </button>
                ))}
              </div>
            )}
          </Section>

          <p className="text-xs text-secondary">
            Submitted {claim.submission_date} by {claim.submitter_name || claim.submitted_by}
            {claim.late_submission_flag ? ' · flagged as a late submission' : ''}
          </p>
        </div>
      ) : null}
    </Drawer>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">{title}</h3>
    {children}
  </div>
);

/**
 * The reference number, as the control that opens the claim.
 *
 * Not a clickable <tr>: DataTable refuses those deliberately, because a row
 * that is one big target has no accessible name and swallows selection. A
 * button on the cell that already identifies the claim is the same gesture
 * with none of that.
 */
export const ClaimReferenceButton: React.FC<{
  reference: string;
  onOpen: () => void;
}> = ({ reference, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  >
    {reference}
    <span className="sr-only"> — view this claim</span>
  </button>
);
