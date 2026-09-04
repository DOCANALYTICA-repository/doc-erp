import React from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useClubBootstrap, useClubPrefetch, useMyClubs } from '../../api/hooks';
import { clubKeys } from '../../lib/queryKeys';
import { ClubAvatar } from '../../components/ui/ClubAvatar';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/PageLoader';
import { ClubWorkspaceProvider } from './ClubWorkspaceContext';
import { CLUBS_DEFAULT_TAB, CLUB_TABS, TAB_RESOURCES, isClubTab } from './tabs';

import { AnalyticsTab } from './tabs/AnalyticsTab';
import { AnnouncementsTab } from './tabs/AnnouncementsTab';
import { AnnualPlanTab } from './tabs/AnnualPlanTab';
import { BudgetTab } from './tabs/BudgetTab';
import { DashboardTab } from './tabs/DashboardTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { EventsTab } from './tabs/EventsTab';
import { MembersTab } from './tabs/MembersTab';
import { RecruitmentTab } from './tabs/RecruitmentTab';
import { ReimbursementsTab } from './tabs/ReimbursementsTab';
import { ReportsTab } from './tabs/ReportsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { SponsorshipsTab } from './tabs/SponsorshipsTab';
import { StructureTab } from './tabs/StructureTab';
import { TasksTab } from './tabs/TasksTab';
import { TabStrip } from '../../components/ui/TabStrip';

/**
 * The Clubs workspace shell.
 *
 * This file was 1,030 lines with 41 useState slots and fifteen tab bodies
 * inlined into one component. It is now a router: it resolves which club and
 * which tab from the URL, loads the shell payload once, and hands both to a
 * tab file that owns its own query and its own form state.
 *
 * Two things are deliberate:
 *
 *  - The TAB is a path segment and the CLUB is a search param, because they
 *    are orthogonal. You change club without changing tab, and a deep link to
 *    "the Budget tab of the Commerce Club" is now something you can paste to a
 *    colleague — it was not expressible at all before.
 *
 *  - The visible tabs come from the SERVER (bootstrap.visible_tabs), not from
 *    this list. A Faculty Coordinator is not a member and cannot file a
 *    reimbursement; rendering that tab for them would be the UI promising
 *    something the API refuses.
 */
const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: DashboardTab,
  members: MembersTab,
  structure: StructureTab,
  tasks: TasksTab,
  recruitment: RecruitmentTab,
  events: EventsTab,
  announcements: AnnouncementsTab,
  budget: BudgetTab,
  reimbursements: ReimbursementsTab,
  sponsorships: SponsorshipsTab,
  'annual-plan': AnnualPlanTab,
  documents: DocumentsTab,
  reports: ReportsTab,
  analytics: AnalyticsTab,
  settings: SettingsTab,
};

export const ClubsDashboard: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const myClubs = useMyClubs();
  const clubs = myClubs.data ?? [];

  // ?club= wins; otherwise fall back to the first club this user can open.
  const requestedClubId = searchParams.get('club');
  const clubId = requestedClubId ?? clubs[0]?.id ?? null;

  const bootstrap = useClubBootstrap(clubId);
  const prefetch = useClubPrefetch(clubId);

  const refreshShell = React.useCallback(() => {
    if (clubId) queryClient.invalidateQueries({ queryKey: clubKeys.bootstrap(clubId) });
  }, [clubId, queryClient]);

  if (myClubs.isLoading) return <PageLoader label="Loading your clubs..." />;
  if (myClubs.isError) {
    return (
      <div className="p-8">
        <ErrorState title="Couldn't load your clubs" error={myClubs.error} onRetry={() => void myClubs.refetch()} />
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title="You're not part of any club yet"
          description="Clubs you join, or are assigned to oversee, will appear here."
        />
      </div>
    );
  }

  if (!isClubTab(tab)) {
    return <Navigate to={`/app/clubs/${CLUBS_DEFAULT_TAB}${location.search}`} replace />;
  }

  if (bootstrap.isLoading) return <PageLoader label="Opening the workspace..." />;
  if (bootstrap.isError || !bootstrap.data) {
    return (
      <div className="p-8">
        <ErrorState
          title="This club's workspace didn't load"
          error={bootstrap.error}
          onRetry={() => void bootstrap.refetch()}
        />
      </div>
    );
  }

  const { club, visible_tabs: visibleTabs } = bootstrap.data;
  const tabsForViewer = CLUB_TABS.filter(t => visibleTabs.includes(t.id));

  // A tab the server says this viewer cannot see — from a stale bookmark, or
  // switching to a club where they have a different relationship.
  if (!visibleTabs.includes(tab)) {
    return <Navigate to={`/app/clubs/${CLUBS_DEFAULT_TAB}${location.search}`} replace />;
  }

  const ActiveTab = TAB_COMPONENTS[tab];

  const switchClub = (nextClubId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('club', nextClubId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col bg-slate-50">
      {clubs.length > 1 ? (
        <div className="flex w-full items-center gap-2 border-b border-slate-200 bg-white px-6 py-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="club-selector">
            Club
          </label>
          <select
            id="club-selector"
            value={clubId ?? ''}
            onChange={e => switchClub(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900"
          >
            {clubs.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.relationship === 'faculty_coordinator' ? ' (you oversee this club)' : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <TabStrip
        label="Club workspace sections"
        activeId={tab}
        items={tabsForViewer.map(item => ({
          id: item.id,
          label: item.label,
          to: `/app/clubs/${item.id}?${searchParams.toString()}`,
          onHover: () => (TAB_RESOURCES[item.id] ?? []).forEach(prefetch),
        }))}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6 md:p-8">
        <header className="mb-8 flex items-center gap-4">
          <ClubAvatar name={club.name} logo={club.logo} />
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-600">
              {club.category} club
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{club.name}</h1>
            {club.description ? (
              <p className="mt-1 text-sm text-slate-500">{club.description}</p>
            ) : null}
          </div>
        </header>

        <ClubWorkspaceProvider value={{ clubId: club.id, bootstrap: bootstrap.data, refreshShell }}>
          <ActiveTab />
        </ClubWorkspaceProvider>
      </main>
    </div>
  );
};
