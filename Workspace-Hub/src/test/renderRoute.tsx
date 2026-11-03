/**
 * Render the real app at a real URL.
 *
 * This project had no `render()` call anywhere before the UI revamp — three
 * test files, all logic-only. That meant a refactor could break a route
 * outright and every test would still pass. This helper is the fix, and it is
 * deliberately the *only* piece of UI test infrastructure: it renders `<App />`
 * rather than isolated components, so it keeps working when the components
 * underneath it are rewritten.
 *
 * What it does NOT do is assert on markup, class names or layout. The pixels
 * changing is the point of the revamp; "the route still mounts and still says
 * what it is" is the invariant worth pinning.
 */
// Imported explicitly rather than relying on `globals: true`, matching the
// other test files here — `tsc --noEmit` is the lint step and does not pick up
// vitest's ambient globals.
import { vi, expect, type MockInstance } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import App from '../App';
import { useStore, type UserState } from '../context/useStore';
import { CLUB_TABS } from '../modules/clubs/tabs';

/** A super_admin, so permission-gated nav and tabs all render. */
export const TEST_USER: UserState = {
  id: 'u-test',
  email: 'admin@christuniversity.in',
  name: 'Test Admin',
  primary_role: 'super_admin',
  role_tags_str: '',
  status: 'active',
  permissions: ['*'],
};

/**
 * Canned responses, keyed by the leading fragment of the endpoint path.
 *
 * The four endpoints validated by `src/api/contracts.ts` need *structurally
 * valid* payloads, not `{}` — `lenient()` throws in DEV, and vitest runs in
 * DEV, so an under-specified mock surfaces as a confusing render crash rather
 * than a contract warning. Everything else can be empty; these tests care
 * whether a screen mounts, not what it shows.
 */
function mockResponse(endpoint: string): unknown {
  const path = endpoint.split('?')[0];

  if (path.startsWith('/auth/me')) return TEST_USER;
  if (path.includes('/action-queue')) return { items: [], total: 0 };
  if (path.startsWith('/claims/timetable')) return [];
  if (path.includes('/bootstrap')) {
    return {
      club: {
        id: 'c-test',
        name: 'Commerce Club',
        logo: null,
        category: 'Academic',
        description: 'Test club.',
      },
      relationship: 'member',
      capabilities: {
        can_read: true,
        can_write: true,
        can_edit_hierarchy: true,
        can_manage_settings: true,
        can_assign_tasks: true,
        can_approve_plan: true,
        can_manage_members: true,
        can_file_yellow_forms: true,
      },
      // Every tab, deliberately. `ClubsDashboard` redirects any tab absent
      // from this list back to the default, so a partial list would make the
      // per-tab smoke tests silently all assert the same screen.
      visible_tabs: CLUB_TABS.map((t) => t.id),
      // `members` and `events` are all `parseClubBootstrap` validates, but
      // `DashboardTab` also dereferences `budget_spent.toLocaleString()` and
      // `open_tasks` — so an under-specified mock throws inside the tab. Worth
      // noting that the contract schema does not cover either field.
      counters: { members: 0, events: 0, budget_spent: 0, open_tasks: 0 },
      hierarchy: [],
      members: [],
    };
  }
  // The club list gates the whole workspace: `ClubsDashboard` renders an
  // "you're not part of any club yet" empty state when it comes back empty,
  // so every club route needs at least one.
  if (path === '/clubs/my-memberships') {
    return [{ id: 'c-test', name: 'Commerce Club', logo: null, category: 'Academic' }];
  }
  // `/me/pipeline` returns an OBJECT, and PipelineBoard dereferences
  // `data.stages` and `data.total` — an empty array renders its error state
  // instead of the board.
  if (path === '/me/pipeline') {
    return { total: 0, stages: [], escalations: [] };
  }
  // Enough of a row for the reimbursements table to render rather than fall
  // through to its empty state.
  if (path.endsWith('/reimbursements')) {
    return [
      {
        id: 'r-test',
        requested_by: 'Test Member',
        amount: 1200,
        status: 'pending',
        receipt_url: null,
      },
    ];
  }
  if (path.startsWith('/content/statistics')) {
    return {
      total_students: 0,
      faculty_count: 0,
      number_of_clubs: 0,
      years_established: 0,
      founded_year: 1971,
    };
  }
  // Collection endpoints. A bare object would break `.map()` in list screens,
  // so default to an array and let object-shaped endpoints opt in above.
  return [];
}

