import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { useYellowFormInvalidator } from '../../../api/hooks';
import type { PreApproval } from '../../../api/types';
import { describeError } from '../../../services/errors';
import { Drawer } from '../../../components/ui/Drawer';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Notice, PreApprovalDetail, ReviewPanel, YellowFormStatusChip, yellowFormApi } from '../../yellow-forms';

/**
 * One pre-approval, for reading and acting on. Every button comes from the
 * form's `viewer_can_*` flags; the server decides who may do what.
 */
export const PreApprovalDrawer: React.FC<{
  form: PreApproval | undefined;
  onClose: () => void;
  onEdit: (form: PreApproval) => void;
  onFileClaimSheet: (form: PreApproval) => void;
  onOpenClaimSheet: (claimSheetId: string) => void;
}> = ({ form, onClose, onEdit, onFileClaimSheet, onOpenClaimSheet }) => {
  const showToast = useToast();
  const invalidate = useYellowFormInvalidator();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  if (!form) return null;

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const updated = await yellowFormApi.submitPreApproval(form.id);
      showToast({
        body: `Submitted for approval.${updated.pending_with ? ` Waiting on ${updated.pending_with}.` : ''}`,
        type: 'info',
      });
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
      await yellowFormApi.deletePreApproval(form.id);
      setIsConfirmingDelete(false);
      showToast({ body: 'Draft deleted.', type: 'info' });
      invalidate();
      onClose();
    } catch (e) {
      setDeleteError(describeError(e));
    } finally {
      setIsDeleting(false);
    }
  };

  const claimSheetId = form.claim_sheet_id;
  const hasActions =
    form.viewer_can_delete ||
    form.viewer_can_edit ||
    form.viewer_can_submit ||
    form.viewer_can_file_claim_sheet ||
    Boolean(claimSheetId);

  return (
    <>
      <Drawer
        isOpen
        onClose={onClose}
        // A half-typed review reason must survive a stray backdrop click.
        purpose={form.viewer_can_review ? 'form' : 'info'}
        width={600}
        title="Pre-approval"
        subtitle={form.reference_number}
        headerContent={
          <YellowFormStatusChip status={form.status} label={form.status_label} isExpired={form.is_expired} />
        }
        actions={
          hasActions ? (
            <>
              {form.viewer_can_delete ? (
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
              {form.viewer_can_edit ? (
                <Button label="Edit" variant="secondary" isDisabled={isSubmitting} clickAction={() => onEdit(form)} />
              ) : null}
              {claimSheetId ? (
                <Button
                  label="Open claim sheet"
                  variant="secondary"
                  clickAction={() => onOpenClaimSheet(claimSheetId)}
                />
              ) : null}
              {form.viewer_can_file_claim_sheet ? (
                <Button label="File claim sheet" variant="primary" clickAction={() => onFileClaimSheet(form)} />
              ) : null}
              {form.viewer_can_submit ? (
                <Button
                  label="Submit for approval"
                  variant="primary"
                  isDisabled={isSubmitting}
                  isLoading={isSubmitting}
                  clickAction={submit}
                />
              ) : null}
            </>
          ) : undefined
        }
      >
        {form.submit_blocked_reason ? (
          <Notice tone="warning" title="Can't be submitted yet" className="mb-5">
            {form.submit_blocked_reason}
          </Notice>
        ) : null}
        <PreApprovalDetail form={form} />
        {form.viewer_can_review ? (
          <ReviewPanel key={form.id} kind="pre_approval" id={form.id} className="mt-6" />
        ) : null}
      </Drawer>

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title="Delete this draft?"
        body={`"${form.event_name}" (${form.reference_number}) will be deleted with its student list. This cannot be undone.`}
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
