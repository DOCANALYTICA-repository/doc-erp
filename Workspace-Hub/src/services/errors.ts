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
