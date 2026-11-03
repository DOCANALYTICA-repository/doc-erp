/**
 * The confirmation dialog, and the defect it was built for.
 *
 * `ClubHierarchyChart` deleted a hierarchy level on a single click of a
 * hover-revealed icon, and reported failure with `console.error` — so the
 * common case (the server refusing a level that still has members) showed the
 * user nothing at all: the level just did not disappear.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfirmDialog } from './ConfirmDialog';

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      isOpen
      title="Delete this position?"
      body="This cannot be undone."
      confirmLabel="Delete position"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        isOpen={false}
        title="t"
        body="b"
        confirmLabel="c"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names the action on its button rather than saying OK', () => {
    setup();
    // "OK" on a destructive dialog tells you nothing about what you are
    // agreeing to.
    expect(screen.getByRole('button', { name: 'Delete position' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^ok$/i })).toBeNull();
  });

  it('confirms and cancels through the right callbacks', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();

    await user.click(screen.getByRole('button', { name: 'Delete position' }));
    expect(onConfirm).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('hides the note field unless a label is given', () => {
    setup();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('passes the note to onConfirm when asked for', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup({ noteLabel: 'Note for the record (optional)' });

    await user.type(screen.getByLabelText(/note for the record/i), 'Duplicate level.');
    await user.click(screen.getByRole('button', { name: 'Delete position' }));

    expect(onConfirm).toHaveBeenCalledWith('Duplicate level.');
  });

  it('shows a failure inside the dialog so it stays open', () => {
    // The whole point: the old code sent this to console.error.
    setup({ error: 'Members are still assigned to this level' });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/still assigned/i);
    // And the buttons are still there to retry or back out.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('disables both buttons while the action runs', () => {
    setup({ isBusy: true });
    expect(screen.getByRole('button', { name: 'Delete position' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('cannot be dismissed by Escape', async () => {
    // purpose="required": "I pressed Escape" must not be indistinguishable
    // from "I decided not to" on a destructive action.
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
