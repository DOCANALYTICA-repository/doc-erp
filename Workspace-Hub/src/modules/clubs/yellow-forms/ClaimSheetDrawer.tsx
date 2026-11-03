import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { useYellowFormInvalidator } from '../../../api/hooks';
import type { ClaimSheet } from '../../../api/types';
import { describeError } from '../../../services/errors';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import {
  ClaimSheetDetail,
  ExportCsvButton,
  ReviewPanel,
  YellowFormStatusChip,
  buildClaimGrid,
  claimGridSourceFromSheet,
  validateClaimGrid,
  yellowFormApi,
} from '../../yellow-forms';

/**
 * A claim sheet as filed: the attached pre-approved list and the sheet in the
 * template's layout. Editing happens in ClaimSheetEditor; every button here
 * comes from the sheet's `viewer_can_*` flags.
 */
export const ClaimSheetDrawer: React.FC<{
  sheet: ClaimSheet | undefined;
  onClose: () => void;
  onEdit: (sheet: ClaimSheet) => void;
  onViewPreApproval: (preApprovalId: string) => void;
}> = ({ sheet, onClose, onEdit, onViewPreApproval }) => {
  const showToast = useToast();
  const invalidate = useYellowFormInvalidator();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  if (!sheet) return null;

  const submit = async () => {
    const grid = buildClaimGrid(claimGridSourceFromSheet(sheet), sheet);
    // An empty saved sheet seeds a grid with everyone included; what is on file is nobody.
    const onFile =
      sheet.students.length === 0
        ? { ...grid, students: grid.students.map(student => ({ ...student, included: false })) }
        : grid;
    const [first] = validateClaimGrid(onFile, 'submit');
    if (first) {
      showToast({ body: `${first.message} Edit the claim sheet to fix it.`, type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      await yellowFormApi.submitClaimSheet(sheet.id);
      showToast({ body: 'Claim sheet submitted to the Claims Coordinator.', type: 'info' });
      invalidate();
    } catch (e) {
      showToast({ body: describeError(e), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await yellowFormApi.deleteClaimSheet(sheet.id);
      setIsConfirmingDelete(false);
      showToast({ body: 'Draft claim sheet deleted.', type: 'info' });
      invalidate();
      onClose();
    } catch (e) {
      setDeleteError(describeError(e));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Drawer
        isOpen
        onClose={onClose}
        // A half-typed review reason must survive a stray backdrop click.
        purpose={sheet.viewer_can_review ? 'form' : 'info'}
        // Wide enough for the template's 13 columns at laptop widths.
        width={1040}
        title="Claim sheet"
        subtitle={sheet.reference_number}
        headerContent={<YellowFormStatusChip status={sheet.status} label={sheet.status_label} />}
        actions={
          <>
            {sheet.viewer_can_delete ? (
              <Button
                label="Delete draft"
                variant="destructive"
                isDisabled={isSubmitting}
                clickAction={() => {
                  setDeleteError(null);
                  setIsConfirmingDelete(true);
                }}
              />
            ) : null}
            <Button
              label="View pre-approval"
              variant="secondary"
              clickAction={() => onViewPreApproval(sheet.pre_approval_id)}
            />
            <ExportCsvButton sheet={sheet} size="md" />
            {sheet.viewer_can_edit ? (
              <Button
                label="Edit claim sheet"
                variant={sheet.viewer_can_submit ? 'secondary' : 'primary'}
                isDisabled={isSubmitting}
                clickAction={() => onEdit(sheet)}
              />
            ) : null}
            {sheet.viewer_can_submit ? (
              <Button
                label="Submit to Claims Coordinator"
                variant="primary"
                isDisabled={isSubmitting}
                isLoading={isSubmitting}
                clickAction={submit}
              />
            ) : null}
          </>
        }
      >
        <ClaimSheetDetail sheet={sheet} />
        {sheet.viewer_can_review ? (
          <ReviewPanel key={sheet.id} kind="claim_sheet" id={sheet.id} className="mt-6" />
        ) : null}
      </Drawer>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete this draft claim sheet?"
        body={`${sheet.reference_number} for "${sheet.event_name}" will be deleted. You can file a new claim sheet for the event afterwards.`}
        confirmLabel="Delete draft"
        isBusy={isDeleting}
        error={deleteError ?? undefined}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setIsConfirmingDelete(false);
          setDeleteError(null);
        }}
      />
    </>
  );
};
