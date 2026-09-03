import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from './api';

// Re-import request indirectly via the public api object; api.ts doesn't
// export request() directly, so we exercise it through api.get/post.
import { api } from './api';

describe('api.ts request() — the mock-fallback security fix', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws ApiError for a real 4xx response instead of silently returning mock data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Incorrect email or password' }),
    } as any);

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('ApiError carries the real status and backend detail message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Not enough permissions' }),
    } as any);

    try {
      await api.get('/clubs');
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).message).toBe('Not enough permissions');
    }
  });

  it('falls back to the dev-only mocks when fetch itself throws (genuine network failure)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    // Vitest runs with import.meta.env.DEV === true, so this exercises the
    // development branch. In a production build Vite substitutes DEV with
    // false and Rollup removes the branch entirely — see the bundle assertion
    // in the build, not here: `grep -c "mock_jwt_token_payload" dist/assets/*.js`
    // must return 0.
    const body = new URLSearchParams();
    body.append('username', 'student.regular@christuniversity.in');
    body.append('password', 'anything');
    const result = await api.post<any>('/auth/login', body);
    expect(result.access_token).toBeDefined();
  });

  it('re-throws an aborted request rather than treating it as a dead backend', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    // A cancelled in-flight request must not engage the offline failover, or
    // every navigation away from a loading screen reads as "server is down".
    await expect(api.get('/clubs')).rejects.toThrow(/aborted/i);
  });

  it('strips a trailing slash so no call site can reintroduce a 307', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as any);
    global.fetch = fetchMock;

    await api.get('/clubs/');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/clubs$/);
  });

  it('normalizes the path without eating the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as any);
    global.fetch = fetchMock;

    // '/search/?q=x' does not end in a slash, which is exactly why a naive
    // endsWith('/') check missed this case.
    await api.get('/search/?q=commerce');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/search\?q=commerce$/);
  });

});
