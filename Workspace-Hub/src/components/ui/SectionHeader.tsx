import React from 'react';

/**
 * A section title with an optional action, so every tab starts the same way.
 *
 * This is an h2 — a SECTION heading. The screen's own name is an h1 and comes
 * from `PageHeader`. Keep the levels distinct: two h1s on a screen, or a
 * section that outranks its page, both break the document outline a
 * screen-reader user navigates by.
 */
export const SectionHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="font-heading text-base font-semibold text-primary">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-secondary">{description}</p> : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);
