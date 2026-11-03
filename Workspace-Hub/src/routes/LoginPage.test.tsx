/**
 * The login form's behaviour, end to end through the real app.
 *
 * Three of these assert things that were impossible before Phase 5: an inline
 * error attached to its control, Enter submitting the form, and a server's 422
 * landing on the field it names. The fourth guards the two attributes a
 * password manager needs, which Astryx's inputs cannot supply — the reason
 * this form keeps native inputs.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderRoute, resetTestSession } from '../test/renderRoute';

afterEach(resetTestSession);

describe('the login form', () => {
  it('keeps the attributes a password manager needs', async () => {
    // Astryx's TextInput extends HTMLAttributes, not InputHTMLAttributes, so
    // it can carry neither of these. Losing them means every user who relies
    // on a password manager has to type their university password by hand —
    // which is why this form is deliberately NOT on `TextField`.
    await renderRoute('/login', { user: null });

    const email = await screen.findByLabelText(/email address/i);
    expect(email).toHaveAttribute('name', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');

    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('name', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  it('shows an inline error on the field that is wrong', async () => {
    const user = userEvent.setup();
    await renderRoute('/login', { user: null });

    await user.click(await screen.findByRole('button', { name: /sign in/i }));

    // Two distinct messages, each associated with its own control — not one
    // toast saying "Authentication failed. Check email or password."
    const emailError = await screen.findByText(/enter your christ email address/i);
    expect(emailError).toBeTruthy();
    expect(await screen.findByText(/enter your password/i)).toBeTruthy();

    const email = screen.getByLabelText(/email address/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    // The message must be REACHABLE from the input, or a screen-reader user
    // hears an invalid field and no reason.
    expect(email.getAttribute('aria-describedby')).toBe(emailError.id);
  });

  it('rejects a malformed address without a round trip', async () => {
    const user = userEvent.setup();
    const { requested } = await renderRoute('/login', { user: null });

    await user.type(await screen.findByLabelText(/email address/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password$/i), 'hunter2');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/does not look like an email address/i)).toBeTruthy();
    expect(requested.some(e => e.includes('/auth/login'))).toBe(false);
  });

  it('submits on Enter', async () => {
    // Enter did nothing on most of this app's forms, because they were a
    // <div> of inputs with a click handler on a button.
    const user = userEvent.setup();
    const { requested } = await renderRoute('/login', { user: null });

    await user.type(await screen.findByLabelText(/email address/i), 'admin@christuniversity.in');
    await user.type(screen.getByLabelText(/^password$/i), 'admin123{Enter}');

    await waitFor(() => {
      expect(requested.some(e => e.includes('/auth/login'))).toBe(true);
    });
  });

  it('puts a 422 from the server on the field it names', async () => {
    const user = userEvent.setup();
    await renderRoute('/login', { user: null });

    // A 422 whose `loc` names `password`. Before `extractFieldErrors` the
    // structure was discarded and this became a generic sentence.
    const { api, ApiError } = await import('../services/api');
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError(422, {
        detail: [{ loc: ['body', 'password'], msg: 'Password has expired', type: 'value_error' }],
      })
    );

    await user.type(await screen.findByLabelText(/email address/i), 'admin@christuniversity.in');
    await user.type(screen.getByLabelText(/^password$/i), 'admin123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const shown = await screen.findByText(/password has expired/i);
    expect(shown).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i).getAttribute('aria-describedby')).toBe(shown.id);
  });

  it('shows a non-field failure as a form-level alert', async () => {
    const user = userEvent.setup();
    await renderRoute('/login', { user: null });

    const { api, ApiError } = await import('../services/api');
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError(401, { detail: 'Incorrect email or password' })
    );

    await user.type(await screen.findByLabelText(/email address/i), 'admin@christuniversity.in');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // A 401 belongs to no field, so it must still reach the user rather than
    // being swallowed by the field-mapping path.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/incorrect email or password/i);
  });
});
