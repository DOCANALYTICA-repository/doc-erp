/**
 * The second representative form screen.
 *
 * `LoginPage.test.tsx` covers the credential form, which is deliberately built
 * on native inputs. This one covers the ordinary in-app case: Astryx-backed
 * fields via `TextField`/`NumberField`, validated by zod through
 * `useZodForm`.
 *
 * It exists specifically to pin the three behaviours that were impossible
 * before Phase 5 — an inline error attached to its control, Enter submitting,
 * and a server 422 landing on the field it names — on a form that goes through
 * the shared field components rather than round them.
 *
 * `amount` is the field worth testing. It used to be read as
 * `Number(amount) || 0`, so a typo — or an empty box — submitted a
 * reimbursement request for **zero rupees**, which then succeeded.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderRoute, resetTestSession } from '../../../test/renderRoute';

afterEach(resetTestSession);

const ROUTE = '/app/clubs/reimbursements?club=c-test';

/** Open the create form, which is collapsed behind "New request". */
async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /new request/i }));
  return screen.findByRole('button', { name: /submit request/i });
}

describe('the reimbursement form', () => {
  it('refuses an empty amount inline rather than posting zero rupees', async () => {
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    const submit = await openForm(user);
    await user.click(submit);

    expect(await screen.findByText(/enter the amount you are claiming/i)).toBeTruthy();

    // The assertion that matters: nothing was WRITTEN. `requested` mixes in
    // the reads the screen makes on mount, so count the verb.
    expect(spies.post).not.toHaveBeenCalled();
  });

  it('never writes a request for zero rupees', async () => {
    // The regression this guards: `Number(amount) || 0` turned a typo — and an
    // empty box — into a real request for ₹0, which the server accepted.
    //
    // Two things stop it now, and this asserts the OUTCOME rather than which
    // one fired: `min={1}` on the control, and `.positive()` in the schema.
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    const submit = await openForm(user);
    await user.type(screen.getByLabelText(/amount/i), '0');
    await user.click(submit);

    await waitFor(() => expect(spies.post).not.toHaveBeenCalled());
  });

  it('associates the error with the control', async () => {
    const user = userEvent.setup();
    await renderRoute(ROUTE);

    const submit = await openForm(user);
    await user.click(submit);
    await screen.findByText(/enter the amount you are claiming/i);

    // A message the input does not point at is a message a screen-reader user
    // never hears.
    const amount = screen.getByLabelText(/amount/i);
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    const describedBy = amount.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy!.split(/\s+/)[0]);
    expect(description?.textContent).toMatch(/enter the amount/i);
  });

  it('rejects a receipt link that is not a URL', async () => {
    const user = userEvent.setup();
    await renderRoute(ROUTE);

    const submit = await openForm(user);
    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.type(screen.getByLabelText(/receipt link/i), 'receipt.pdf');
    await user.click(submit);

    // The table renders this as an anchor, so a bare filename would be a link
    // to nowhere.
    expect(await screen.findByText(/starting with http/i)).toBeTruthy();
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    const { spies } = await renderRoute(ROUTE);

    await openForm(user);
    await user.type(screen.getByLabelText(/amount/i), '500{Enter}');

    // Enter did nothing on most of this app's forms before Phase 5, because
    // they were a <div> of inputs with a click handler on the button.
    await waitFor(() => expect(spies.post).toHaveBeenCalled());
  });

  it("puts a 422 about `amount` on the amount field", async () => {
    const user = userEvent.setup();
    await renderRoute(ROUTE);
    const submit = await openForm(user);

    // Exactly the shape FastAPI sends, and the case the plan calls out.
    const { api, ApiError } = await import('../../../services/api');
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError(422, {
        detail: [
          {
            loc: ['body', 'amount'],
            msg: 'Amount exceeds the remaining club budget',
            type: 'value_error',
          },
        ],
      })
    );

    await user.type(screen.getByLabelText(/amount/i), '999999');
    await user.click(submit);

    const shown = await screen.findByText(/exceeds the remaining club budget/i);
    const amount = screen.getByLabelText(/amount/i);
    expect(amount.getAttribute('aria-describedby')).toContain(shown.id);
  });

  it('shows a refusal that belongs to no field as a form-level alert', async () => {
    const user = userEvent.setup();
    await renderRoute(ROUTE);
    const submit = await openForm(user);

    const { api, ApiError } = await import('../../../services/api');
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError(403, { detail: 'You are not a member of this club' })
    );

    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.click(submit);

    // A 403 has no field to attach to, so it must still reach the user rather
    // than being swallowed by the field-mapping path.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some(a => /not a member of this club/i.test(a.textContent ?? ''))).toBe(true);
  });

  it('keeps the form open after a failure so the values can be corrected', async () => {
    const user = userEvent.setup();
    await renderRoute(ROUTE);
    const submit = await openForm(user);

    const { api, ApiError } = await import('../../../services/api');
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(500, {}));

    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.click(submit);

    await screen.findAllByRole('alert');
    // The amount is still there. A form that clears itself on failure makes
    // the user retype everything to retry.
    expect(screen.getByLabelText(/amount/i)).toHaveValue(500);
  });
});

describe('the reimbursement form is reachable', () => {
  it('is behind a "New request" button, collapsed by default', async () => {
    await renderRoute(ROUTE);
    const trigger = await screen.findByRole('button', { name: /new request/i });
    expect(trigger).toBeTruthy();
    // Collapsed: no amount field until asked for.
    expect(screen.queryByLabelText(/amount/i)).toBeNull();
  });

  it('lists existing requests in a table', async () => {
    await renderRoute(ROUTE);
    const table = await screen.findByRole('table');
    expect(within(table).getByText(/requested by/i)).toBeTruthy();
  });
});
