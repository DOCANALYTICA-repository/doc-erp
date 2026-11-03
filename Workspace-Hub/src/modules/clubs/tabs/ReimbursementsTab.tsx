import React from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Receipt } from 'lucide-react';

import { useClubReimbursements } from '../../../api/hooks';
import { api } from '../../../services/api';
import { clubKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Reimbursement } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, NumberField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';

/**
 * `amount` is a real number, not a string that gets `Number(...)`-ed at the
 * last moment.
 *
 * The old form read `Number(amount) || 0`, which turns any unparseable input
 * — and the empty string — into a request for **zero rupees**. A club asking
 * to be reimbursed ₹0 is worse than a validation error, because it succeeds.
 *
 * The receipt link is optional but must be a URL if given: the table renders
 * it as an anchor, and "receipt.pdf" as an href goes nowhere.
 */
const reimbursementSchema = z.object({
  amount: z
    .number({ message: 'Enter the amount you are claiming.' })
    .positive('The amount must be more than zero.'),
  receipt_url: z
    .string()
    .trim()
    .url('Enter a full link, starting with http:// or https://.')
    .optional()
    .or(z.literal('')),
});

export const ReimbursementsTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: rows, isLoading, isError, error, refetch } = useClubReimbursements(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);

  const form = useZodForm(reimbursementSchema, {
    defaultValues: { amount: undefined, receipt_url: '' },
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const submit = withServerErrors(form, async values => {
    await api.post(`/clubs/${clubId}/reimbursements`, {
      club_id: clubId,
      amount: values.amount,
      // Empty string is not a URL; send null so the table renders "None
      // attached" rather than a link to nowhere.
      receipt_url: values.receipt_url?.trim() ? values.receipt_url.trim() : null,
    });
    reset();
    setIsOpen(false);
    showToast({ body: 'Reimbursement request submitted.', type: 'info' });
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'reimbursements') });
    refreshShell();
  });

  if (isLoading) return <PageSkeleton variant="table" label="Loading reimbursements" />;
  if (isError) return <ErrorState title="Reimbursements didn't load" error={error} onRetry={() => void refetch()} />;

  const columns: Column<Reimbursement>[] = [
    { key: 'by', header: 'Requested by', render: r => <span className="font-medium text-primary">{r.requested_by}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: r => `Rs ${r.amount.toLocaleString('en-IN')}` },
    { key: 'status', header: 'Status', render: r => <StatusChip status={r.status} /> },
    {
      key: 'receipt', header: 'Receipt', secondary: true,
      render: r =>
        // Previously an unconditional "View Receipt" link, even when
        // receipt_url was null — a link that did nothing at all.
        r.receipt_url ? (
          <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            View receipt
          </a>
        ) : (
          <span className="text-secondary">None attached</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Reimbursement vouchers"
        action={
          bootstrap.capabilities.can_write ? (
            <Button label="New request" variant="primary" size="sm" clickAction={() => setIsOpen(o => !o)} />
          ) : null
        }
      />

      {isOpen ? (
        <Card as="form" padding="md" className="flex flex-col gap-4 text-sm shadow-sm" onSubmit={handleSubmit(submit)} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              control={control}
              name="amount"
              label="Amount (Rs)"
              min={1}
              isRequired
            />
            <TextField
              control={control}
              name="receipt_url"
              label="Receipt link"
              placeholder="https://…"
            />
          </div>

          <FormError message={rootServerError(errors)} />

          <div>
            <Button
              label={isSubmitting ? 'Submitting…' : 'Submit request'}
              variant="primary"
              isDisabled={isSubmitting}
              type="submit"
            />
          </div>
        </Card>
      ) : null}

      <DataTable
        caption="Reimbursement requests"
        columns={columns}
        rows={rows ?? []}
        getRowKey={r => r.id}
        emptyState={<EmptyState title="No reimbursement requests" icon={Receipt} />}
      />
    </div>
  );
};
