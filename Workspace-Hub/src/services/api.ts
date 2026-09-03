// The API base URL is configuration, not a constant. It was hardcoded to
// http://localhost:8000/api/v1, which meant no deployed build could ever reach
// a backend. Defaulting to a relative path means a same-origin reverse proxy
// needs no configuration at all.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

// Fail at startup rather than on the first request. A production bundle
// pointing at a relative path it was never configured for produces a wall of
// 404s that look like backend problems; this names the actual cause once.
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL is not set. A production build must be told where the ' +
    'API lives (e.g. https://api.example.edu/api/v1), or be served behind a ' +
    'reverse proxy that forwards /api/v1 to it.'
  );
}

// Canonical route paths carry no trailing slash — the routers are declared at
// '' so that `/api/v1/claims` is the exact match. A stray slash costs a 307
// plus, because every call carries an Authorization header, a second CORS
// preflight: four round trips for one request. Normalizing here means no
// future call site can reintroduce it.
//
// The query string is split off FIRST: '/search?q=x' does not end in a slash,
// which is exactly why a naive endsWith('/') check missed it.
function normalizePath(endpoint: string): string {
  const [path, query] = endpoint.split('?');
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return query === undefined ? trimmed : `${trimmed}?${query}`;
}


// A real, reachable-backend error (4xx/5xx). Callers should catch this
// specifically and show ApiError.message / ApiError.body to the user —
// it must NEVER be silently swallowed and replaced with mock data.
export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(
      (body && typeof body.detail === 'string' && body.detail) ||
      `Request failed with status ${status}`
    );
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// Fetch wrapper. Mock failover is a DEV-ONLY convenience for when the
// backend process itself isn't reachable (offline, not started, DNS/CORS
// preflight failure) — it must never trigger for a real response from a
// reachable backend, including auth failures and validation errors.
// Confusing "wrong password" with "backend is down" was a real, shipped bug:
// both used to fall through to the same mock-success path.
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const tokenObj = localStorage.getItem('doc_user_session');
  let headers: HeadersInit = {};

  // FormData must NOT get an explicit Content-Type — the browser sets the
  // multipart boundary itself; setting it manually breaks the upload.
  if (!(options?.body instanceof URLSearchParams) && !(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (tokenObj) {
    try {
      const parsed = JSON.parse(tokenObj);
      headers['Authorization'] = `Bearer ${parsed.token}`;
    } catch (_) {}
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${normalizePath(endpoint)}`, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers
      }
    });
  } catch (networkError) {
    // A cancelled request is not a dead backend. Re-throw it untouched, or
    // every aborted in-flight fetch reads as "the server is down".
    if (networkError instanceof DOMException && networkError.name === 'AbortError') {
      throw networkError;
    }

    // fetch() itself throwing means no response was ever received. In DEV
    // ONLY, fall through to the offline fixtures so the UI is workable
    // without a backend process.
    //
    // In production this branch is compiled away: Vite substitutes
    // import.meta.env.DEV with `false`, so Rollup drops the block entirely and
    // ./api.mocks is never even parsed, let alone bundled. That matters — the
    // mock login accepted ANY password and handed back a super_admin session
    // with permissions: ['*'], and it used to ship.
    if (import.meta.env.DEV) {
      console.warn(`Backend unreachable for ${endpoint}. Falling back to client-side mocks (dev only).`);
      const { mockHandler } = await import('./api.mocks');
      return mockHandler<T>(endpoint, options);
    }

    throw new ApiError(0, {
      detail: 'Cannot reach the server. Check your connection and try again.',
    });
  }

  if (!response.ok) {
    let body: any = null;
    try {
      body = await response.json();
    } catch (_) {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, body);
  }

  return await response.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: any) => {
    const isForm = body instanceof URLSearchParams;
    return request<T>(endpoint, {
      method: 'POST',
      body: isForm ? body : JSON.stringify(body),
      headers: isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
    });
  },
  put: <T>(endpoint: string, body: any) => {
    const isForm = body instanceof URLSearchParams;
    return request<T>(endpoint, {
      method: 'PUT',
      body: isForm ? body : JSON.stringify(body),
      headers: isForm ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
    });
  },
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  // Real multipart file upload (Phase 1C/6) — used by Faculty Documents and
  // Claims supporting-document upload, both backed by the real Storage Engine.
  upload: <T>(endpoint: string, formData: FormData) =>
    request<T>(endpoint, { method: 'POST', body: formData }),
};
