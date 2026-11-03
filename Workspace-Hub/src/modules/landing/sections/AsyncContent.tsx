import React from 'react';

import { ErrorState } from '../../../components/ui/ErrorState';
import { EmptyState } from '../../../components/ui/EmptyState';

/**
 * Loading, error and empty states for a CMS-backed landing section.
 *
 * This is the biggest UX gap the revamp closed on the public page, and it cost
 * almost nothing. Every section destructured its query as `{ data = [] }` and
 * rendered `data.map(...)` — so a slow Content Engine, a failed request and a
 * genuinely empty catalogue all produced the same thing: a heading with an
 * empty grid under it, forever, with no indication that anything was wrong.
 *
 * The three states are deliberately distinct:
 *  - pending → a skeleton of roughly the right shape, so the layout does not
 *    jump when content lands
 *  - error   → `ErrorState`, with a retry, because "we could not load this" is
 *    not the same claim as "there is nothing here"
 *  - settled and empty → `EmptyState`, which says the second thing honestly
 */
/**
 * The slice of a TanStack query result these sections need.
 *
 * Typed structurally rather than as `UseQueryResult` so a caller can pass a
 * query object straight through — and so this file does not have to import
 * TanStack's generics just to describe four fields.
 */
export interface SectionQuery<T> {
  data?: T[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function AsyncContent<T>({
  query,
  skeleton,
  emptyTitle,
  emptyDescription,
  errorTitle,
  children,
}: {
  /**
   * The whole query, not five unpacked props.
   *
   * The queries stay in `Home.tsx` rather than moving into these sections,
   * deliberately: its second GSAP effect is keyed on
   * `[courses.data?.length, clubs.data?.length]`, so the orchestrator has to
   * see when those arrays change. A section calling its own hook would hide
   * that from the effect and silently break the card reveals.
   */
  query: SectionQuery<T>;
  /** A placeholder shaped like the real content. */
  skeleton: React.ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  errorTitle: string;
  children: (items: T[]) => React.ReactNode;
}) {
  const { isPending, isError, error, refetch } = query;
  const items = query.data ?? [];

  if (isPending) {
    return (
      <>
        <span role="status" className="sr-only">
          Loading
        </span>
        <div aria-hidden="true">{skeleton}</div>
      </>
    );
  }

  if (isError) {
    return <ErrorState title={errorTitle} error={error} onRetry={() => void refetch()} />;
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return <>{children(items)}</>;
}

/** Placeholder cards, sized to the grid they stand in for. */
export const CardSkeleton: React.FC<{ count?: number; height?: string }> = ({
  count = 3,
  height = 'h-52',
}) => (
  <div className="flex flex-wrap gap-4.5">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={`flex-1 basis-[300px] animate-pulse rounded-lg bg-muted ${height}`}
      />
    ))}
  </div>
);
