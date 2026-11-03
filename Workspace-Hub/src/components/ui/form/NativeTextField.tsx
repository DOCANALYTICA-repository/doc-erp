import React from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

/**
 * A native `<input>` field, bound with rhf's `register`.
 *
 * ── Why this exists alongside `TextField` ───────────────────────────────────
 *
 * Astryx's input props extend `React.HTMLAttributes`, not
 * `React.InputHTMLAttributes`, so `TextInput` accepts neither `name` nor
 * `autoComplete` and offers no pass-through for them.
 *
 * For an in-app form that costs nothing. For a CREDENTIAL form it is a real
 * regression: a browser's password manager decides whether to offer to fill
 * and save based on exactly those two attributes
 * (`autocomplete="username"` / `"current-password"`). Losing them would mean
 * every user who relies on a password manager suddenly has to type their
 * university password by hand.
 *
 * So the login form keeps native inputs. `register` works perfectly on them —
 * it wants a DOM ref and native events, which is precisely what a native
 * input gives — and this component adds the label association, the error
 * display and the `aria-describedby` wiring that Astryx would otherwise have
 * provided.
 */
export const NativeTextField: React.FC<{
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  /** Spread from `register('field')`. Supplies name, ref, onChange, onBlur. */
  registration: UseFormRegisterReturn;
  error?: FieldError;
  /** e.g. "username", "current-password". Load-bearing — see above. */
  autoComplete?: string;
  isDisabled?: boolean;
}> = ({
  id,
  label,
  type = 'text',
  placeholder,
  registration,
  error,
  autoComplete,
  isDisabled,
}) => {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-medium text-secondary" htmlFor={id}>
        {label}
      </label>
      <input
        {...registration}
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={isDisabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[
          'rounded-full border bg-card px-4 py-2.5 text-primary transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:opacity-60',
          error ? 'border-error' : 'border-border',
        ].join(' ')}
      />
      {/*
        * Not role="alert": the message is already associated with the input via
        * aria-describedby, so a screen reader reads it when focus lands on the
        * field. An alert would also announce it out of context the moment it
        * appears, which on blur-validation means interrupting whatever the user
        * moved on to.
        */}
      {error ? (
        <p id={errorId} className="text-sm text-error">
          {error.message}
        </p>
      ) : null}
    </div>
  );
};
