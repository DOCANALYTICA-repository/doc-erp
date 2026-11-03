import React from 'react';

import { Card } from './Card';

/**
 * Loading placeholders shaped like the thing that is loading.
 *
 * `PageLoader` (a centred spinner) is the right answer when you have no idea
 * what is coming. When you DO know — a table, a stat row, a list — a skeleton
 * of roughly the right shape is better: the layout does not jump when data
 * arrives, and the user can see what they are waiting for.
 *
 * The design canvas specifies this explicitly (its `.om-sk` shimmer), and
 * before this component the ERP had no loading states at all on most screens —
 * a slow request rendered a blank panel.
 *
 * `aria-hidden` plus a single polite live region: announcing twelve
 * placeholder bars to a screen reader is worse than announcing nothing, so the
 * shapes are hidden and one "Loading…" message is announced instead.
 */

const Bar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-md bg-muted ${className}`} />
);

const StatsSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: 4 }).map((_, i) => (
      // The same Card as the real thing, so the layout does not shift by a
      // pixel when the data lands.
      <Card key={i} padding="md" elevation="none">
        <Bar className="h-3 w-24" />
        <Bar className="mt-3 h-7 w-16" />
      </Card>
    ))}
  </div>
);

const ListSkeleton = () => (
  <div className="flex flex-col gap-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
      >
        <div className="flex-1">
          <Bar className="h-4 w-1/3" />
          <Bar className="mt-2 h-3 w-1/2" />
        </div>
        <Bar className="h-6 w-20 rounded-full" />
      </div>
    ))}
  </div>
);

const TableSkeleton = () => (
  <div className="overflow-hidden rounded-lg border border-border bg-card">
    <div className="border-b border-border bg-muted px-6 py-3">
      <Bar className="h-3 w-40" />
    </div>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-6 border-b border-border px-6 py-4 last:border-0">
        <Bar className="h-4 w-28" />
        <Bar className="h-4 w-24" />
        <Bar className="h-4 flex-1" />
        <Bar className="h-6 w-20 rounded-full" />
      </div>
    ))}
  </div>
);

const DetailSkeleton = () => (
  <div className="flex flex-col gap-6">
    <div>
      <Bar className="h-7 w-1/3" />
      <Bar className="mt-2 h-4 w-1/2" />
    </div>
    <Card elevation="none">
      <Bar className="h-4 w-1/4" />
      <Bar className="mt-3 h-3 w-full" />
      <Bar className="mt-2 h-3 w-5/6" />
      <Bar className="mt-2 h-3 w-2/3" />
    </Card>
  </div>
);

const VARIANTS = {
  stats: StatsSkeleton,
  list: ListSkeleton,
  table: TableSkeleton,
  detail: DetailSkeleton,
} as const;

export const PageSkeleton: React.FC<{
  variant: keyof typeof VARIANTS;
  label?: string;
}> = ({ variant, label = 'Loading' }) => {
  const Shape = VARIANTS[variant];
  return (
    <div>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true">
        <Shape />
      </div>
    </div>
  );
};
