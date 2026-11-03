import React from 'react';

import { daysBetween, formatDate, todayIst } from '../../yellow-forms';

/** The cell that identifies a row, as the control that opens it. */
export const OpenFormButton: React.FC<{
  label: string;
  detail?: string;
  onOpen: () => void;
}> = ({ label, detail, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex flex-col items-start rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
  >
    <span className="font-medium text-primary">{label}</span>
    {detail ? <span className="text-xs text-secondary">{detail}</span> : null}
    <span className="sr-only"> — open</span>
  </button>
);

/** An empty section, said in one line: three dashed panels on one screen would shout. */
export const SectionEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-secondary">
    {children}
  </p>
);

/** "6 Oct 2026" with how long is left, pressing when it is today or tomorrow. */
export const ApproveByCell: React.FC<{ deadline: string }> = ({ deadline }) => {
  const days = daysBetween(todayIst(), deadline);
  const hint = days === 0 ? 'Last day today' : days === 1 ? 'Tomorrow' : days > 1 ? `${days} days left` : null;
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="tabular-nums">{formatDate(deadline)}</span>
      {hint ? (
        <span className={`text-xs ${days <= 1 ? 'font-medium text-warning' : 'text-secondary'}`}>{hint}</span>
      ) : null}
    </span>
  );
};
