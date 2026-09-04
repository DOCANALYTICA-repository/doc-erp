import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { ErrorState } from '../../components/ui/ErrorState';
import { PageLoader } from '../../components/ui/PageLoader';
import { ClaimsProvider, useClaimsWorkspace } from './ClaimsContext';
import {
  CLAIMS_DEFAULT_TAB, CLAIMS_REVIEWER_TAB, REVIEWER_CLAIM_TABS, STUDENT_CLAIM_TABS,
  isClaimTab,
} from './tabs';

import { MyClaimsTab } from './tabs/MyClaimsTab';
import { NewClaimTab } from './tabs/NewClaimTab';
import { OverviewTab } from './tabs/OverviewTab';
import { ReviewQueueTab } from './tabs/ReviewQueueTab';
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
};

const ClaimsShell: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();
  const { isReviewer, isLoading, isError, error, refetch } = useClaimsWorkspace();

  // Faculty cannot submit claims (backend-enforced), so they get only the
  // review queue rather than three tabs that would refuse them.
  const tabs = isReviewer ? REVIEWER_CLAIM_TABS : STUDENT_CLAIM_TABS;
  const allowed = new Set<string>(tabs.map(t => t.id));

  if (!isClaimTab(tab) || !allowed.has(tab)) {
    const fallback = isReviewer ? CLAIMS_REVIEWER_TAB : CLAIMS_DEFAULT_TAB;
    return <Navigate to={`/app/claims/${fallback}`} replace />;
  }

  const ActiveTab = TAB_COMPONENTS[tab];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col bg-slate-50">
      <TabStrip
        label="Claims sections"
        activeId={tab}
        items={tabs.map(item => ({
          id: item.id,
          label: item.label,
          to: `/app/claims/${item.id}`,
        }))}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6 md:p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Attendance claims
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isReviewer
              ? 'Claims routed to you for approval at your stage of the workflow.'
              : 'Medical and co-curricular attendance exemptions.'}
          </p>
        </header>

        {isLoading ? (
          <PageLoader label="Loading claims..." />
        ) : isError ? (
          <ErrorState title="Claims didn't load" error={error} onRetry={refetch} />
        ) : (
          <ActiveTab />
        )}
      </main>
    </div>
  );
};

export const ClaimsDashboard: React.FC = () => (
  <ClaimsProvider>
    <ClaimsShell />
  </ClaimsProvider>
);
