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
      await api.get('/clubs/');
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).message).toBe('Not enough permissions');
    }
  });

  it('only falls back to client-side mocks when fetch itself throws (genuine network failure)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    // /auth/login is one of the mock-handled endpoints — a network failure
    // should still resolve (not reject) via the dev-only mock path.
    const body = new URLSearchParams();
    body.append('username', 'student.regular@christuniversity.in');
    body.append('password', 'anything');
    const result = await api.post<any>('/auth/login', body);
    expect(result.access_token).toBeDefined();
  });
});
