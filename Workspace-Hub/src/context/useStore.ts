import { create } from 'zustand';

export interface UserState {
  id: string;
  email: string;
  name: string;
  primary_role: 'public' | 'student' | 'faculty' | 'super_admin';
  role_tags_str: string;
  status: string;
  // Academic profile (students) / Faculty Directory fields — added Phase 1D.
  programme?: string | null;
  semester?: string | null;
  section?: string | null;
  enrollment_no?: string | null;
  designation?: string | null;
  // Resolved server-side by GET /auth/me (backend/app/core/rbac.py::get_resolved_permissions).
  // This is the ONLY permission source on the frontend now — do not
  // reintroduce a local ROLE_PERMISSIONS map here; that duplication (once a
  // real, shipped bug where this file and rbac.py silently drifted apart)
  // is exactly what this field exists to prevent.
  permissions: string[];
}

interface PlatformStore {
  user: UserState | null;
  token: string | null;
  // Resolved server-side by GET /auth/me (backend/app/core/capabilities.py).
  // slug -> "live" | "coming_soon". A slug absent from this map is "live".
  capabilities: Record<string, string>;
  isSearchOpen: boolean;
  isNotificationsOpen: boolean;

  // Actions. Navigation itself now lives in React Router (Phase 1C) — this
  // store only holds session/identity state, never "which screen am I on."
  login: (user: UserState, token: string, capabilities?: Record<string, string>) => void;
  logout: () => void;
  setSearchOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;

  // Helpers
  hasPermission: (permission: string) => boolean;
  isEnabled: (slug: string) => boolean;
}

export const useStore = create<PlatformStore>((set, get) => ({
  user: null,
  token: null,
  capabilities: {},
  isSearchOpen: false,
  isNotificationsOpen: false,

  login: (user, token, capabilities = {}) => {
    localStorage.setItem('doc_user_session', JSON.stringify({ user, token, capabilities }));
    set({ user, token, capabilities });
  },

  logout: () => {
    localStorage.removeItem('doc_user_session');
    set({ user: null, token: null, capabilities: {} });
  },

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setNotificationsOpen: (open) => set({ isNotificationsOpen: open }),

  hasPermission: (permission) => {
    const permissions = get().user?.permissions ?? [];
    if (permissions.includes('*')) return true;
    return permissions.includes(permission);
  },

  isEnabled: (slug) => {
    const status = get().capabilities[slug];
    return status === undefined || status === 'live';
  },
}));
