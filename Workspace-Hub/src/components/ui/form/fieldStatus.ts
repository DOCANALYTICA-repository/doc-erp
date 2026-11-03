import type { FieldError, FieldErrors, FieldValues } from 'react-hook-form';

/**
 * Turn an rhf error into the `status` prop every Astryx input accepts.
 *
 * That prop is the whole reason this layer is thin: Astryx already colours the
 * border, shows a status icon, sets `aria-invalid` and wires the message via
 * `aria-describedby`. It was in use in exactly one place before this — the
 * debounced duplicate-claim warning at `NewClaimTab.tsx` — which was the only
 * inline validation feedback anywhere in the app.
 */
export function toFieldStatus(
  error: FieldError | undefined
): { type: 'error'; message: string } | undefined {
  if (!error) return undefined;
  return { type: 'error', message: error.message ?? 'Invalid value' };
}

/**
 * The form-level error `withServerErrors` writes when a failure belongs to no
 * particular field — a 403, a 409, a network drop, or a 422 about the request
 * as a whole.
 */
export function rootServerError<T extends FieldValues>(
  errors: FieldErrors<T>
): string | undefined {
  const root = (errors as { root?: { server?: FieldError } }).root;
  return root?.server?.message;
}
