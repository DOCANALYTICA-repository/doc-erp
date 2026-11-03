import React from 'react';

import { STATUS_CLASSES, toSemanticStatus } from '../../components/ui/status';

/**
 * StatusChip, but worded by the server: `status_label` ("With Associate HOD")
 * instead of the humanized raw status, and "Expired" for a pre-approval whose
 * event started before it was fully approved.
 */
export const YellowFormStatusChip: React.FC<{
  status: string;
  label: string;
  isExpired?: boolean;
  className?: string;
}> = ({ status, label, isExpired = false, className = '' }) => {
  const styles = STATUS_CLASSES[toSemanticStatus(isExpired ? 'expired' : status)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      {isExpired ? 'Expired' : label}
    </span>
  );
};
