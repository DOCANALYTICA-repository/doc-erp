/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the API lives, including the /api/v1 suffix.
   *
   * Defaults to the relative path '/api/v1', which is correct when the app is
   * served behind a reverse proxy that forwards to the backend on the same
   * origin. Set it explicitly for a split deployment, e.g.
   * https://api.doc.christuniversity.in/api/v1
   *
   * A production build with this unset throws at startup rather than failing
   * request by request.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
