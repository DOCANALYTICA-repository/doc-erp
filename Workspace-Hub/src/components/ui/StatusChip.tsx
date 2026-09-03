import React from 'react';

import { STATUS_CLASSES, humanizeStatus, toSemanticStatus } from './status';

/**
 * The single way a status is rendered in this application.
 *
 * Replaces the ad-hoc `<span className="px-2 py-0.5 rounded bg-emerald-50
 * text-emerald-600">` that was pasted into eight different tables, each
 * choosing its own colour for the same word.
 */
export const StatusChip: React.FC<{ status: string | null | undefined; className?: string }> = ({
  status,
  className = '',
}) => {
  const semantic = toSemanticStatus(status);
  const styles = STATUS_CLASSES[semantic];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      {humanizeStatus(status)}
    </span>
  );
};
