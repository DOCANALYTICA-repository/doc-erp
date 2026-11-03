import React from 'react';

/**
 * The screen's own name — an h1.
 *
 * This is NOT `SectionHeader`, which is an h2 for a section inside a screen.
 * The distinction fixes a real accessibility defect: `PipelineBoard` opened at
 * h2 and `NotificationSettings` had no heading at all, so a screen-reader user
 * landing on either got no announcement of where they were, and the document
 * outline started at level 2 with nothing above it.
 *
 * Exactly one of these per screen. If you find yourself wanting a second,
 * you want `SectionHeader`.
 */
export const PageHeader: React.FC<{
  title: string;
  description?: string;
  /** Buttons. Kept in the header so primary actions are in a predictable place. */
  actions?: React.ReactNode;
  /** An eyebrow above the title — a category, a club, a reference number. */
  eyebrow?: React.ReactNode;
  /** Rendered to the left of the title block — an avatar or logo. */
  leading?: React.ReactNode;
  /** Extra detail below the description — counts, timestamps, status. */
  meta?: React.ReactNode;
}> = ({ title, description, actions, eyebrow, leading, meta }) => (
  <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
    <div className="flex min-w-0 items-start gap-4">
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0">
        {eyebrow ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-primary">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-secondary">{description}</p>
        ) : null}
        {meta ? <div className="mt-2">{meta}</div> : null}
      </div>
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </header>
);
