/**
 * The club workspace tabs, at module scope.
 *
 * This list was a fifteen-member inline union written directly into a
 * useState generic inside a 1,000-line component, which meant the set of
 * valid tabs was neither importable nor checkable anywhere else — including
 * by the router that now has to validate a :tab path param.
 *
 * The server sends `visible_tabs` in the bootstrap payload; this list is only
 * the vocabulary and the labels.
 */
export const CLUB_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'members', label: 'Members' },
  { id: 'structure', label: 'Structure' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'recruitment', label: 'Recruitment' },
  { id: 'events', label: 'Annual Events' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'budget', label: 'Club Budget' },
  { id: 'reimbursements', label: 'Reimbursements' },
  { id: 'sponsorships', label: 'Sponsorships' },
  { id: 'annual-plan', label: 'Annual Planning' },
  { id: 'documents', label: 'Documents' },
  { id: 'reports', label: 'Reports' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
] as const;

/** Derived from the list, so the two can never drift apart. */
export type ClubTab = (typeof CLUB_TABS)[number]['id'];

export const CLUBS_DEFAULT_TAB: ClubTab = 'dashboard';

const VALID = new Set<string>(CLUB_TABS.map(t => t.id));

export function isClubTab(value: string | undefined): value is ClubTab {
  return value !== undefined && VALID.has(value);
}

/**
 * Which sub-resources a tab needs, for hover-prefetching. Tabs that read only
 * from the bootstrap payload are absent — there is nothing to prefetch.
 */
export const TAB_RESOURCES: Partial<Record<ClubTab, string[]>> = {
  events: ['events'],
  tasks: ['tasks'],
  recruitment: ['recruitment-drives'],
  announcements: ['announcements'],
  budget: ['budgets'],
  reimbursements: ['reimbursements'],
  sponsorships: ['sponsorships'],
  'annual-plan': ['annual-plans'],
  documents: ['documents', 'knowledge-base'],
};
