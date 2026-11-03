import React from 'react';
import { Link } from 'react-router-dom';

/**
 * One row in a list of things.
 *
 * `flex items-center justify-between gap-3` with a title and a meta line was
 * written out by hand in the faculty overview, the clubs dashboard, the
 * notification tray, the inbox and most list tabs. Each picked its own text
 * sizes, so the same information looked different depending on which screen
 * you reached it from.
 *
 * On interactivity: pass `href` for navigation and `onClick` for an action.
 * `href` renders a real `<Link>`, which matters — a clickable `<div>` cannot
 * be focused, cannot be opened in a new tab, and is announced as nothing at
 * all. Never pass both.
 */
export const ListRow: React.FC<{
  title: React.ReactNode;
  /** Secondary line — dates, owners, counts. */
  meta?: React.ReactNode;
  /** An eyebrow above the title: a type, a reference number. */
  eyebrow?: React.ReactNode;
  /** Icon or avatar on the left. */
  leading?: React.ReactNode;
  /** Status chip or badge, shown before the action. */
  status?: React.ReactNode;
  /** A button. Rendered outside the link target so it stays clickable. */
  action?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** `li` when the row sits in a `<ul>`, so the list semantics are real. */
  as?: 'div' | 'li';
}> = ({ title, meta, eyebrow, leading, status, action, href, onClick, as: Tag = 'div' }) => {
  const body = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {eyebrow}
          </div>
        ) : null}
        <div className="truncate text-sm font-medium text-primary">{title}</div>
        {meta ? <div className="mt-0.5 truncate text-sm text-secondary">{meta}</div> : null}
      </div>
    </div>
  );

  const frame =
    'flex items-start justify-between gap-3 rounded-md border border-border bg-card px-4 py-3';
  const interactive = 'transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <Tag className={frame}>
      {href ? (
        <Link to={href} className={`flex min-w-0 flex-1 rounded-md ${interactive}`}>
          {body}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`flex min-w-0 flex-1 rounded-md text-left ${interactive}`}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {status || action ? (
        <div className="flex shrink-0 items-center gap-3">
          {status}
          {action}
        </div>
      ) : null}
    </Tag>
  );
};
