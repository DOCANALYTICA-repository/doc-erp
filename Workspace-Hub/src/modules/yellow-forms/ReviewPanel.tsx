import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { TextArea } from '@astryxdesign/core/TextArea';
import { useToast } from '@astryxdesign/core/Toast';

import { useYellowFormInvalidator } from '../../api/hooks';
import type { ClaimSheet, PreApproval, ReviewActionKind } from '../../api/types';
import { describeError } from '../../services/errors';
import { yellowFormApi } from './api';
import { SectionLabel } from './parts';

interface CommonProps {
  id: string;
  approveLabel?: string;
  className?: string;
}

export type ReviewPanelProps =
  | (CommonProps & {
      kind: 'pre_approval';
      onReviewed?: (action: ReviewActionKind, form: PreApproval) => void;
    })
  | (CommonProps & {
      kind: 'claim_sheet';
      onReviewed?: (action: ReviewActionKind, sheet: ClaimSheet) => void;
    });

function successMessage(kind: ReviewPanelProps['kind'], action: ReviewActionKind, status: string): string {
  if (action === 'revise') return 'Sent back to the club with your reason.';
  if (action === 'reject') return kind === 'pre_approval' ? 'Pre-approval rejected.' : 'Claim sheet rejected.';
  if (kind === 'claim_sheet') return 'Claim sheet approved and forwarded to the attendance office.';
  return status === 'approved'
    ? 'Pre-approval granted. The club has been notified.'
    : 'Approved. It now goes to the Associate HOD for final pre-approval.';
}

/**
 * Approve, send back or reject. A reason is required for the last two, and the
 * club sees it. Render this only when the document's `viewer_can_review` is
 * true; the server refuses anyone else with a message that is toasted as-is.
 */
export const ReviewPanel: React.FC<ReviewPanelProps> = props => {
  const { kind, id, approveLabel, className = '' } = props;
  const showToast = useToast();
  const invalidate = useYellowFormInvalidator();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState<ReviewActionKind | null>(null);
  const reasonId = React.useId();

  const act = async (action: ReviewActionKind) => {
    const comments = action === 'approve' ? null : reason.trim();
    setBusy(action);
    try {
      if (props.kind === 'pre_approval') {
        const form = await yellowFormApi.reviewPreApproval(id, { action, comments });
        showToast({ body: successMessage(kind, action, form.status), type: 'info' });
        props.onReviewed?.(action, form);
      } else {
        const sheet = await yellowFormApi.reviewClaimSheet(id, { action, comments });
        showToast({ body: successMessage(kind, action, sheet.status), type: 'info' });
        props.onReviewed?.(action, sheet);
      }
      setReason('');
      invalidate();
    } catch (e) {
      showToast({ body: describeError(e), type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const hasReason = reason.trim().length > 0;

  return (
    <section aria-labelledby={reasonId} className={`flex flex-col gap-3 border-t border-border pt-4 ${className}`}>
      <SectionLabel id={reasonId}>Your decision</SectionLabel>
      <TextArea
        label="Reason"
        description="Required to send back or reject. The club sees this."
        value={reason}
        onChange={value => setReason(value)}
        rows={3}
        maxLength={2000}
        isDisabled={busy !== null}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          label="Send back to club"
          variant="secondary"
          size="sm"
          isDisabled={busy !== null || !hasReason}
          isLoading={busy === 'revise'}
          clickAction={() => act('revise')}
        />
        <Button
          label="Reject"
          variant="destructive"
          size="sm"
          isDisabled={busy !== null || !hasReason}
          isLoading={busy === 'reject'}
          clickAction={() => act('reject')}
        />
        <Button
          label={approveLabel ?? (kind === 'claim_sheet' ? 'Approve and forward' : 'Approve')}
          variant="primary"
          size="sm"
          isDisabled={busy !== null}
          isLoading={busy === 'approve'}
          clickAction={() => act('approve')}
        />
      </div>
    </section>
  );
};
