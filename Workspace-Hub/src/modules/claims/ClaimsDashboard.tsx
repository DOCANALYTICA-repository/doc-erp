import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

import { ErrorState } from '../../components/ui/ErrorState';
import { PageShell } from '../../components/ui/PageShell';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/PageSkeleton';
import { useStore } from '../../context/useStore';
import { ClaimsProvider, useClaimsWorkspace } from './ClaimsContext';
import {
  CO_CURRICULAR_CAPABILITY, YELLOW_FORMS_TAB, claimTabsFor, claimsLandingTab, isClaimTab,
} from './tabs';

import { MyClaimsTab } from './tabs/MyClaimsTab';
import { NewClaimTab } from './tabs/NewClaimTab';
import { OverviewTab } from './tabs/OverviewTab';
import { ReviewQueueTab } from './tabs/ReviewQueueTab';
import { ReviewedClaimsTab } from './tabs/ReviewedClaimsTab';
import { YellowFormsTab } from './tabs/YellowFormsTab';
import { TabStrip } from '../../components/ui/TabStrip';

/**
 * The Claims workspace shell.
 *
 * 724 lines down to a router. As with Clubs, the tab is a real path segment,
 * so a reviewer can bookmark their queue and Back works.
 */
const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: OverviewTab,
  my_claims: MyClaimsTab,
  new_claim: NewClaimTab,
  review_queue: ReviewQueueTab,
  reviewed: ReviewedClaimsTab,
  yellow_forms: YellowFormsTab,
};

const ClaimsShell: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  const { isReviewer, isLoading, isError, error, refetch } = useClaimsWorkspace();
  const hasPermission = useStore(s => s.hasPermission);
  const user = useStore(s => s.user);
  const coCurricularLive = useStore(s => s.isEnabled(CO_CURRICULAR_CAPABILITY));

  // Faculty cannot submit claims (backend-enforced), so they get only the
  // review queue rather than three tabs that would refuse them.
  const tabs = claimTabsFor(isReviewer, hasPermission);
  const allowed = new Set<string>(tabs.map(t => t.id));

  if (!isClaimTab(tab) || !allowed.has(tab)) {
    const landing = claimsLandingTab(isReviewer, user?.permissions ?? []);
    // Keep ?open=, so a deep link that lands on the wrong tab still opens its form.
    return <Navigate to={{ pathname: `/app/claims/${landing}`, search: location.search }} replace />;
  }

  const ActiveTab = TAB_COMPONENTS[tab];
  // Yellow forms load their own lists, so the claims list must not gate them.
  const dependsOnClaims = tab !== YELLOW_FORMS_TAB;

  return (
    <PageShell
      maxWidth="5xl"
      toolbar={
        <TabStrip
          label="Claims sections"
          activeId={tab}
          items={tabs.map(item => ({
            id: item.id,
            label: item.label,
            to: `/app/claims/${item.id}`,
          }))}
        />
      }
    >
      <PageHeader
        title="Attendance claims"
        description={
          isReviewer
            ? 'Claims routed to you for approval at your stage of the workflow.'
            : coCurricularLive
              ? 'Medical and co-curricular attendance exemptions.'
              : 'Medical attendance exemptions. Co-curricular claims (yellow forms) are filed by your club.'
        }
      />

      {dependsOnClaims && isLoading ? (
        <PageSkeleton variant="table" label="Loading claims" />
      ) : dependsOnClaims && isError ? (
        <ErrorState title="Claims didn't load" error={error} onRetry={refetch} />
      ) : (
        <ActiveTab />
      )}
    </PageShell>
  );
};

export const ClaimsDashboard: React.FC = () => (
  <ClaimsProvider>
    <ClaimsShell />
  </ClaimsProvider>
);
