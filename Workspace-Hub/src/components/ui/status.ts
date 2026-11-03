/**
 * ONE semantic status map, used everywhere.
 *
 * The screens used to hardcode indigo, rose, emerald, amber and yellow and
 * almost never touch the theme — so "approved" was emerald in one table and
 * sky in another, and seven invented colour families competed with the actual
 * accent. This table is the fix, and it is the single highest-leverage file
 * for colour in the repo: six rows reach all eleven StatusChip importers.
 *
 * Every status in the product maps to one of six semantic states. If you need
 * a colour for a status, add it to STATUS_ALIASES; do not reach for a Tailwind
 * palette directly.
 */
export type SemanticStatus =
  | 'draft'
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'closed';

/** Every raw status string the API can return, mapped to a semantic state. */
const STATUS_ALIASES: Record<string, SemanticStatus> = {
  // shared
  draft: 'draft',
  pending: 'pending',
  submitted: 'pending',
  pending_review: 'in_review',
  under_review: 'in_review',
  in_review: 'in_review',
  approved: 'approved',
  active: 'approved',
  completed: 'closed',
  closed: 'closed',
  rejected: 'rejected',
  returned: 'rejected',
  cancelled: 'rejected',
  inactive: 'draft',
  archived: 'closed',

  // claims workflow stages
  initial_review: 'in_review',
  subject_faculty: 'in_review',
  course_coordinator: 'in_review',
  // Terminal: every approval is in and the claim has left this system.
  attendance_office: 'approved',

  // annual plan workflow
  faculty_coordinator_review: 'in_review',
  cultural_coordinator_review: 'in_review',
  hod_review: 'in_review',
  locked: 'closed',

  // yellow forms (faculty_coordinator_review, approved and returned are above)
  associate_hod_review: 'in_review',
  claims_coordinator_review: 'in_review',
  // Computed, not stored: the event started before pre-approval was complete.
  expired: 'rejected',

  // recruitment / events
  open: 'approved',
  paid: 'closed',
  executed: 'closed',
  scheduled: 'pending',
};

export function toSemanticStatus(raw: string | null | undefined): SemanticStatus {
  if (!raw) return 'draft';
  return STATUS_ALIASES[raw.toLowerCase()] ?? 'draft';
}

/**
 * Classes per semantic state — six rows that feed every StatusChip in the app.
 *
 * ── How the colours are assigned ────────────────────────────────────────────
 *
 * The accent is now GOLD, so the old assignment inverted: `pending` used to be
 * sky, and sky was the accent-adjacent hue. Keeping gold for `pending` would
 * mean the single most common status in the product — most things are pending
 * most of the time — permanently owns the one colour the eye is trained to go
 * to. So gold is reserved for `in_review`, which is the state that genuinely
 * wants a person's attention, and `pending` recedes to neutral sand.
 *
 * The four hues in play are each distinct from the accent:
 *   draft / closed  sand   — inert, no action available
 *   pending         sand   — waiting, but on someone else
 *   in_review       gold   — waiting on YOU (accent, deliberately)
 *   approved        sage   — terminal, good
 *   rejected        error  — terminal, bad
 *
 * `closed` and `draft` share the sand hue but not the step: closed is one
 * step lighter, because a finished thing should read quieter than an unstarted
 * one.
 *
 * Ramps rather than semantic tokens here because this IS the tonal layer —
 * these are the colours the semantic tokens are made of. See
 * src/theme/ramps.css.
 */
export const STATUS_CLASSES: Record<SemanticStatus, { chip: string; dot: string; text: string }> = {
  draft:     { chip: 'bg-sand-200 text-sand-700',  dot: 'bg-sand-500',  text: 'text-sand-700' },
  pending:   { chip: 'bg-sand-200 text-sand-800',  dot: 'bg-sand-600',  text: 'text-sand-800' },
  in_review: { chip: 'bg-gold-100 text-gold-800',  dot: 'bg-gold-500',  text: 'text-gold-800' },
  approved:  { chip: 'bg-sage-100 text-sage-800',  dot: 'bg-sage-600',  text: 'text-sage-800' },
  rejected:  { chip: 'bg-error-muted text-error',  dot: 'bg-error',     text: 'text-error' },
  closed:    { chip: 'bg-sand-200 text-sand-600',  dot: 'bg-sand-400',  text: 'text-sand-600' },
};

/**
 * The same six states, expressed as Astryx categorical hues.
 *
 * `Token`, `Badge` and `StatusDot` take a hue NAME rather than a class, so a
 * component using them cannot consume `STATUS_CLASSES`. `ClaimStatusStepper`
 * is the one place that needs this — it renders a clickable `Token` inside a
 * `Popover`, which `StatusChip` cannot express.
 *
 * Exported from HERE rather than declared there, so the two cannot drift.
 * They already did once: the stepper mapped `submitted` to Astryx's `blue`,
 * which rendered a literal #0074e2 chip in the middle of the warm claims
 * table. Keeping both derivations of "what colour is this status" in one file
 * is what stops that recurring.
 *
 * `blue` is deliberately absent — there is no blue in this palette. See the
 * categorical-hue note in src/theme/docPortalTheme.ts.
 */
export type StatusHue = 'gray' | 'yellow' | 'green' | 'red' | 'orange';

export const STATUS_HUES: Record<SemanticStatus, StatusHue> = {
  draft: 'gray',
  pending: 'gray', // waiting on someone else — recedes
  in_review: 'yellow', // waiting on YOU — the gold accent
  approved: 'green',
  rejected: 'red',
  closed: 'green',
};

/** "pending_review" -> "Pending review". */
export function humanizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  const spaced = raw.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
