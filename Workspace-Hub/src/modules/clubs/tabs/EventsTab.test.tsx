/**
 * The event proposal sheet — the canvas's `sheetOpen` pattern.
 *
 * This form moved out of an inline panel and into `Drawer`, which is built on
 * a real `<dialog>`. That move is worth pinning down because two of its parts
 * are the kind that break silently:
 *
 *  - the submit button lives in the drawer's pinned footer, OUTSIDE the
 *    `<form>`, and reaches it through the `form="…"` attribute. If Astryx's
 *    `Button` ever stopped forwarding that attribute, the button would still
 *    render, still be clickable, and simply do nothing;
 *  - `description` is a field the API and the event card have always
 *    supported and no form has ever offered, so there is no older behaviour
 *    to notice it going missing again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderRoute, resetTestSession } from '../../../test/renderRoute';

afterEach(resetTestSession);

const ROUTE = '/app/clubs/events?club=c-test';

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /submit event proposal/i }));
  return screen.findByRole('button', { name: /submit proposal/i });
}

describe('the event proposal sheet', () => {
  it('opens as a modal dialog rather than an inline panel', async () => {
    const user = userEvent.setup();
    await renderRoute(ROUTE);

    /*
     * Queried by accessible name, not by role alone: the app shell always has
     * the command palette's dialog mounted, so a bare `getByRole('dialog')`
     * matches two elements and fails for a reason that has nothing to do with
     * this screen.
     */
    const sheet = { name: /submit an event proposal/i };

    // Nothing until asked for: the sheet must not occupy the page by default.
    expect(screen.queryByRole('dialog', sheet)).toBeNull();

    await openSheet(user);

    // A real dialog is what supplies the focus trap and Escape. The inline
    // panel this replaced announced itself as nothing at all.
    expect(await screen.findByRole('dialog', sheet)).toBeTruthy();
  });

  it('submits from the pinned footer button, which sits outside the form', async () => {
    // The `form="club-event-proposal-form"` wiring. If it regresses, this is
    // the only thing that would notice.
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    const submit = await openSheet(user);

    await user.type(screen.getByLabelText(/event title/i), 'Inter-collegiate Finance Quiz');
    await user.type(screen.getByLabelText(/event date/i), '2026-11-14');
    await user.type(screen.getByLabelText(/venue/i), 'Block A, Room 104');
    await user.type(screen.getByLabelText(/budget/i), '6500');
    await user.click(submit);

    await waitFor(() => expect(spies.post).toHaveBeenCalled());
  });

  it('sends the description, which no form offered before', async () => {
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    const submit = await openSheet(user);

    await user.type(screen.getByLabelText(/event title/i), 'Inter-collegiate Finance Quiz');
    await user.type(screen.getByLabelText(/event date/i), '2026-11-14');
    await user.type(screen.getByLabelText(/venue/i), 'Block A, Room 104');
    await user.type(screen.getByLabelText(/budget/i), '6500');
    await user.type(screen.getByLabelText(/description/i), 'Six-team knockout.');
    await user.click(submit);

    await waitFor(() => expect(spies.post).toHaveBeenCalled());
    const [, body] = spies.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.description).toBe('Six-team knockout.');
  });

  it('sends null rather than an empty string when the description is blank', async () => {
    // `description` is nullable on the API. Posting '' would render an empty
    // paragraph on the event card instead of omitting it.
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    const submit = await openSheet(user);

    await user.type(screen.getByLabelText(/event title/i), 'Quiz');
    await user.type(screen.getByLabelText(/event date/i), '2026-11-14');
    await user.type(screen.getByLabelText(/venue/i), 'Block A');
    await user.type(screen.getByLabelText(/budget/i), '0');
    await user.click(submit);

    await waitFor(() => expect(spies.post).toHaveBeenCalled());
    const [, body] = spies.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.description).toBeNull();
  });

  it('refuses an empty proposal inline, and writes nothing', async () => {
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    const submit = await openSheet(user);
    await user.click(submit);

    expect(await screen.findByText(/name the event/i)).toBeTruthy();
    expect(spies.post).not.toHaveBeenCalled();
  });
});
