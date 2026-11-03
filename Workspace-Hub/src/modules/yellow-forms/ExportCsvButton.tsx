import React from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Download } from 'lucide-react';

import type { ClaimSheet } from '../../api/types';
import { describeError } from '../../services/errors';
import { yellowFormApi } from './api';

/**
 * Downloads the claim sheet as `<reference_number>.csv`, in the department's
 * template layout. Renders nothing unless the sheet says this viewer may export.
 */
export const ExportCsvButton: React.FC<{
  sheet: Pick<ClaimSheet, 'id' | 'reference_number' | 'viewer_can_export'>;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}> = ({ sheet, label = 'Download CSV', variant = 'secondary', size = 'sm' }) => {
  const showToast = useToast();
  const [busy, setBusy] = React.useState(false);

  if (!sheet.viewer_can_export) return null;

  const download = async () => {
    setBusy(true);
    try {
      await yellowFormApi.downloadClaimSheetCsv(sheet);
    } catch (e) {
      showToast({ body: `Could not download the claim sheet: ${describeError(e)}`, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      label={label}
      variant={variant}
      size={size}
      icon={<Download className="h-4 w-4" aria-hidden="true" />}
      isLoading={busy}
      isDisabled={busy}
      clickAction={download}
    />
  );
};
