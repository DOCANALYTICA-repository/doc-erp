import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { api } from '../services/api';
import { parseActionQueue, parseClubBootstrap, parseTimetable } from './contracts';
import {
  claimKeys, clubKeys, contentKeys, facultyKeys, platformKeys,
} from '../lib/queryKeys';
import type {
  ActionQueue, Announcement, AwaitingReviewPlan, AnnualPlan, Budget, CalendarEvent, Claim,
  ClubBootstrap, ClubDocument, ClubEvent, ClubMember, DirectoryEntry, FacultyDocument,
  GalleryImage, HierarchyLevel, Meeting, MyClub, Note, Notification, Programme,
  PublicStatistics, RecruitmentDrive, Reimbursement, Reminder, ShowcaseClub, Sponsorship,
  SupportingDocument, Task, TimetableSession, ClaimWorkflow, Pipeline,
} from './types';

type Options<T> = Omit<UseQueryOptions<T, Error, T>, 'queryKey' | 'queryFn'>;

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

/**
 * The workspace shell. ONE request where there used to be thirteen.
 *
 * Everything else on this screen is a per-tab query below, so opening a tab
 * fetches only that tab's data — and only if it is not already fresh.
 */
export function useClubBootstrap(clubId: string | null) {
  return useQuery({
    queryKey: clubKeys.bootstrap(clubId ?? ''),
    queryFn: async () => parseClubBootstrap(await api.get<ClubBootstrap>(`/clubs/${clubId}/bootstrap`)) as ClubBootstrap,
    enabled: Boolean(clubId),
  });
}

export function useMyClubs() {
  return useQuery({
    queryKey: clubKeys.myMemberships(),
    queryFn: () => api.get<MyClub[]>('/clubs/my-memberships'),
  });
}

/** Generic per-tab club sub-resource. One cache entry per resource, never per tab. */
function useClubResource<T>(clubId: string | null, resource: string, options?: Options<T[]>) {
  return useQuery({
    queryKey: clubKeys.resource(clubId ?? '', resource),
    queryFn: () => api.get<T[]>(`/clubs/${clubId}/${resource}`),
    enabled: Boolean(clubId),
    ...options,
  });
}

export const useClubEvents = (id: string | null) => useClubResource<ClubEvent>(id, 'events');
export const useClubMembers = (id: string | null) => useClubResource<ClubMember>(id, 'members');
export const useClubBudgets = (id: string | null) => useClubResource<Budget>(id, 'budgets');
export const useClubReimbursements = (id: string | null) =>
  useClubResource<Reimbursement>(id, 'reimbursements');
export const useClubSponsorships = (id: string | null) =>
  useClubResource<Sponsorship>(id, 'sponsorships');
export const useClubAnnouncements = (id: string | null) =>
  useClubResource<Announcement>(id, 'announcements');
export const useClubRecruitmentDrives = (id: string | null) =>
  useClubResource<RecruitmentDrive>(id, 'recruitment-drives');
export const useClubAnnualPlans = (id: string | null) =>
  useClubResource<AnnualPlan>(id, 'annual-plans');
export const useClubDocuments = (id: string | null) =>
  useClubResource<ClubDocument>(id, 'documents');
export const useClubKnowledgeBase = (id: string | null) =>
  useClubResource<ClubDocument>(id, 'knowledge-base');
export const useClubTasks = (id: string | null) => useClubResource<Task>(id, 'tasks');
export const useClubHierarchy = (id: string | null) =>
  useClubResource<HierarchyLevel>(id, 'hierarchy');

export function useClubAnalytics(clubId: string | null, academicYear: string, enabled = true) {
  return useQuery({
    queryKey: clubKeys.analytics(clubId ?? '', academicYear),
    queryFn: () =>
      api.get<Record<string, unknown>>(
        `/clubs/${clubId}/analytics?academic_year=${encodeURIComponent(academicYear)}`,
      ),
    enabled: Boolean(clubId) && enabled,
  });
}

