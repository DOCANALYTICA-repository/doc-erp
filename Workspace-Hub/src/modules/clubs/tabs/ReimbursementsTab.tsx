import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Receipt } from 'lucide-react';

import { useClubReimbursements } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Reimbursement } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const ReimbursementsTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: rows, isLoading, isError, error, refetch } = useClubReimbursements(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  const [receiptUrl, setReceiptUrl] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post(`/clubs/${clubId}/reimbursements`, {
        club_id: clubId, amount: Number(amount) || 0, receipt_url: receiptUrl || null,
      });
      setAmount(''); setReceiptUrl(''); setIsOpen(false);
      showToast({ body: 'Reimbursement request submitted.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'reimbursements') });
      refreshShell();
    } catch (err) {
      showToast({ body: `Could not submit: ${describeError(err)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <PageLoader label="Loading reimbursements..." />;
  if (isError) return <ErrorState title="Reimbursements didn't load" error={error} onRetry={() => void refetch()} />;

  const columns: Column<Reimbursement>[] = [
    { key: 'by', header: 'Requested by', render: r => <span className="font-medium text-slate-900">{r.requested_by}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: r => `Rs ${r.amount.toLocaleString('en-IN')}` },
    { key: 'status', header: 'Status', render: r => <StatusChip status={r.status} /> },
    {
      key: 'receipt', header: 'Receipt', secondary: true,
      render: r =>
        // Previously an unconditional "View Receipt" link, even when
        // receipt_url was null — a link that did nothing at all.
        r.receipt_url ? (
          <a href={r.receipt_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
            View receipt
          </a>
        ) : (
          <span className="text-slate-400">None attached</span>
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
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-3">
          <label className="sr-only" htmlFor="reimb-amount">Amount in rupees</label>
          <input
            id="reimb-amount" required type="number" min="1" placeholder="Amount (Rs)" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <label className="sr-only" htmlFor="reimb-receipt">Receipt link</label>
          <input
            id="reimb-receipt" placeholder="Receipt link (optional)" value={receiptUrl}
            onChange={e => setReceiptUrl(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <Button label={isSaving ? 'Submitting…' : 'Submit request'} variant="primary" isDisabled={isSaving} type="submit" />
        </form>
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
