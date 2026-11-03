import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ClaimsDashboard } from '../ClaimsDashboard';
import { PEOPLE, renderScreen, resetScreen } from '../yellow-forms/testHarness';

afterEach(resetScreen);

const COMING_SOON_COPY =
  "Individual yellow forms are coming in a future release. For now, co-curricular claims are filed by your club — ask your club's leadership to add you to their pre-approval.";

function mountNewClaim(capabilities: Record<string, string>) {
  return renderScreen(<ClaimsDashboard />, {
    path: '/app/claims/new_claim',
    routePath: '/app/claims/:tab',
    user: PEOPLE.student,
    capabilities,
  });
}

describe('the claim category step', () => {
  it('greys out co-curricular while individual yellow forms are coming soon', async () => {
    const user = userEvent.setup();
    mountNewClaim({ 'claims.individual_co_curricular': 'coming_soon' });

    const medical = await screen.findByRole('radio', { name: /Medical/ });
    const coCurricular = screen.getByRole('radio', { name: /Co-curricular/ });

    expect(medical).toHaveAttribute('aria-checked', 'true');
    expect(coCurricular).toHaveAttribute('aria-disabled', 'true');
    expect(coCurricular).toHaveAttribute('aria-checked', 'false');
    expect(coCurricular).toHaveTextContent('Coming soon');
    expect(coCurricular).toHaveAccessibleDescription(COMING_SOON_COPY);

    await user.click(coCurricular);
    expect(coCurricular).toHaveAttribute('aria-checked', 'false');
    expect(medical).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps medical fully working while co-curricular is unavailable', async () => {
    const user = userEvent.setup();
    mountNewClaim({ 'claims.individual_co_curricular': 'coming_soon' });

    await screen.findByRole('radio', { name: /Medical/ });
    await user.click(screen.getByRole('button', { name: /next|continue/i }));
    expect(await screen.findByText('Which dates were you away?')).toBeTruthy();
  });

  it('lets a student choose co-curricular once the capability is live', async () => {
    const user = userEvent.setup();
    mountNewClaim({ 'claims.individual_co_curricular': 'live' });

    const coCurricular = await screen.findByRole('radio', { name: /Co-curricular/ });
    expect(coCurricular).not.toHaveAttribute('aria-disabled');
    expect(coCurricular).not.toHaveTextContent('Coming soon');

    await user.click(coCurricular);
    expect(coCurricular).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Medical/ })).toHaveAttribute('aria-checked', 'false');
  });
});