export function useClubReport(clubId: string | null, reportType: string, path: string, enabled = true) {
  return useQuery({
    queryKey: clubKeys.report(clubId ?? '', reportType),
    queryFn: () => api.get<Record<string, unknown>>(path),
    enabled: Boolean(clubId) && enabled,
  });
}

export function usePlansAwaitingMyReview() {
  return useQuery({
    queryKey: clubKeys.awaitingReview(),
    queryFn: () => api.get<AwaitingReviewPlan[]>('/clubs/annual-plans/awaiting-my-review'),
  });
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export function useClaims() {
  return useQuery({ queryKey: claimKeys.list(), queryFn: () => api.get<Claim[]>('/claims') });
}

export function useTimetable(programme?: string | null, semester?: string | null, section?: string | null) {
  return useQuery({
    queryKey: claimKeys.timetable(programme ?? '', semester ?? '', section ?? ''),
    queryFn: async () =>
      parseTimetable(
        await api.get<TimetableSession[]>(
          `/claims/timetable?programme=${encodeURIComponent(programme ?? '')}` +
          `&semester=${encodeURIComponent(semester ?? '')}` +
          `&section=${encodeURIComponent(section ?? '')}`,
        ),
      ) as TimetableSession[],
    enabled: Boolean(programme && semester && section),
    // The timetable changes once a semester. There is no reason to re-fetch it
    // while someone fills in a form.
    staleTime: 10 * 60_000,
  });
}

/**
 * The claim state machine, from the server.
 *
 * ClaimStatusStepper used to carry its own hardcoded copy of the stage list
 * and labels, which is how it came to hardcode 'approved' onto stage 3 as a
 * workaround for a backend bug. It changes about once a year, so it caches
 * for the whole session.
 */
export function useClaimWorkflow() {
  return useQuery({
    queryKey: claimKeys.workflow(),
    queryFn: () => api.get<ClaimWorkflow>('/claims/workflow'),
    staleTime: Infinity,
  });
}

export function useClaimDocuments(claimId: string | null) {
  return useQuery({
    queryKey: claimKeys.documents(claimId ?? ''),
    queryFn: () => api.get<SupportingDocument[]>(`/claims/${claimId}/documents`),
    enabled: Boolean(claimId),
  });
}

// ---------------------------------------------------------------------------
// Faculty workspace
// ---------------------------------------------------------------------------

export const useNotes = () =>
  useQuery({ queryKey: facultyKeys.notes(), queryFn: () => api.get<Note[]>('/faculty/notes') });
export const useFacultyDocuments = () =>
  useQuery({ queryKey: facultyKeys.documents(), queryFn: () => api.get<FacultyDocument[]>('/faculty/documents') });
export const useMeetings = () =>
  useQuery({ queryKey: facultyKeys.meetings(), queryFn: () => api.get<Meeting[]>('/faculty/meetings') });
export const useReminders = () =>
  useQuery({ queryKey: facultyKeys.reminders(), queryFn: () => api.get<Reminder[]>('/faculty/reminders') });

export function useDirectory(search: string, enabled = true) {
  return useQuery({
    queryKey: facultyKeys.directory(search),
    queryFn: () =>
      api.get<DirectoryEntry[]>(
        `/users/directory${search ? `?q=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled,
    // Keeps the previous list on screen while a new search is in flight,
    // instead of flashing an empty state on every keystroke.
    placeholderData: previous => previous,
  });
}

// ---------------------------------------------------------------------------
// Platform-wide
// ---------------------------------------------------------------------------

export const useTasks = () =>
  useQuery({ queryKey: platformKeys.tasks, queryFn: () => api.get<Task[]>('/tasks') });

export const useCalendar = (enabled = true) =>
  useQuery({ queryKey: platformKeys.calendar, queryFn: () => api.get<CalendarEvent[]>('/calendar'), enabled });

export const useNotifications = () =>
  useQuery({
    queryKey: platformKeys.notifications,
    queryFn: () => api.get<Notification[]>('/notifications'),
    // The bell should feel live without hammering the endpoint.
    refetchInterval: 60_000,
  });

export const useActionQueue = () =>
  useQuery({
    queryKey: platformKeys.actionQueue,
    queryFn: async () => parseActionQueue(await api.get<ActionQueue>('/me/action-queue')) as ActionQueue,
  });

/**
 * Where every item in both workflows is stuck.
 *
 * Short staleTime: this is an operational view, and someone watching it wants
 * to see an approval land.
 */
export const usePipeline = () =>
  useQuery({
    queryKey: platformKeys.pipeline,
    queryFn: () => api.get<Pipeline>('/me/pipeline'),
    staleTime: 15_000,
  });

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: platformKeys.search(query),
    queryFn: () => api.get<Record<string, unknown[]>>(`/search?q=${encodeURIComponent(query)}`),
    // The modal used to fire a request per keystroke. Two characters is the
    // server's own minimum, and the cache dedupes repeats.
    enabled: query.trim().length >= 2,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Public content
// ---------------------------------------------------------------------------

export const usePublicStatistics = () =>
  useQuery({ queryKey: contentKeys.statistics, queryFn: () => api.get<PublicStatistics>('/content/statistics') });
export const useProgrammes = () =>
  useQuery({ queryKey: contentKeys.courses, queryFn: () => api.get<Programme[]>('/content/courses') });
export const useGallery = () =>
  useQuery({ queryKey: contentKeys.gallery, queryFn: () => api.get<GalleryImage[]>('/content/gallery') });
export const useClubShowcase = () =>
  useQuery({ queryKey: contentKeys.clubsShowcase, queryFn: () => api.get<ShowcaseClub[]>('/content/clubs-showcase') });

// ---------------------------------------------------------------------------
// Mutations, and the invalidation matrix
// ---------------------------------------------------------------------------

/**
 * What each kind of write makes stale.
 *
 * Writing this down in one place is what retires the sixteen `reloadTick`
 * bumps that used to be scattered through ClubsDashboard. A `reloadTick`
 * refetches EVERYTHING; an invalidation refetches only what actually changed.
 */
export function useClubMutation<TBody, TResult>(
  clubId: string | null,
  mutate: (body: TBody) => Promise<TResult>,
  invalidates: string[],
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutate,
    onSuccess: () => {
      if (!clubId) return;
      for (const resource of invalidates) {
        queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, resource) });
      }
      // Counters on the shell are derived from these lists, so the shell is
      // stale whenever any of them is.
      queryClient.invalidateQueries({ queryKey: clubKeys.bootstrap(clubId) });
    },
  });
}

/** Invalidate everything a claims action can affect. */
export function useClaimsInvalidator() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: claimKeys.all });
    queryClient.invalidateQueries({ queryKey: platformKeys.actionQueue });
    queryClient.invalidateQueries({ queryKey: platformKeys.notifications });
  };
}

/** Invalidate everything an annual-plan review can affect. */
export function usePlanReviewInvalidator() {
  const queryClient = useQueryClient();
  return (clubId?: string) => {
    queryClient.invalidateQueries({ queryKey: clubKeys.awaitingReview() });
    queryClient.invalidateQueries({ queryKey: platformKeys.actionQueue });
    if (clubId) {
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'annual-plans') });
      queryClient.invalidateQueries({ queryKey: clubKeys.bootstrap(clubId) });
    }
  };
}

/**
 * Prefetch a tab's data when the user hovers its button, so the click paints
 * from cache. Costs one request the user was about to make anyway.
 */
export function useClubPrefetch(clubId: string | null) {
  const queryClient = useQueryClient();
  return (resource: string) => {
    if (!clubId) return;
    queryClient.prefetchQuery({
      queryKey: clubKeys.resource(clubId, resource),
      queryFn: () => api.get(`/clubs/${clubId}/${resource}`),
    });
  };
}
