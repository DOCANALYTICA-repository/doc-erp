import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastViewport } from '@astryxdesign/core/Toast';

import { api } from '../../../services/api';
import { yellowFormKeys } from '../../../lib/queryKeys';
import type { ClubBootstrap } from '../../../api/types';
import { ClubWorkspaceProvider } from '../ClubWorkspaceContext';
import { WORKFLOW_FIXTURE } from '../../yellow-forms/testFixtures';

export const TEST_CLUB_ID = 'club_doc_analytica';

export function testBootstrap(canFileYellowForms: boolean): ClubBootstrap {
  return {
    club: { id: TEST_CLUB_ID, name: 'DOC Analytica', category: 'Academic', logo: null, description: null },
    relationship: 'member',
    capabilities: {
      can_read: true,
      can_write: true,
      can_edit_hierarchy: false,
      can_manage_settings: false,
      can_assign_tasks: false,
      can_approve_plan: false,
      can_manage_members: false,
      can_file_yellow_forms: canFileYellowForms,
    },
    visible_tabs: ['dashboard', 'yellow-forms'],
    counters: { members: 0, events: 0, open_tasks: 0, pending_reimbursements: 0, budget_allocated: 0, budget_spent: 0 },
    hierarchy: [],
    members: [],
  } as unknown as ClubBootstrap;
}

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

export function currentLocation(): string {
  return screen.getByTestId('location').textContent ?? '';
}

/**
 * Stub `api.get` by path: the first key the endpoint's path ends with wins.
 * Anything unmatched resolves to an empty list, like the app-level test mock.
 */
export function stubGet(responses: Record<string, unknown>) {
  return vi.spyOn(api, 'get').mockImplementation(((endpoint: string) => {
    const path = endpoint.split('?')[0];
    const key = Object.keys(responses).find(fragment => path.endsWith(fragment));
    return Promise.resolve((key ? responses[key] : []) as never);
  }) as typeof api.get);
}

/**
 * Render inside what the club workspace provides: a query client with the
 * yellow-form workflow cached, a router at the Yellow Forms tab, the toast
 * viewport and the workspace context. Test-only.
 */
export function renderInClubWorkspace(
  ui: ReactElement,
  {
    canFileYellowForms = true,
    path = `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}`,
  }: { canFileYellowForms?: boolean; path?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData(yellowFormKeys.workflow(), WORKFLOW_FIXTURE);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <ToastViewport>
          <ClubWorkspaceProvider
            value={{ clubId: TEST_CLUB_ID, bootstrap: testBootstrap(canFileYellowForms), refreshShell: () => {} }}
          >
            {ui}
            <LocationProbe />
          </ClubWorkspaceProvider>
        </ToastViewport>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, ...result };
}
