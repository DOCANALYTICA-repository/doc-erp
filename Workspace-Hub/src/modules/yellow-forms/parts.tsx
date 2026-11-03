import React from 'react';

const NOTICE_TONES = {
  info: { box: 'border-gold-300 bg-accent-muted', title: 'text-primary' },
  warning: { box: 'border-warning/25 bg-warning-muted', title: 'text-warning' },
  error: { box: 'border-error/25 bg-error-muted', title: 'text-error' },
  success: { box: 'border-success/25 bg-success-muted', title: 'text-success' },
} as const;

export type NoticeTone = keyof typeof NOTICE_TONES;

/** A tinted callout for deadlines, expiry and reviewer comments. */
export const Notice: React.FC<{
  tone: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}> = ({ tone, title, children, className = '' }) => (
  <div className={`rounded-md border px-4 py-3 text-sm ${NOTICE_TONES[tone].box} ${className}`}>
    {title ? <p className={`font-semibold ${NOTICE_TONES[tone].title}`}>{title}</p> : null}
    {children ? (
      <div className={`leading-relaxed text-primary ${title ? 'mt-1' : ''}`}>{children}</div>
    ) : null}
  </div>
);

export const MetaList: React.FC<{ items: { label: string; value: React.ReactNode }[] }> = ({ items }) => (
  <dl className="flex flex-col gap-1 text-sm">
    {items.map(item => (
      <div key={item.label} className="flex gap-3">
        <dt className="w-28 shrink-0 text-secondary">{item.label}</dt>
        <dd className="min-w-0 text-primary">{item.value}</dd>
      </div>
    ))}
  </dl>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; id?: string }> = ({ children, id }) => (
  <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-secondary">
    {children}
  </h3>
);

/**
 * A dense table for drawers. DataTable's cell padding suits a full-width page;
 * a 13-column claim sheet in a side panel needs tighter cells and its own
 * horizontal scroll.
 */
export const CompactTable: React.FC<{
  caption: string;
  headers: { key: string; label: React.ReactNode; align?: 'left' | 'center' | 'right'; title?: string }[];
  children: React.ReactNode;
  /** Let long headers wrap, so a wide table fits its drawer; the frame scrolls only below that. */
  wrapHeaders?: boolean;
}> = ({ caption, headers, children, wrapHeaders = false }) => (
  <div className="overflow-x-auto rounded-md border border-border bg-card">
    <table className="w-full text-left text-xs">
      <caption className="sr-only">{caption}</caption>
      <thead className="border-b border-border bg-muted text-secondary">
        <tr>
          {headers.map(header => (
            <th
              key={header.key}
              scope="col"
              title={header.title}
              className={[
                wrapHeaders ? 'align-bottom' : 'whitespace-nowrap',
                'px-3 py-2 font-semibold',
                header.align === 'center' ? 'text-center' : header.align === 'right' ? 'text-right' : '',
              ].join(' ')}
            >
              {header.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border text-primary">{children}</tbody>
    </table>
  </div>
);

export const CELL = 'px-3 py-2 align-middle';
