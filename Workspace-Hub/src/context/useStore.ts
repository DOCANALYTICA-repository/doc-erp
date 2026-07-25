import { create } from 'zustand';

export interface UserState {
  id: string;
  email: string;
  name: string;
  primary_role: 'public' | 'student' | 'faculty' | 'super_admin';
  role_tags_str: string;
  status: string;
}

interface PlatformStore {
  user: UserState | null;
  token: string | null;
  activeModule: 'landing' | 'launcher' | 'clubs' | 'claims' | 'faculty';
  activeTab: string;
  isSearchOpen: boolean;
  isNotificationsOpen: boolean;
  
  // Actions
  login: (user: UserState, token: string) => void;
  logout: () => void;
  navigate: (module: 'landing' | 'launcher' | 'clubs' | 'claims' | 'faculty', tab?: string) => void;
  setSearchOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  
  // Helpers
  getPermissions: () => Set<string>;
  hasPermission: (permission: string) => boolean;
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  public: ["public:view"],
  student: [
    "public:view",
    "claims:submit",
    "claims:view_own",
    "clubs:view",
    "events:register",
    "tasks:view_own"
  ],
  faculty: [
    "public:view",
    "claims:view_own",
    "clubs:view",
    "faculty:dashboard",
    "notes:manage",
    "documents:manage",
    "meetings:manage",
    "tasks:manage",
    "directory:view",
    "reports:view",
    "claims:review_faculty"
  ],
  super_admin: ["*"],
  
  // Role Tags
  "Club President": [
    "clubs:manage_members",
    "events:create",
    "budget:manage",
    "reimbursement:request",
    "sponsorship:manage"
  ],
  "Vice President": [
    "clubs:manage_members",
    "events:create",
    "budget:manage",
    "reimbursement:request"
  ],
  "Core Member": [
    "events:create",
    "reimbursement:request"
  ],
  "Class Teacher": ["claims:review_class_teacher"],
  "Club Faculty Coordinator": [
    "clubs:approve_plan",
    "events:approve",
    "budget:manage",
    "reimbursement:approve"
  ],
  "Course Coordinator": ["claims:approve_coordinator"],
  "HOD": [
    "claims:approve_coordinator",
    "clubs:approve_plan",
    "events:approve",
    "rbac:assign_roles"
  ]
};

export const useStore = create<PlatformStore>((set, get) => ({
  user: null,
  token: null,
  activeModule: 'landing',
  activeTab: 'home',
  isSearchOpen: false,
  isNotificationsOpen: false,

  login: (user, token) => {
    localStorage.setItem('doc_user_session', JSON.stringify({ user, token }));
    set({ user, token, activeModule: 'launcher', activeTab: 'main' });
  },

  logout: () => {
    localStorage.removeItem('doc_user_session');
    set({ user: null, token: null, activeModule: 'landing', activeTab: 'home' });
  },

  navigate: (module, tab = 'dashboard') => {
    set({ activeModule: module, activeTab: tab });
  },

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setNotificationsOpen: (open) => set({ isNotificationsOpen: open }),

  getPermissions: () => {
    const state = get();
    if (!state.user) return new Set(ROLE_PERMISSIONS.public);
    if (state.user.primary_role === 'super_admin') return new Set(["*"]);

    const permissions = new Set<string>();
    
    // Primary Role
    const primary = ROLE_PERMISSIONS[state.user.primary_role] || [];
    primary.forEach(p => permissions.add(p));
    
    // Role Tags
    if (state.user.role_tags_str) {
      state.user.role_tags_str.split(',').forEach(tag => {
        const trimmed = tag.trim();
        const tagPerms = ROLE_PERMISSIONS[trimmed] || [];
        tagPerms.forEach(p => permissions.add(p));
      });
    }

    return permissions;
  },

  hasPermission: (permission) => {
    const permissions = get().getPermissions();
    if (permissions.has("*")) return true;
    return permissions.has(permission);
  }
}));
