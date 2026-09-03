import React from 'react';

/**
 * Small, dependency-free chart primitives.
 *
 * The analytics endpoint costs 16 queries and ~2.7 seconds to produce nine
 * carefully computed objects, and the UI rendered them as
 * `JSON.stringify(data, null, 2)` inside a `<pre>`. The payload was already
 * right; this is purely a rendering problem, so it does not need a charting
 * library — inline SVG and flexbox cover every shape in that payload.
 *
 * Accessibility note: every chart carries a real text alternative, because an
 * SVG of bars is invisible to a screen reader otherwise.
 */

const PALETTE = ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'];

export const StatRow: React.FC<{ items: { label: string; value: string | number }[] }> = ({ items }) => (
  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
    {items.map(item => (
      <div key={item.label}>
        <dt className="text-sm text-slate-500">{item.label}</dt>
        <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{item.value}</dd>
      </div>
    ))}
  </dl>
);

/** Horizontal bars — the right shape for ranked categories with long labels. */
export const BarList: React.FC<{
  items: { label: string; value: number }[];
  formatValue?: (n: number) => string;
  emptyLabel?: string;
}> = ({ items, formatValue = n => String(n), emptyLabel = 'No data yet' }) => {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map(i => i.value), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map(item => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">
              {formatValue(item.value)}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-600"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/** A single proportion, e.g. budget used or attendance rate. */
export const Gauge: React.FC<{
  percent: number;
  label: string;
  caption?: string;
  danger?: boolean;
}> = ({ percent, label, caption, danger }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`text-2xl font-semibold tabular-nums ${danger ? 'text-rose-600' : 'text-slate-900'}`}>
          {clamped}%
        </span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${danger ? 'bg-rose-500' : 'bg-sky-600'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {caption ? <p className="mt-2 text-sm text-slate-500">{caption}</p> : null}
    </div>
  );
};

/** A time series as a column chart — months, academic years, etc. */
export const ColumnChart: React.FC<{
  items: { label: string; value: number }[];
  formatValue?: (n: number) => string;
  emptyLabel?: string;
}> = ({ items, formatValue = n => String(n), emptyLabel = 'Nothing recorded yet' }) => {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map(i => i.value), 1);

  return (
    <figure>
      <div className="flex h-32 items-end gap-2" role="presentation">
        {items.map((item, i) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums text-slate-600">
              {formatValue(item.value)}
            </span>
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.max(4, (item.value / max) * 100)}%`,
                backgroundColor: PALETTE[i % PALETTE.length],
              }}
            />
            <span className="w-full truncate text-center text-xs text-slate-500" title={item.label}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {items.map(i => `${i.label}: ${formatValue(i.value)}`).join('; ')}
      </figcaption>
    </figure>
  );
};

/** Two series side by side per category — allocated vs spent, for instance. */
export const GroupedColumnChart: React.FC<{
  items: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
  formatValue?: (n: number) => string;
}> = ({ items, aLabel, bLabel, formatValue = n => String(n) }) => {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">No comparison data yet</p>;
  }
  const max = Math.max(...items.flatMap(i => [i.a, i.b]), 1);

  return (
    <figure>
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-600" aria-hidden="true" /> {aLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-300" aria-hidden="true" /> {bLabel}
        </span>
      </div>
      <div className="mt-3 flex h-32 items-end gap-4">
        {items.map(item => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div className="w-1/3 rounded-t bg-sky-600" style={{ height: `${Math.max(3, (item.a / max) * 100)}%` }} />
              <div className="w-1/3 rounded-t bg-sky-300" style={{ height: `${Math.max(3, (item.b / max) * 100)}%` }} />
            </div>
            <span className="w-full truncate text-center text-xs text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {items.map(i => `${i.label}: ${aLabel} ${formatValue(i.a)}, ${bLabel} ${formatValue(i.b)}`).join('; ')}
      </figcaption>
    </figure>
  );
};
