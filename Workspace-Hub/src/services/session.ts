/**
 * The stored session, and the single-flight refresh that keeps it alive.
 *
 * The access token now lives 30 MINUTES rather than 8 days. That is only
 * workable because of this file: without a refresh path a short lifetime just
 * signs everyone out mid-task, which is exactly why the plan refused to ship
 * the two separately.
 */
import type { UserProfile } from '../api/types';

const STORAGE_KEY = 'doc_user_session';

export interface StoredSession {
  user: UserProfile | null;
  token: string | null;
  refreshToken?: string | null;
  capabilities?: Record<string, string>;
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    // Corrupt JSON in storage should log the user out cleanly, not throw on
    // every single request for the rest of the session.
    return null;
  }
}

export function writeSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing, or a full quota. The in-memory session still works
    // for this tab; the user simply will not be remembered.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do */
  }
}

export function getAccessToken(): string | null {
  return readSession()?.token ?? null;
}

export function getRefreshToken(): string | null {
  return readSession()?.refreshToken ?? null;
}

/**
 * A single in-flight refresh, shared by every caller.
 *
 * The Clubs workspace fires several requests concurrently. If the access token
 * has expired they would ALL 401 at once, and without this each would start
 * its own refresh — and since refresh tokens ROTATE, the first to land
 * invalidates the token the others are still holding, which the server
 * correctly reads as token reuse and revokes the entire family. The user gets
 * logged out precisely because we tried too hard to keep them logged in.
 */
let inFlight: Promise<string | null> | null = null;

type OnSessionEnded = () => void;
let onSessionEnded: OnSessionEnded = () => {};

/** Let the app decide what "signed out" means (redirect, toast, clear caches). */
export function setSessionEndedHandler(handler: OnSessionEnded): void {
  onSessionEnded = handler;
}

export async function refreshAccessToken(baseUrl: string): Promise<string | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const session = readSession();
    const refreshToken = session?.refreshToken;
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        // 401 here means the refresh token is dead — expired, revoked, or
        // the server detected reuse. There is nothing left to try.
        clearSession();
        onSessionEnded();
        return null;
      }

      const body = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
      };

      writeSession({
        ...(session ?? { user: null, token: null }),
        token: body.access_token,
        // Store the ROTATED token. Keeping the old one would make the next
        // refresh look like reuse.
        refreshToken: body.refresh_token ?? refreshToken,
      });

      return body.access_token;
    } catch {
      // A network failure is not an invalid session — do not sign the user
      // out because their train went into a tunnel.
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