export interface RenderRouteResult {
  /** Endpoints the screen actually requested — useful for asserting wiring. */
  requested: string[];
  /**
   * The api spies, per verb.
   *
   * `requested` mixes reads and writes, so "did this form actually submit?"
   * cannot be answered from it — a screen that fetches `/reimbursements` on
   * mount looks identical to one that posted to it. Count the verb instead:
   * `expect(spies.post).not.toHaveBeenCalled()`.
   */
  spies: Record<'get' | 'post' | 'put' | 'delete' | 'upload', MockInstance>;
  unmount: () => void;
}

/**
 * Mount the app at `path` with an authenticated session.
 *
 * Pass `user: null` for the anonymous case (public landing, login, and the
 * `RequireAuth` redirect).
 */
export async function renderRoute(
  path: string,
  options: {
    user?: UserState | null;
    /**
     * Endpoint path fragments that should reject instead of resolving.
     *
     * For asserting error states, which are otherwise unreachable in a test:
     * the mock always succeeds, so a screen's `isError` branch would never
     * render and a broken retry button would ship unnoticed.
     */
    failEndpoints?: string[];
  } = {}
): Promise<RenderRouteResult> {
  const { user = TEST_USER, failEndpoints = [] } = options;
  const requested: string[] = [];

  const { api, ApiError } = await import('../services/api');
  const record = (endpoint: string) => {
    requested.push(endpoint);
    if (failEndpoints.some(fragment => endpoint.includes(fragment))) {
      return Promise.reject(new ApiError(500, { detail: 'Simulated failure' })) as never;
    }
    // App re-reads the profile on restore; answer with the person this test signed in.
    if (endpoint.startsWith('/auth/me') && user) return Promise.resolve(user as never);
    return Promise.resolve(mockResponse(endpoint) as never);
  };
  const spies = {
    get: vi.spyOn(api, 'get').mockImplementation(record),
    post: vi.spyOn(api, 'post').mockImplementation(record),
    put: vi.spyOn(api, 'put').mockImplementation(record),
    delete: vi.spyOn(api, 'delete').mockImplementation(record),
    upload: vi.spyOn(api, 'upload').mockImplementation(record),
  };

  // Seed identity directly rather than driving the login form: these tests are
  // about routing, and `App`'s restore effect reads localStorage, which
  // `writeSession` populates.
  useStore.setState({
    user,
    token: user ? 'test-token' : null,
    capabilities: {},
    isSessionRestoring: false,
    isSearchOpen: false,
    isNotificationsOpen: false,
  });
  if (user) {
    // Via the real service rather than a literal storage key — the key is an
    // implementation detail of session.ts and has no business being duplicated
    // here.
    const { writeSession } = await import('../services/session');
    writeSession({ user: user as never, token: 'test-token', refreshToken: null, capabilities: {} });
  }

  // A per-test client with retries off: a retried failure would otherwise turn
  // a mock gap into a multi-second timeout instead of an immediate error.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const { unmount } = render(tree);

  // Every route below `/app` and the landing page are `React.lazy`, so the
  // first paint is always the Suspense fallback. Wait for it to clear.
  await waitFor(() => {
    expect(screen.queryByText(/Loading|Restoring your session/i)).toBeNull();
  });

  return { requested, spies, unmount };
}

/** Reset the store between tests so identity does not leak across cases. */
export function resetTestSession(): void {
  useStore.setState({
    user: null,
    token: null,
    capabilities: {},
    isSessionRestoring: true,
    isSearchOpen: false,
    isNotificationsOpen: false,
  });
  window.localStorage.clear();
  vi.restoreAllMocks();
}
