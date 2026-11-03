import { Award, Compass, FolderOpen } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * What the workspaces are called, in one place.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 *
 * The same three modules were hardcoded in FOUR files with THREE different
 * label sets, so a user was told three different names for one destination
 * depending on how they got there:
 *
 *   AppSideNav      "Clubs"  ·  "Claims"  ·  "Faculty workspace"
 *   ModuleLauncher  "Clubs Management"  ·  "Attendance Claims"  ·  "Faculty Workspace"
 *   Inbox           "Clubs"  ·  "Claims"  ·  "Faculty workspace"
 *   CommandBar      "Go to clubs"  ·  "Go to claims"  ·  "Go to faculty workspace"
 *
 * Each list also carried its own copy of the permission string, so adding a
 * module meant editing four files and getting the same `perm` right in all of
 * them.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 *
 * **Vocabulary only.** `permission` is the key a consumer passes to
 * `useStore.hasPermission`; it is not a decision. Visibility stays where it
 * belongs:
 *
 *   - module access      → `hasPermission(module.permission)`, resolved
 *                          server-side by `GET /auth/me`
 *   - tab visibility     → `bootstrap.visible_tabs` from the server
 *   - feature gating     → `isEnabled(slug)` from the capabilities map
 *
 * Hardcoding visibility here would make the UI promise what the API refuses —
 * a Faculty Coordinator is not a club member and cannot file a reimbursement,
 * and the server is the only thing that knows that.
 */
export interface ModuleDescriptor {
  id: 'clubs' | 'claims' | 'faculty';
  /** Short name. Side nav, inbox chips, breadcrumbs. */
  label: string;
  /** Sentence for the launcher card. */
  description: string;
  /** Command palette entry, which reads as an instruction rather than a noun. */
  commandLabel: string;
  icon: ComponentType<{ className?: string }>;
  path: string;
  /** Passed to `hasPermission`. Not a gate in itself — see above. */
  permission: string;
}

export const MODULES: readonly ModuleDescriptor[] = [
  {
    id: 'clubs',
    label: 'Clubs',
    description:
      'Recruitments, annual planning, budget requests, and sponsorship tracking.',
    commandLabel: 'Go to clubs',
    icon: Award,
    path: '/app/clubs',
    permission: 'clubs:view',
  },
  {
    id: 'claims',
    label: 'Claims',
    description:
      'Submit medical claims, co-curricular exemptions, and check review queues.',
    commandLabel: 'Go to claims',
    icon: Compass,
    path: '/app/claims',
    permission: 'claims:view_own',
  },
  {
    id: 'faculty',
    label: 'Faculty workspace',
    description:
      'Meetings agenda planner, curriculum tracking, personal folders, and notes.',
    commandLabel: 'Go to faculty workspace',
    icon: FolderOpen,
    path: '/app/faculty',
    permission: 'faculty:dashboard',
  },
] as const;

/**
 * The product's name.
 *
 * Was "DOC Unified Digital ERP" in the top nav and "DOC Unified Digital
 * Platform" on the launcher — two names for one product, on two screens one
 * click apart. The backend's `PROJECT_NAME` is a third instance of the same
 * string; it is a server-side default and left alone here.
 */
export const PRODUCT_NAME = 'DOC Unified Digital ERP';
