import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { api } from './api';
import {
  clearSession, getAccessToken, readSession, refreshAccessToken,
  setSessionEndedHandler, writeSession,
} from './session';

/**
 * The client half of the 30-minute access token.
 *
 * Shortening the lifetime is only workable because a 401 refreshes and
 * replays transparently. If any of this is wrong, the visible symptom is
 * users being signed out every half hour.
 */
describe('session refresh', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearSession();
    setSessionEndedHandler(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    clearSession();
  });

  function json(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    } as unknown as Response;
  }

  it('refreshes and replays a request that 401s, transparently', async () => {
    writeSession({ user: null, token: 'expired', refreshToken: 'refresh-1' });

    const fetchMock = vi.fn()
      // 1. the original request, with the expired token
      .mockResolvedValueOnce(json({ detail: 'Could not validate credentials' }, 401))
      // 2. the refresh
      .mockResolvedValueOnce(json({ access_token: 'fresh', refresh_token: 'refresh-2' }))
      // 3. the replay
      .mockResolvedValueOnce(json([{ id: 'club_commerce' }]));
    global.fetch = fetchMock;

    const result = await api.get<{ id: string }[]>('/clubs');

    expect(result).toEqual([{ id: 'club_commerce' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The replay carries the NEW token, not the expired one.
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('stores the ROTATED refresh token', async () => {
    // Refresh tokens rotate server-side. Keeping the old one would make the
    // next refresh look like token reuse, which revokes the whole family.
    writeSession({ user: null, token: 'expired', refreshToken: 'refresh-1' });

    global.fetch = vi.fn().mockResolvedValue(
      json({ access_token: 'fresh', refresh_token: 'refresh-2' }),
    );

    await refreshAccessToken('/api/v1');

    expect(readSession()?.refreshToken).toBe('refresh-2');
    expect(getAccessToken()).toBe('fresh');
  });

  it('shares ONE refresh between concurrent callers', async () => {
    // The Clubs workspace fires several requests at once. Without
    // single-flight they would each start a refresh, and since tokens rotate
    // the first to land invalidates the others — the server correctly reads
    // that as reuse and signs the user out. Trying too hard to stay logged in
    // is what logs you out.
    writeSession({ user: null, token: 'expired', refreshToken: 'refresh-1' });

    let refreshCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 10));
        return json({ access_token: 'fresh', refresh_token: 'refresh-2' });
      }
      return json({ ok: true });
    }) as unknown as typeof fetch;

    await Promise.all([
      refreshAccessToken('/api/v1'),
      refreshAccessToken('/api/v1'),
      refreshAccessToken('/api/v1'),
    ]);

    expect(refreshCalls).toBe(1);
  });

  it('does not retry a failed login as if the session had expired', async () => {
    // A 401 from /auth/login is a wrong password, not an expired token.
    const fetchMock = vi.fn().mockResolvedValue(json({ detail: 'Incorrect email or password' }, 401));
    global.fetch = fetchMock;

    await expect(api.post('/auth/login', new URLSearchParams())).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not replay a multipart upload', async () => {
    // A FormData body is a consumed stream after the first fetch; replaying
    // it would silently upload nothing.
    writeSession({ user: null, token: 'expired', refreshToken: 'refresh-1' });

    const fetchMock = vi.fn().mockResolvedValue(json({ detail: 'expired' }, 401));
    global.fetch = fetchMock;

    await expect(api.upload('/faculty/documents', new FormData())).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signs the user out when the refresh token is definitively refused', async () => {
    writeSession({ user: null, token: 'expired', refreshToken: 'dead' });
    const onEnded = vi.fn();
    setSessionEndedHandler(onEnded);

    global.fetch = vi.fn().mockResolvedValue(json({ detail: 'Unknown refresh token' }, 401));

    expect(await refreshAccessToken('/api/v1')).toBeNull();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(readSession()).toBeNull();
  });

  it('does NOT sign the user out on a network failure', async () => {
    // Losing signal is not an invalid session.
    writeSession({ user: null, token: 'expired', refreshToken: 'refresh-1' });
    const onEnded = vi.fn();
    setSessionEndedHandler(onEnded);

    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await refreshAccessToken('/api/v1')).toBeNull();
    expect(onEnded).not.toHaveBeenCalled();
    expect(readSession()?.refreshToken).toBe('refresh-1');
  });

  it('survives corrupt JSON in storage', async () => {
    localStorage.setItem('doc_user_session', '{not json');
    expect(readSession()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});
