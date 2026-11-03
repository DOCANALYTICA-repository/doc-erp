import React from 'react';

/**
 * A labelled number.
 *
 * There were three parallel implementations of this idea: a file-local `Tile`
 * in `clubs/tabs/DashboardTab.tsx`, `StatRow` in `charts.tsx`, and
 * `ActionCard` + a `URGENCY_STYLE` colour map in `modules/inbox/Inbox.tsx`.
 * Same shape, three sets of type sizes and three ideas about what "urgent"
 * looks like.
 *
 * `tabular-nums` on the value is not decoration: without it, a column of
 * figures with different digits jitters as it updates, because proportional
 * digits have different widths.
 */

const URGENCY: Record<string, { tone: string; label: string }> = {
  overdue: { tone: 'text-error', label: 'Overdue' },
  due: { tone: 'text-warning', label: 'Due soon' },
  ok: { tone: 'text-secondary', label: '' },
};

const TONE: Record<string, string> = {
  default: 'bg-card border-border',
  muted: 'bg-muted border-border',
  accent: 'bg-accent-muted border-gold-300',
};

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  /** Secondary line under the value — a delta, a denominator, a date. */
  hint?: string;
  tone?: keyof typeof TONE;
  icon?: React.ComponentType<{ className?: string }>;
  /** Colours the hint when the number carries a deadline. */
  urgency?: keyof typeof URGENCY;
}> = ({ label, value, hint, tone = 'default', icon: Icon, urgency }) => {
  const urgencyStyle = urgency ? URGENCY[urgency] : null;

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border p-5 shadow-sm ${TONE[tone]}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-secondary">{label}</p>
        <p className="mt-1 font-heading text-2xl font-semibold tracking-tight tabular-nums text-primary">
          {value}
        </p>
        {hint ? (
          <p className={`mt-1 text-xs ${urgencyStyle?.tone ?? 'text-secondary'}`}>{hint}</p>
        ) : null}
      </div>
      {Icon ? <Icon className="h-7 w-7 shrink-0 text-sand-400" aria-hidden="true" /> : null}
    </div>
  );
};
