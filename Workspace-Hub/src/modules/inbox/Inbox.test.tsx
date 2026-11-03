import { describe, it, expect, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';

import type { ActionItem } from '../../api/types';
import { PEOPLE, renderScreen, resetScreen } from '../claims/yellow-forms/testHarness';
import { Inbox } from './Inbox';

afterEach(resetScreen);

function item(overrides: Partial<ActionItem> & Pick<ActionItem, 'id' | 'kind' | 'title' | 'href'>): ActionItem {
  return {
    subtitle: '',
    entity_type: 'pre_approval',
    entity_id: overrides.id,
    urgency: 'normal',
    due_date: null,
    waiting_since: null,
    can_approve_inline: false,
    approve_href: null,
    ...overrides,
  };
}

const PRE_APPROVAL = item({
  id: 'paf_da_3',
  kind: 'pre_approval_review',
  title: 'DOC Analytica pre-approval needs your approval',
  subtitle: '“Analytics Bootcamp” — awaiting Associate HOD approval',
  href: '/app/claims/yellow_forms?open=paf_da_3',
  urgency: 'soon',
  due_date: '2026-10-02',
});

function mountInbox(items: ActionItem[], user = PEOPLE.associateHod) {
  return renderScreen(<Inbox />, {
    path: '/app',
    user,
    respond: endpoint => (endpoint === '/me/action-queue' ? { items, total: items.length } : undefined),
  });
}

describe('yellow forms in the inbox', () => {
  it('renders a pre-approval review that links to the form', async () => {
    mountInbox([PRE_APPROVAL]);

    const link = await screen.findByRole('link', { name: /DOC Analytica pre-approval needs your approval/ });
    expect(link).toHaveAttribute('href', '/app/claims/yellow_forms?open=paf_da_3');
    const row = link.closest('li') as HTMLElement;
    expect(within(row).getByText('Pre-approval')).toBeTruthy();
    expect(within(row).getByText('Due soon')).toBeTruthy();
    expect(within(row).getByText('“Analytics Bootcamp” — awaiting Associate HOD approval')).toBeTruthy();
    expect(within(row).getByText('Due 2026-10-02')).toBeTruthy();
    // Deciding needs the form in front of you, so there is no inline Approve.
    expect(within(row).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('names every yellow-form kind in the filter chips', async () => {
    mountInbox([
      PRE_APPROVAL,
      item({
        id: 'ccs_da_7', kind: 'claim_sheet_review', entity_type: 'claim_sheet',
        title: 'DOC Analytica claim sheet needs your review', href: '/app/claims/yellow_forms?open=ccs_da_7',
      }),
      item({
        id: 'paf_da_6', kind: 'claim_sheet_due',
        title: 'File the claim sheet for “DOC Analytica Orientation”',
        href: '/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_6',
      }),
      item({
        id: 'paf_da_4', kind: 'yellow_form_returned',
        title: 'Pre-approval for “Corporate Connect Visit” was sent back',
        href: '/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_4',
      }),
    ], PEOPLE.admin);

    const chips = await screen.findByRole('radiogroup', { name: 'Filter by type' });
    expect(within(chips).getAllByRole('radio').map(chip => chip.textContent)).toEqual([
      'All4', 'Pre-approval1', 'Claim sheet1', 'Claim sheet due1', 'Yellow form returned1',
    ]);
    expect(screen.getByRole('link', { name: /File the claim sheet/ })).toHaveAttribute(
      'href',
      '/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_6',
    );
  });

  it('still renders an item of a kind this bundle has never heard of', async () => {
    mountInbox([
      item({ id: 'x-1', kind: 'something_new' as ActionItem['kind'], title: 'A newer kind of work', href: '/app' }),
    ]);
    expect(await screen.findByRole('link', { name: /A newer kind of work/ })).toBeTruthy();
  });
});
