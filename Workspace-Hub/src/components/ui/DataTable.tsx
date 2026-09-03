import React from 'react';

/**
 * One table, instead of eight hand-rolled `<table>` elements each with its own
 * padding, header casing and border colours.
 *
 * Keeps real semantic table markup — a screen reader announces row and column
 * counts from it — and scrolls horizontally inside its own container so a wide
 * table never makes the whole page scroll sideways on a phone.
 */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Hidden below the `sm` breakpoint; use for columns that are nice-to-have. */
  secondary?: boolean;
  align?: 'left' | 'right';
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyState,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  caption?: string;
  emptyState?: React.ReactNode;
}) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
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
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {rows.map(row => (
            <tr key={getRowKey(row)} className="hover:bg-slate-50/60">
              {columns.map(col => (
                <td
                  key={col.key}
                  className={[
                    'px-6 py-4 align-middle',
                    col.align === 'right' ? 'text-right' : '',
                    col.secondary ? 'hidden sm:table-cell' : '',
                  ].join(' ')}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
