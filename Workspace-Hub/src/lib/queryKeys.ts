/**
 * One key per RESOURCE, never per tab.
 *
 * This distinction is the whole point. The previous code keyed its data
 * fetching on `activeSubTab`, so the same club roster was re-fetched under a
 * different identity for every tab that displayed it. Keying on the resource
 * means the Members tab, the Structure tab and the dashboard tile all read one
 * cache entry, and a mutation invalidates it once for all three.
 *
 * Keys are hierarchical so a whole club can be invalidated with
 * `queryClient.invalidateQueries({ queryKey: clubKeys.detail(id) })`.
 */
export const clubKeys = {
  all: ['clubs'] as const,
  myMemberships: () => [...clubKeys.all, 'my-memberships'] as const,
  detail: (clubId: string) => [...clubKeys.all, clubId] as const,
  bootstrap: (clubId: string) => [...clubKeys.detail(clubId), 'bootstrap'] as const,
  resource: (clubId: string, resource: string) =>
    [...clubKeys.detail(clubId), resource] as const,
  analytics: (clubId: string, year: string) =>
    [...clubKeys.detail(clubId), 'analytics', year] as const,
  report: (clubId: string, reportType: string) =>
    [...clubKeys.detail(clubId), 'report', reportType] as const,
  awaitingReview: () => [...clubKeys.all, 'awaiting-my-review'] as const,
};

export const claimKeys = {
  all: ['claims'] as const,
  list: () => [...claimKeys.all, 'list'] as const,
  detail: (claimId: string) => [...claimKeys.all, claimId] as const,
  documents: (claimId: string) => [...claimKeys.detail(claimId), 'documents'] as const,
  workflow: () => [...claimKeys.all, 'workflow'] as const,
  timetable: (programme?: string, semester?: string, section?: string) =>
    [...claimKeys.all, 'timetable', programme ?? '', semester ?? '', section ?? ''] as const,
};

export const facultyKeys = {
  all: ['faculty'] as const,
  notes: () => [...facultyKeys.all, 'notes'] as const,
  documents: () => [...facultyKeys.all, 'documents'] as const,
  meetings: () => [...facultyKeys.all, 'meetings'] as const,
  reminders: () => [...facultyKeys.all, 'reminders'] as const,
  directory: (search: string) => [...facultyKeys.all, 'directory', search] as const,
};

export const platformKeys = {
  tasks: ['tasks'] as const,
  calendar: ['calendar'] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  actionQueue: ['me', 'action-queue'] as const,
  search: (q: string) => ['search', q] as const,
};

export const contentKeys = {
  statistics: ['content', 'statistics'] as const,
  courses: ['content', 'courses'] as const,
  gallery: ['content', 'gallery'] as const,
  clubsShowcase: ['content', 'clubs-showcase'] as const,
};
