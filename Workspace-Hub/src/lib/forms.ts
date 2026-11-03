import { useForm, type FieldValues, type UseFormProps, type UseFormReturn, type Path } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import type { z } from 'zod';

import { extractFieldErrors, describeError } from '../services/errors';

/**
 * Form plumbing: a schema-validated form, and a way to put a server's
 * validation errors back onto the controls they belong to.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * Every form in the app was `useState`-per-field plus an async handler, and
 * validation was 27 imperative `showToast({type: 'error'})` guards across 16
 * files. That has three consequences a form library fixes and hand-rolled
 * state cannot:
 *
 *  1. **No inline field errors anywhere.** A toast is transient, appears in a
 *     corner, is not adjacent to the offending field and is not announced as a
 *     field error. It is the right channel for "the server refused this" and
 *     the wrong one for "this date is before that date".
 *
 *  2. **No Enter-to-submit.** Only 6 real `<form onSubmit>` elements existed;
 *     everything else was a `<div>` of inputs with a click handler on a
 *     button, so pressing Enter in a text field did nothing at all.
 *
 *  3. **Nothing mapped a 422 back to a control.** The server knows exactly
 *     which field it rejected and says so in `detail[].loc`; the client threw
 *     that away and showed a sentence.
 *
 * ── Why the pieces were already here ────────────────────────────────────────
 *
 * `react-hook-form` was a declared dependency with zero imports, `zod` was
 * already used for response contracts in `src/api/contracts.ts`, and Astryx's
 * inputs all take a purpose-built `status={{type, message}}` prop that wires
 * `aria-invalid` and `aria-describedby`. Only the glue was missing.
 */

/**
 * A form validated by a zod schema, with sensible defaults for this app.
 *
 * `mode: 'onBlur'` deliberately, not `onChange`: validating every keystroke
 * tells someone their email is invalid while they are still typing the local
 * part, which is noise. `reValidateMode: 'onChange'` then clears an error as
 * soon as it is fixed, so a corrected field stops complaining immediately.
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options?: Omit<UseFormProps<z.output<S>>, 'resolver'>
): UseFormReturn<z.output<S>> {
  type Values = z.output<S>;
  return useForm<Values>({
    // `standardSchemaResolver`, not the older `zodResolver`: zod 4 implements
    // the Standard Schema spec, and this is the resolver that speaks it.
    //
    // Generic over the SCHEMA rather than over the field-values type, so the
    // resolver's own inference lines up with `useForm`'s and no assertion is
    // needed. Constraining `S` to `z.ZodType<FieldValues, FieldValues>` is
    // what lets `z.output<S>` satisfy `useForm`'s `FieldValues` bound.
    resolver: standardSchemaResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    ...options,
  });
}

/**
 * Put a server's validation errors onto the fields they refer to.
 *
 * Returns `true` when at least one error was placed on a control, so the
 * caller can decide whether it still needs a toast:
 *
 * ```ts
 * catch (e) {
 *   if (!applyServerFieldErrors(form, e)) {
 *     showToast({ body: describeError(e), type: 'error' });
 *   }
 * }
 * ```
 *
 * That fallback matters. A 403 ("you are not the coordinator for this club"),
 * a 409, a network failure and a 422 whose `loc` is just `['body']` are all
 * real and none of them belongs on a field — so they must still reach the user
 * as a toast rather than vanishing.
 *
 * An error naming a field the form does not have is also reported via the
 * `root` error rather than dropped: that means the client and server schemas
 * have drifted, which is worth seeing rather than swallowing.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown
): boolean {
  const fieldErrors = extractFieldErrors(error);
  if (fieldErrors.length === 0) return false;

  const known = new Set(Object.keys(form.getValues()));
  let placed = 0;
  const unmatched: string[] = [];

  for (const { path, message } of fieldErrors) {
    // `items.0.name` belongs to the `items` field for this check.
    const root = path.split('.')[0];
    if (known.has(root)) {
      form.setError(path as Path<T>, { type: 'server', message });
      placed += 1;
    } else {
      unmatched.push(`${path}: ${message}`);
    }
  }

  if (unmatched.length > 0) {
    form.setError('root.server' as Path<T>, {
      type: 'server',
      message: unmatched.join('; '),
    });
    placed += 1;
  }

  return placed > 0;
}

/**
 * Submit handler that routes failures to the right place automatically.
 *
 * Wrap an async submit function and every error ends up somewhere a user can
 * see it: field errors on their fields, everything else on `root.server`,
 * which the form components render as a form-level alert.
 *
 * The caller no longer has to remember the try/catch, which is how validation
 * feedback went missing in the first place.
 */
export function withServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  submit: (values: T) => Promise<void>
): (values: T) => Promise<void> {
  return async values => {
    // Clear a previous attempt's server errors; leaving them up next to a
    // field the user has since corrected is worse than showing nothing.
    form.clearErrors('root.server' as Path<T>);
    try {
      await submit(values);
    } catch (error) {
      if (!applyServerFieldErrors(form, error)) {
        form.setError('root.server' as Path<T>, {
          type: 'server',
          message: describeError(error),
        });
      }
    }
  };
}
