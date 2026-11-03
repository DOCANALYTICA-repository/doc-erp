export const STUDENT_CLAIM_TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'my_claims', label: 'All Claims' },
  { id: 'new_claim', label: 'New Submission' },
  // Read-only: clubs file yellow forms; students see the ones that list them.
  { id: 'yellow_forms', label: 'Yellow Forms' },
] as const;

export const REVIEWER_CLAIM_TABS = [
  { id: 'review_queue', label: 'Review Queue' },
  // Everything this reviewer has already decided. The queue used to hold both,
  // so a claim they had signed sat beside ones they had not and only the
  // stage column told them apart.
  { id: 'reviewed', label: 'Approved & Actioned' },
  { id: 'yellow_forms', label: 'Yellow Forms' },
] as const;

// yellow_forms is in both sets; a tab id appears here once.
export const CLAIM_TABS = [
  ...STUDENT_CLAIM_TABS,
  ...REVIEWER_CLAIM_TABS.filter(t => !STUDENT_CLAIM_TABS.some(s => s.id === t.id)),
] as const;

export type ClaimTab = (typeof CLAIM_TABS)[number]['id'];

/** Students land on their overview; the router redirects reviewers on arrival. */
export const CLAIMS_DEFAULT_TAB: ClaimTab = 'dashboard';
export const CLAIMS_REVIEWER_TAB: ClaimTab = 'review_queue';
export const YELLOW_FORMS_TAB: ClaimTab = 'yellow_forms';

/** Individual (student-filed) yellow forms; `coming_soon` until they ship. */
export const CO_CURRICULAR_CAPABILITY = 'claims.individual_co_curricular';

/** Any one of these puts a reviewer on the yellow-form workflow. */
export const YELLOW_FORM_REVIEW_PERMISSIONS = [
  'yellow_forms:approve_faculty_coordinator',
  'yellow_forms:approve_associate_hod',
  'yellow_forms:review_claim_sheet',
] as const;

/** Oversight: the Pipeline links yellow-form items to this tab, so holders must reach it. */
export const YELLOW_FORM_VIEW_ALL = 'yellow_forms:view_all';

/** The Associate HOD and the Claims Coordinator, whose desk here is yellow forms. */
const YELLOW_FORM_DESK_PERMISSIONS = [
  'yellow_forms:approve_associate_hod',
  'yellow_forms:review_claim_sheet',
] as const;

type HasPermission = (permission: string) => boolean;

export function canSeeYellowFormsAsReviewer(hasPermission: HasPermission): boolean {
  return (
    YELLOW_FORM_REVIEW_PERMISSIONS.some(p => hasPermission(p)) || hasPermission(YELLOW_FORM_VIEW_ALL)
  );
}

export function claimTabsFor(isReviewer: boolean, hasPermission: HasPermission) {
  if (!isReviewer) return STUDENT_CLAIM_TABS;
  const showYellowForms = canSeeYellowFormsAsReviewer(hasPermission);
  return REVIEWER_CLAIM_TABS.filter(t => t.id !== YELLOW_FORMS_TAB || showYellowForms);
}

/** Literal permissions, so super_admin's `*` keeps the claims queue it uses to rescue stuck claims. */
export function claimsLandingTab(isReviewer: boolean, permissions: readonly string[]): ClaimTab {
  if (!isReviewer) return CLAIMS_DEFAULT_TAB;
  return YELLOW_FORM_DESK_PERMISSIONS.some(p => permissions.includes(p))
    ? YELLOW_FORMS_TAB
    : CLAIMS_REVIEWER_TAB;
}

const VALID = new Set<string>(CLAIM_TABS.map(t => t.id));

export function isClaimTab(value: string | undefined): value is ClaimTab {
  return value !== undefined && VALID.has(value);
}
