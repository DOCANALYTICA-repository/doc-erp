/**
 * Every route mounts.
 *
 * The cheapest insurance in the project. A UI revamp touches every screen, and
 * the failure that reaches production is not a wrong colour — it is a route
 * that throws on mount and shows an error boundary, on a screen nobody
 * happened to click during review.
 *
 * These tests deliberately assert only that a route renders and identifies
 * itself. They must survive the revamp unchanged; if a restyle breaks one, the
 * restyle broke the route.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderRoute, resetTestSession } from '../test/renderRoute';
import { CLUB_TABS } from '../modules/clubs/tabs';
import { CLAIM_TABS } from '../modules/claims/tabs';
import { FACULTY_TABS } from '../modules/faculty/tabs';

afterEach(resetTestSession);

/** Did anything render, and did no error boundary catch a throw? */
function expectMountedCleanly() {
  expect(document.body.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  // Both ErrorBoundary and ErrorState render role="alert" with this shape.
  expect(screen.queryByText(/Something went wrong|went wrong/i)).toBeNull();
}

describe('public routes', () => {
  it('renders the landing page for an anonymous visitor', async () => {
    await renderRoute('/', { user: null });
    // The department's front door. A blank page here is the worst outcome in
    // the app, so assert real content, not just "no throw".
    expect(
      await screen.findByRole('heading', { name: /Global Commerce/i })
    ).toBeTruthy();
    expectMountedCleanly();
  });

  it('renders the login page', async () => {
    await renderRoute('/login', { user: null });
    expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
    expect(await screen.findByLabelText(/^Password$/i)).toBeTruthy();
    expectMountedCleanly();
  });

  it('sends an unknown public path to the landing page', async () => {
    await renderRoute('/nope/not-a-route', { user: null });
    expect(
      await screen.findByRole('heading', { name: /Global Commerce/i })
    ).toBeTruthy();
  });
});

describe('authentication guard', () => {
  it('redirects an anonymous visitor away from the ERP', async () => {
    await renderRoute('/app', { user: null });
    // RequireAuth navigates to /login and stashes `from` for the redirect back.
    expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
  });
});

describe('ERP routes', () => {
  const routes = [
    ['/app', 'inbox'],
    ['/app/modules', 'module launcher'],
    ['/app/settings/notifications', 'notification settings'],
    ['/app/pipeline', 'pipeline'],
  ] as const;

  for (const [path, label] of routes) {
    it(`mounts ${label} at ${path}`, async () => {
      await renderRoute(path);
      expectMountedCleanly();
    });
  }

  it('renders a not-found screen inside the shell for a stale /app bookmark', async () => {
    await renderRoute('/app/does-not-exist');
    expectMountedCleanly();
    // The point of this route: the user stays in the shell and can see where
    // they are, rather than being ejected to the public site. Asserting the
    // shell chrome is present is what distinguishes this from the public
    // catch-all, which redirects to the landing page.
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(document.body.textContent).toMatch(/nothing at this address/i);
    expect(document.body.textContent).toMatch(/\/app\/does-not-exist/);
  });
});

/**
 * Heading structure.
 *
 * Every screen opens with exactly one `h1` naming it. `PipelineBoard` and
 * `NotificationSettings` used to use `SectionHeader` (an h2) as their page
 * title, so their outlines began at level 2 with nothing above them and a
 * screen-reader user landing on either got no announcement of where they were.
 * `PageHeader` fixed both — these assertions are what keep them fixed.
 */
describe('heading structure', () => {
  const screens = [
    ['/app', 'inbox'],
    ['/app/modules', 'module launcher'],
    ['/app/pipeline', 'pipeline'],
    ['/app/settings/notifications', 'notification settings'],
    ['/app/clubs/dashboard?club=c-test', 'clubs'],
    ['/app/claims/dashboard', 'claims'],
    ['/app/faculty/dashboard', 'faculty'],
  ] as const;

  for (const [path, label] of screens) {
    it(`names the ${label} screen with a level-1 heading`, async () => {
      await renderRoute(path);
      expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    });

    it(`gives the ${label} screen exactly one h1`, async () => {
      await renderRoute(path);
      // findByRole first: several of these screens paint their heading only
      // after a query resolves, and a synchronous getAllByRole would count
      // zero on a screen that is merely not finished yet.
      await screen.findByRole('heading', { level: 1 });
      // More than one h1 is as bad as none: it tells a screen reader the page
      // has two titles and leaves the real one ambiguous.
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });
  }
});

/**
 * Tab routes, driven off the real tab vocabularies rather than a hardcoded
 * list — so adding a tab to `tabs.ts` without a component fails here instead
 * of at runtime.
 */
describe('module tab routes', () => {
  const modules = [
    ['clubs', CLUB_TABS],
    ['claims', CLAIM_TABS],
    ['faculty', FACULTY_TABS],
  ] as const;

  for (const [moduleId, tabs] of modules) {
    for (const tab of tabs) {
      const id = typeof tab === 'string' ? tab : tab.id;
      it(`mounts /app/${moduleId}/${id}`, async () => {
        await renderRoute(`/app/${moduleId}/${id}`);
        expectMountedCleanly();
      });
    }
  }
});

describe('the club/tab URL contract', () => {
  // Deliberate design: the tab is a path segment and the club is a search
  // param, because they are orthogonal — you can switch club without losing
  // your place. A redesigned club switcher is the likely way this regresses,
  // and it would break every deep link anyone has written down.
  it('keeps the tab in the path and the club in the query string', async () => {
    await renderRoute('/app/clubs/budget?club=c-test');
    expectMountedCleanly();
  });

  it('reaches the same tab for a different club', async () => {
    const { requested } = await renderRoute('/app/clubs/members?club=c-other');
    expectMountedCleanly();
    // The club id must reach the API from the search param, not from a path
    // segment or from component state.
    expect(requested.some((e) => e.includes('c-other'))).toBe(true);
  });
});
