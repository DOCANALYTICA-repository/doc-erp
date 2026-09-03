export const STUDENT_CLAIM_TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'my_claims', label: 'All Claims' },
  { id: 'new_claim', label: 'New Submission' },
] as const;

export const REVIEWER_CLAIM_TABS = [
  { id: 'review_queue', label: 'Review Queue' },
] as const;

export const CLAIM_TABS = [...STUDENT_CLAIM_TABS, ...REVIEWER_CLAIM_TABS] as const;

export type ClaimTab = (typeof CLAIM_TABS)[number]['id'];

/** Students land on their overview; the router redirects reviewers on arrival. */
export const CLAIMS_DEFAULT_TAB: ClaimTab = 'dashboard';
export const CLAIMS_REVIEWER_TAB: ClaimTab = 'review_queue';

const VALID = new Set<string>(CLAIM_TABS.map(t => t.id));

export function isClaimTab(value: string | undefined): value is ClaimTab {
  return value !== undefined && VALID.has(value);
}
