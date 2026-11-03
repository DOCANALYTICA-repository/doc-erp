import type { ReactElement } from 'react';
import { vi, type MockInstance } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastViewport } from '@astryxdesign/core/Toast';

import { api } from '../../../services/api';
import { useStore, type UserState } from '../../../context/useStore';
import { yellowFormKeys } from '../../../lib/queryKeys';
import { WORKFLOW_FIXTURE } from '../../yellow-forms/testFixtures';

/** What a mocked GET answers; `undefined` falls back to an empty list. An Error rejects. */
export type Responder = (endpoint: string) => unknown;

const FACULTY_BASE = [
  'public:view', 'claims:view_own', 'clubs:view', 'faculty:dashboard', 'claims:review_faculty',
];

function person(id: string, name: string, role: UserState['primary_role'], permissions: string[]): UserState {
  return {
    id,
    email: `${id}@christuniversity.in`,
    name,
    primary_role: role,
    role_tags_str: '',
    status: 'active',
    permissions,
  };
}

/** Permission sets as backend/app/core/rbac.py resolves them for these people. */
export const PEOPLE = {
  student: person('std_2611507', 'Affan Ahmed A', 'student', [
    'public:view', 'claims:submit', 'claims:view_own', 'clubs:view', 'events:register', 'tasks:view_own',
  ]),
  faculty: person('fac_subject_1', 'Prof. Subject', 'faculty', FACULTY_BASE),
  facultyCoordinator: person('fac_reynal', 'Dr. Reynal', 'faculty', [
    ...FACULTY_BASE, 'clubs:approve_plan', 'yellow_forms:approve_faculty_coordinator',
  ]),
  associateHod: person('fac_anusha', 'Dr. Anusha Iyer', 'faculty', [
    ...FACULTY_BASE, 'yellow_forms:approve_associate_hod', 'yellow_forms:view_all',
  ]),
  claimsCoordinator: person('fac_sharath', 'Sharath', 'faculty', [
    ...FACULTY_BASE, 'yellow_forms:review_claim_sheet', 'yellow_forms:view_all',
  ]),
  hod: person('fac_hod', 'Dr. HOD', 'faculty', [
    ...FACULTY_BASE, 'claims:approve_coordinator', 'clubs:approve_plan', 'rbac:assign_roles', 'yellow_forms:view_all',
  ]),
  admin: person('u-admin', 'Test Admin', 'super_admin', ['*']),
} as const;

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
};

/**
 * Mount one screen at a URL with a signed-in person and canned GETs. The
 * yellow-form workflow table is already cached, as it is after the first
 * screen. The current URL is readable from `getByTestId('location')`. Test-only.
 */
export function renderScreen(
  element: ReactElement,
  options: {
    path: string;
    routePath?: string;
    user: UserState;
    capabilities?: Record<string, string>;
    respond?: Responder;
  },
): { get: MockInstance; post: MockInstance; queryClient: QueryClient } {
  const { path, routePath = '*', user, capabilities = {}, respond } = options;

  useStore.setState({
    user,
    token: 'test-token',
    capabilities,
    isSessionRestoring: false,
    isSearchOpen: false,
    isNotificationsOpen: false,
  });

  const get = vi.spyOn(api, 'get').mockImplementation((endpoint: string) => {
    if (endpoint.split('?')[0] === '/yellow-forms/workflow') return Promise.resolve(WORKFLOW_FIXTURE) as never;
    const value = respond?.(endpoint);
    if (value instanceof Error) return Promise.reject(value) as never;
    return Promise.resolve(value === undefined ? [] : value) as never;
  });
  const post = vi.spyOn(api, 'post').mockResolvedValue({} as never);
  // Astryx's scroll lock restores the page position when a drawer closes; jsdom has no scrollTo.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  queryClient.setQueryData(yellowFormKeys.workflow(), WORKFLOW_FIXTURE);

  render(
    <QueryClientProvider client={queryClient}>
      <ToastViewport>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={element} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastViewport>
    </QueryClientProvider>,
  );

  return { get, post, queryClient };
}

export function resetScreen(): void {
  // Unmount while scrollTo is still stubbed: RTL's own cleanup runs after this hook.
  cleanup();
  useStore.setState({ user: null, token: null, capabilities: {}, isSessionRestoring: true });
  vi.restoreAllMocks();
}
