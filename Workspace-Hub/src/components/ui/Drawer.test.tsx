/**
 * The detail drawer.
 *
 * It exists because reviewing a queue means open → read → decide → next, and
 * navigating away and back for each item loses the list's scroll position,
 * page and filter. It replaced a hand-rolled panel that declared
 * `role="dialog" aria-modal="true"` and honoured neither — no backdrop, no
 * focus trap.
 *
 * The backdrop, focus trap and top-layer behaviour come from Astryx `Dialog`
 * and are NOT asserted here: jsdom stubs `<dialog>`'s methods and implements
 * none of that, so a passing test would be meaningless. Those were verified in
 * a real browser. What is asserted here is the contract this component owns.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Drawer isOpen={false} onClose={vi.fn()} title="Claim">
        <p>body</p>
      </Drawer>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows its title, subtitle and content when open', () => {
    render(
      <Drawer isOpen onClose={vi.fn()} title="ACP-2026-000102" subtitle="Rahul Sharma">
        <p>Reason given</p>
      </Drawer>
    );
    expect(screen.getByText('ACP-2026-000102')).toBeTruthy();
    expect(screen.getByText('Rahul Sharma')).toBeTruthy();
    expect(screen.getByText('Reason given')).toBeTruthy();
  });

  it('closes through onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Claim">
        <p>body</p>
      </Drawer>
    );
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders header and action slots', () => {
    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        title="Claim"
        headerContent={<span>Submitted</span>}
        actions={<button type="button">Reject</button>}
      >
        <p>body</p>
      </Drawer>
    );
    expect(screen.getByText('Submitted')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('is a real <dialog>, so the platform supplies the modal behaviour', () => {
    render(
      <Drawer isOpen onClose={vi.fn()} title="Claim">
        <p>body</p>
      </Drawer>
    );
    // The predecessor was a `fixed inset-y-0` div claiming aria-modal. This
    // assertion is the difference: a real dialog element gets the backdrop and
    // focus trap from the platform rather than promising them in an attribute.
    expect(document.querySelector('dialog')).toBeTruthy();
  });
});
