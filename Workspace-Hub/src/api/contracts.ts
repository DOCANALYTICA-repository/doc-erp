import { z } from 'zod';

/**
 * Runtime contract checks on the few responses whose silent drift is most
 * damaging.
 *
 * The generated types in ./types.ts already make it impossible for THIS
 * codebase to name a field the server does not send — but they are erased at
 * runtime, so they cannot catch a DEPLOYED backend that is older or newer than
 * the bundle. That is the situation BLK-05 was really in: the field was simply
 * absent from the response, and the UI rendered a broken image rather than
 * saying anything.
 *
 * These are deliberately NOT applied to every endpoint. Validating 80 schemas
 * on every response buys very little and costs real time on large lists; these
 * four are the ones where a missing field silently breaks a workflow rather
 * than a display.
 */

/** Never let a validation failure take the screen down — warn and continue. */
function lenient<T>(schema: z.ZodType<T>, label: string) {
  return (data: unknown): T => {
    const result = schema.safeParse(data);
    if (result.success) return result.data as T;

    // Loud in development, non-fatal in production: a contract drift should
    // be impossible to miss while building, and should not blank a page for a
    // user who could otherwise carry on.
    const message = `API contract drift on ${label}: ${result.error.issues
      .map(i => `${i.path.join('.') || '(root)'} ${i.message}`)
      .join('; ')}`;

    if (import.meta.env.DEV) {
      throw new Error(message);
    }
    console.error(message, data);
    return data as T;
  };
}

const capabilitiesSchema = z.object({
  can_read: z.boolean(),
  can_write: z.boolean(),
  can_edit_hierarchy: z.boolean(),
  can_manage_settings: z.boolean(),
  can_assign_tasks: z.boolean(),
  can_approve_plan: z.boolean(),
  can_manage_members: z.boolean(),
  can_file_yellow_forms: z.boolean(),
});

/**
 * The workspace shell. If `visible_tabs` or `capabilities` drifted, the UI
 * would silently render the wrong affordances for the wrong people — which is
 * the exact failure mode this endpoint exists to prevent.
 */
export const parseClubBootstrap = lenient(
  z.object({
    club: z.object({
      id: z.string(),
      name: z.string(),
      // BLK-05 lived exactly here: the column existed and was populated, and
      // the schema omitted it, so the club header rendered a broken image on
      // every tab against the real backend.
      logo: z.string().nullable(),
      category: z.string(),
    }).loose(),
    relationship: z.string(),
    capabilities: capabilitiesSchema,
    visible_tabs: z.array(z.string()).min(1),
    /*
     * All four counters, not just two.
     *
     * `DashboardTab` dereferences `counters.budget_spent.toLocaleString()` and
     * `counters.open_tasks`, so a backend that stopped sending either would
     * CRASH the tab rather than raise the contract warning this file exists to
     * raise — which is the exact failure mode it was written to prevent. The
     * gap surfaced while writing a test mock, which had to supply both fields
     * to stop the tab throwing.
     */
    counters: z.object({
      members: z.number(),
      events: z.number(),
      budget_spent: z.number(),
      open_tasks: z.number(),
    }).loose(),
    hierarchy: z.array(z.unknown()),
    members: z.array(z.unknown()),
  }).loose(),
  'GET /clubs/{id}/bootstrap',
);

/**
 * The session. A missing `permissions` array would fail OPEN in every
 * hasPermission() check, which is the worst possible direction.
 */
export const parseUserProfile = lenient(
  z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    primary_role: z.enum(['public', 'student', 'faculty', 'super_admin']),
    permissions: z.array(z.string()),
  }).loose(),
  'GET /auth/me',
);

/**
 * BLK-04's field. The dev mock supplied it under the key `faculty` while the
 * API omitted it entirely, so the claim form named a subject and an hour and
 * nothing about whose class it was.
 */
export const parseTimetable = lenient(
  z.array(
    z.object({
      id: z.string(),
      subject: z.string(),
      hour: z.string(),
      day_of_week: z.string(),
      faculty_id: z.string(),
      faculty_name: z.string(),
    }).loose(),
  ),
  'GET /claims/timetable',
);

/** The inbox. Every card needs somewhere to go. */
export const parseActionQueue = lenient(
  z.object({
    items: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        title: z.string(),
        href: z.string().min(1),
        entity_type: z.string(),
        entity_id: z.string(),
        urgency: z.enum(['overdue', 'today', 'soon', 'normal']),
      }).loose(),
    ),
    total: z.number(),
  }).loose(),
  'GET /me/action-queue',
);
