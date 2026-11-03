import { ApiError } from './api';

/**
 * Turn any thrown value into something worth showing a user.
 *
 * FastAPI puts the real reason in `detail`, and ApiError already surfaces it
 * as `.message` — so "File is larger than the 10 MB limit" or "You are not the
 * assigned Faculty Coordinator for this club" reaches the user for free. The
 * generic fallback is only for the cases where nothing better exists.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
    if (error.status === 401) {
      return 'Your session has expired. Please sign in again.';
    }
    if (error.status === 429) {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    const requestId = error.body?.request_id;
    return requestId ? `${error.message} (reference ${requestId})` : error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * One field-level validation failure, as FastAPI reports it.
 *
 * FastAPI's 422 body is `{ detail: [{ loc, msg, type }, ...] }`, where `loc`
 * is a path like `['body', 'amount']` — or `['body', 'items', 0, 'name']` for
 * something nested.
 */
export interface FieldError {
  /** The rhf field path, e.g. `amount` or `items.0.name`. */
  path: string;
  message: string;
}

interface RawDetailEntry {
  loc?: unknown;
  msg?: unknown;
}

/**
 * Pull per-field validation errors out of a 422.
 *
 * `describeError` above flattens everything to a single sentence for a toast,
 * which is right for "you are not the coordinator for this club" and wrong for
 * "amount must be greater than 0" — the second belongs next to the amount
 * field. Until this existed the structure was simply discarded, which is why
 * nothing in the app could put an error on a control.
 *
 * Returns `[]` for anything that is not a field-shaped 422, including a plain
 * string `detail` (FastAPI's own `HTTPException` shape) and a `loc` of just
 * `['body']`, which refers to the request as a whole rather than any one
 * field. Callers fall back to a toast for those — see `applyServerFieldErrors`
 * in src/lib/forms.ts.
 */
export function extractFieldErrors(error: unknown): FieldError[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];

  const detail = error.body?.detail;
  if (!Array.isArray(detail)) return [];

  const out: FieldError[] = [];
  for (const entry of detail as RawDetailEntry[]) {
    if (!entry || !Array.isArray(entry.loc)) continue;

    // Drop the leading source segment ('body', 'query', 'path'): rhf paths are
    // relative to the form object, not to the HTTP request.
    const segments = entry.loc.filter(
      (seg, idx) => !(idx === 0 && (seg === 'body' || seg === 'query' || seg === 'path'))
    );
    if (segments.length === 0) continue;

    const message = typeof entry.msg === 'string' ? entry.msg : 'Invalid value';
    out.push({ path: segments.join('.'), message });
  }
  return out;
}
