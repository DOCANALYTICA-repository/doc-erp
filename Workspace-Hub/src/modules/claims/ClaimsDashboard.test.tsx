import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

import type { UserState } from '../../context/useStore';
import { ClaimsDashboard } from './ClaimsDashboard';
import { PEOPLE, renderScreen, resetScreen } from './yellow-forms/testHarness';

afterEach(resetScreen);

function mountClaims(path: string, user: UserState, capabilities: Record<string, string> = {}) {
  return renderScreen(<ClaimsDashboard />, { path, routePath: '/app/claims/:tab', user, capabilities });
}

/**
 * Every tab the strip offers. jsdom measures nothing, so OverflowList keeps
 * one link visible and moves the rest into its "more" menu.
 */
async function tabLabels(): Promise<string[]> {
  const nav = await screen.findByRole('navigation', { name: 'Claims sections' });
  const labels = [
    ...within(nav).getAllByRole('link'),
    ...screen.queryAllByRole('menuitem', { hidden: true }),
  ].map(item => item.textContent?.trim() ?? '');
  return Array.from(new Set(labels));
}

function location(): string {
  return screen.getByTestId('location').textContent ?? '';
}

describe('the Yellow Forms tab for reviewers', () => {
  it('is hidden from a reviewer without a yellow-form permission', async () => {
    mountClaims('/app/claims/review_queue', PEOPLE.faculty);
    expect(await tabLabels()).toEqual(['Review Queue', 'Approved & Actioned']);
  });

  it('bounces that reviewer off a yellow_forms URL', async () => {
    mountClaims('/app/claims/yellow_forms', PEOPLE.faculty);
    await waitFor(() => expect(location()).toBe('/app/claims/review_queue'));
  });

  it.each([
    ['Faculty Coordinator', PEOPLE.facultyCoordinator],
    ['Associate HOD', PEOPLE.associateHod],
    ['Claims Coordinator', PEOPLE.claimsCoordinator],
    ['super_admin', PEOPLE.admin],
  ])('is shown to the %s', async (_, user) => {
    mountClaims('/app/claims/review_queue', user);
    expect(await tabLabels()).toContain('Yellow Forms');
  });

  it('is shown to an oversight holder, whose Pipeline links land on it', async () => {
    mountClaims('/app/claims/review_queue', PEOPLE.hod);
    expect(await tabLabels()).toContain('Yellow Forms');
  });
});

describe('where a reviewer lands', () => {
  it('sends the Claims Coordinator to yellow forms', async () => {
    mountClaims('/app/claims/dashboard', PEOPLE.claimsCoordinator);
    await waitFor(() => expect(location()).toBe('/app/claims/yellow_forms'));
    expect(await screen.findByRole('heading', { name: 'Claim sheets awaiting you' })).toBeTruthy();
  });

  it('sends the Associate HOD to yellow forms', async () => {
    mountClaims('/app/claims/dashboard', PEOPLE.associateHod);
    await waitFor(() => expect(location()).toBe('/app/claims/yellow_forms'));
  });

  it('keeps the form a link asked for when it redirects', async () => {
    mountClaims('/app/claims/dashboard?open=paf_da_3', PEOPLE.associateHod);
    await waitFor(() => expect(location()).toBe('/app/claims/yellow_forms?open=paf_da_3'));
  });

  it.each([
    ['Faculty Coordinator', PEOPLE.facultyCoordinator],
    ['super_admin', PEOPLE.admin],
    ['subject faculty', PEOPLE.faculty],
  ])('keeps the %s on the claims review queue', async (_, user) => {
    mountClaims('/app/claims/dashboard', user);
    await waitFor(() => expect(location()).toBe('/app/claims/review_queue'));
  });
});

describe('the student side', () => {
  it('always offers students the Yellow Forms tab', async () => {
    mountClaims('/app/claims/dashboard', PEOPLE.student);
    expect(await tabLabels()).toEqual(['Overview', 'All Claims', 'New Submission', 'Yellow Forms']);
  });

  it('says clubs file co-curricular claims while individual ones are coming soon', async () => {
    mountClaims('/app/claims/dashboard', PEOPLE.student, {
      'claims.individual_co_curricular': 'coming_soon',
    });
    expect(
      await screen.findByText(
        'Medical attendance exemptions. Co-curricular claims (yellow forms) are filed by your club.',
      ),
    ).toBeTruthy();
  });

  it('keeps the old description once individual claims are live', async () => {
    mountClaims('/app/claims/dashboard', PEOPLE.student, { 'claims.individual_co_curricular': 'live' });
    expect(await screen.findByText('Medical and co-curricular attendance exemptions.')).toBeTruthy();
  });
});
