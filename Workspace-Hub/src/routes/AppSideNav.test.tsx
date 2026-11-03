import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { PEOPLE, renderScreen, resetScreen } from '../modules/claims/yellow-forms/testHarness';
import { AppSideNav } from './AppSideNav';

afterEach(resetScreen);

function mountNav(user: (typeof PEOPLE)[keyof typeof PEOPLE]) {
  renderScreen(<AppSideNav />, {
    path: '/app',
    user,
    respond: endpoint => (endpoint === '/me/action-queue' ? { items: [], total: 0 } : undefined),
  });
}

describe('the Pipeline link', () => {
  it.each([
    ['Associate HOD', PEOPLE.associateHod],
    ['Claims Coordinator', PEOPLE.claimsCoordinator],
  ])('is offered to the %s, who holds yellow_forms:view_all', async (_, user) => {
    mountNav(user);
    expect(await screen.findByText('Pipeline')).toBeTruthy();
  });

  it('is still withheld from someone with no oversight permission', async () => {
    mountNav(PEOPLE.faculty);
    await screen.findByText('Inbox');
    await waitFor(() => expect(screen.queryByText('Pipeline')).toBeNull());
  });
});
