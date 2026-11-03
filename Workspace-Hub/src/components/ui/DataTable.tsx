import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Card } from './Card';

/**
 * One table, instead of eight hand-rolled `<table>` elements each with its own
 * padding, header casing and border colours.
 *
 * Keeps real semantic table markup — a screen reader announces row and column
 * counts from it — and scrolls horizontally inside its own container so a wide
 * table never makes the whole page scroll sideways on a phone.
 *
 * ── Why `expandable` exists ─────────────────────────────────────────────────
 *
 * `MyClaimsTab` and `ReviewQueueTab` both needed a detail row beneath each
 * claim, which this component could not do — so both hand-copied its exact
 * class strings into their own `<table>`. That left three tables that had to be
 * restyled in lockstep, with nothing to catch it when they drifted (and they
 * had). Supporting the feature properly deletes both copies.
 */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Hidden below the `sm` breakpoint; use for columns that are nice-to-have. */
  secondary?: boolean;
  align?: 'left' | 'right';
  /**
   * Turn this cell's content into the row's navigation link.
   *
   * Set on exactly ONE column — conventionally the first, whose content
   * identifies the row. See the note on `rowHref` below for why row
   * navigation is a link in a cell rather than a click handler on the `<tr>`.
   */
  isRowLink?: boolean;
}

export interface ExpandableConfig<T> {
  /** The detail panel, rendered in a full-width row beneath its parent. */
  renderDetail: (row: T) => React.ReactNode;
  /** Keys currently open. Controlled — the caller owns the state. */
  expandedKeys: string[];
  onToggle: (key: string) => void;
  /** Accessible label for the toggle, e.g. `(open) => open ? 'Hide' : 'Show'`. */
  toggleLabel?: (isOpen: boolean, row: T) => string;
  /**
   * Which rows can be opened at all. Defaults to every row.
   *
   * Needed because "has a detail panel" is often a property of the DATA, not
   * of the table: only a returned claim can be resubmitted, so only a returned
   * claim should offer an expander. Rendering a disabled-looking chevron on
   * every row would promise an action that does not exist.
   */
  canExpand?: (row: T) => boolean;
  /**
   * Render the chevron column. Default true.
   *
   * Set false when the caller already has its own triggers in a cell — the
   * review queue opens its detail panel from a paperclip button and a
   * "Revise or reject" button, and a third, redundant chevron beside them
   * would be a second way to do the same thing with a different label.
   */
  showToggle?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyState,
  expandable,
  rowHref,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  caption?: string;
  emptyState?: React.ReactNode;
  expandable?: ExpandableConfig<T>;
  /**
   * Where a row leads. Renders a real `<Link>` inside the column marked
   * `isRowLink`, and highlights the whole row on hover so it still reads as
   * one target.
   *
   * Deliberately NOT an `onRowClick` on the `<tr>`. A clickable table row with
   * no focusable element inside it cannot be reached by keyboard, is announced
   * as nothing, and cannot be opened in a new tab — so whole-row click is an
   * affordance only mouse users get. A link in the identifying cell gives
   * everyone the same behaviour, and the `group-hover` on the row keeps the
   * larger click target for the mouse.
   */
  rowHref?: (row: T) => string;
}) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const cellPad = 'px-6 py-4';
  const showToggle = expandable ? expandable.showToggle !== false : false;
  const colCount = columns.length + (showToggle ? 1 : 0);

  return (
    // `padding="none"` because a table supplies its own cell padding, and
    // `overflow-hidden` keeps the header band's corners inside the rounded
    // frame. Routing the shell through Card is what stops this being a fourth
    // spelling of the card border/background/radius.
    <Card padding="none" className="overflow-x-auto overflow-hidden">
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="border-b border-border bg-muted text-xs font-semibold uppercase tracking-wide text-secondary">
          <tr>
            {showToggle ? <th scope="col" className="w-10 px-2" /> : null}
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className={[
                  'px-6 py-3 whitespace-nowrap',
                  col.align === 'right' ? 'text-right' : '',
                  col.secondary ? 'hidden sm:table-cell' : '',
                ].join(' ')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-primary">
          {rows.map(row => {
            const key = getRowKey(row);
            const isOpen = expandable?.expandedKeys.includes(key) ?? false;

            return (
              <React.Fragment key={key}>
                <tr className="group transition-colors hover:bg-muted/50">
                  {showToggle && expandable ? (
                    <td className="px-2 align-middle">
                      {expandable.canExpand && !expandable.canExpand(row) ? null : (
                      <button
                        type="button"
                        onClick={() => expandable.onToggle(key)}
                        aria-expanded={isOpen}
                        // A bare chevron is unlabelled to a screen reader, and
                        // aria-expanded alone does not say what expands.
                        aria-label={
                          expandable.toggleLabel?.(isOpen, row) ??
                          (isOpen ? 'Hide details' : 'Show details')
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-secondary transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                      )}
                    </td>
                  ) : null}
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={[
                        cellPad,
                        'align-middle',
                        col.align === 'right' ? 'text-right' : '',
                        col.secondary ? 'hidden sm:table-cell' : '',
                      ].join(' ')}
                    >
                      {rowHref && col.isRowLink ? (
                        <Link
                          to={rowHref(row)}
                          className="block rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {col.render(row)}
                        </Link>
                      ) : (
                        col.render(row)
                      )}
                    </td>
                  ))}
                </tr>
                {expandable && isOpen ? (
                  <tr className="bg-muted/40">
                    <td colSpan={colCount} className="px-6 py-4">
                      {expandable.renderDetail(row)}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
