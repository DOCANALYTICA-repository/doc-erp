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
import { YellowFormsTab } from './tabs/YellowFormsTab';
import { TabStrip } from '../../components/ui/TabStrip';
import { PageShell } from '../../components/ui/PageShell';
import { PageHeader } from '../../components/ui/PageHeader';

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
  'yellow-forms': YellowFormsTab,
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
    <PageShell
      maxWidth="5xl"
      toolbar={
        <>
          {/*
            * The club switcher writes to the ?club= SEARCH PARAM, never to the
            * path. Tab and club are orthogonal by design — switching club must
            * keep you on the tab you were reading — and every deep link anyone
            * has saved depends on it. See the contract test in
            * src/routes/routes.smoke.test.tsx.
            */}
          {clubs.length > 1 ? (
            <div className="flex w-full items-center gap-2 border-b border-border bg-card px-6 py-2">
              <label
                className="text-xs font-semibold uppercase tracking-wide text-secondary"
                htmlFor="club-selector"
              >
                Club
              </label>
              <select
                id="club-selector"
                value={clubId ?? ''}
                onChange={e => switchClub(e.target.value)}
                className="rounded-full border border-border bg-card px-3 py-1 text-sm text-primary"
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
        </>
      }
    >
      <PageHeader
        leading={<ClubAvatar name={club.name} logo={club.logo} />}
        eyebrow={`${club.category} club`}
        title={club.name}
        description={club.description ?? undefined}
      />

      <ClubWorkspaceProvider value={{ clubId: club.id, bootstrap: bootstrap.data, refreshShell }}>
        <ActiveTab />
      </ClubWorkspaceProvider>
    </PageShell>
  );
};
