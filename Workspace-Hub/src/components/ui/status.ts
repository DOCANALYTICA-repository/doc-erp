/**
 * ONE semantic status map, used everywhere.
 *
 * docPortalTheme.ts defines Grey + Sky Blue in eleven tokens and the screens
 * then hardcoded indigo, rose, emerald, amber and yellow and almost never
 * touched them — so "approved" was emerald in one table and sky in another,
 * and seven invented colour families competed with the actual accent.
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
  attendance_office: 'in_review',

  // annual plan workflow
  faculty_coordinator_review: 'in_review',
  cultural_coordinator_review: 'in_review',
  hod_review: 'in_review',
  locked: 'closed',

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
 * Tailwind classes per semantic state.
 *
 * Sky is reserved for the accent — the thing the eye should go to — so
 * "approved" is green and "in review" is amber rather than both competing
 * with the brand colour.
 */
export const STATUS_CLASSES: Record<SemanticStatus, { chip: string; dot: string; text: string }> = {
  draft:     { chip: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400',   text: 'text-slate-600' },
  pending:   { chip: 'bg-sky-50 text-sky-700',        dot: 'bg-sky-500',     text: 'text-sky-700' },
  in_review: { chip: 'bg-amber-50 text-amber-700',    dot: 'bg-amber-500',   text: 'text-amber-700' },
  approved:  { chip: 'bg-emerald-50 text-emerald-700',dot: 'bg-emerald-500', text: 'text-emerald-700' },
  rejected:  { chip: 'bg-rose-50 text-rose-700',      dot: 'bg-rose-500',    text: 'text-rose-700' },
  closed:    { chip: 'bg-slate-100 text-slate-500',   dot: 'bg-slate-400',   text: 'text-slate-500' },
};

/** "pending_review" -> "Pending review". */
export function humanizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  const spaced = raw.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
