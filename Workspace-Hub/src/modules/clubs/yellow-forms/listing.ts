import type { PreApproval } from '../../../api/types';
import { formatDate } from '../../yellow-forms';

/** Statuses still heading for both signatures, where the day-before-the-event deadline applies. */
const AWAITING_APPROVAL = new Set(['draft', 'returned', 'faculty_coordinator_review', 'associate_hod_review']);

export type PreApprovalHintTone = 'neutral' | 'warning' | 'error';

export interface PreApprovalHint {
  text: string;
  tone: PreApprovalHintTone;
}

/**
 * What a club needs to know about a pre-approval at a glance: its approval
 * deadline while it is still being signed, that it expired, or where its claim
 * sheet stands once it is pre-approved. `claimSheetLabel` turns a claim-sheet
 * status into the server's wording.
 */
export function preApprovalHint(
  form: Pick<
    PreApproval,
    'status' | 'is_expired' | 'approval_deadline' | 'claim_sheet_status' | 'event_completed' | 'event_end_date'
  >,
  claimSheetLabel: (status: string) => string,
): PreApprovalHint | null {
  if (form.is_expired) return { text: 'Expired', tone: 'error' };
  if (AWAITING_APPROVAL.has(form.status)) {
    return {
      text: `Approve by ${formatDate(form.approval_deadline)}`,
      tone: form.status === 'returned' ? 'warning' : 'neutral',
    };
  }
  if (form.status !== 'approved') return null;
  if (form.claim_sheet_status) {
    return {
      text: `Claim sheet: ${claimSheetLabel(form.claim_sheet_status)}`,
      tone: form.claim_sheet_status === 'returned' ? 'warning' : 'neutral',
    };
  }
  return form.event_completed
    ? { text: 'Claim sheet: not filed yet', tone: 'warning' }
    : { text: `Claim sheet from ${formatDate(form.event_end_date)}`, tone: 'neutral' };
}
