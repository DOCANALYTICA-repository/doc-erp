import React from 'react';
import { Handshake } from 'lucide-react';

import { useClubSponsorships } from '../../../api/hooks';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Sponsorship } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const SponsorshipsTab: React.FC = () => {
  const { clubId } = useClubWorkspace();
  const { data: rows, isLoading, isError, error, refetch } = useClubSponsorships(clubId);

  if (isLoading) return <PageSkeleton variant="table" label="Loading sponsorships" />;
  if (isError) return <ErrorState title="Sponsorships didn't load" error={error} onRetry={() => void refetch()} />;

  const total = (rows ?? []).reduce((sum, s) => sum + (s.amount || 0), 0);

  const columns: Column<Sponsorship>[] = [
    { key: 'sponsor', header: 'Sponsor', render: s => <span className="font-medium text-primary">{s.sponsor_name}</span> },
    { key: 'status', header: 'Status', render: s => <StatusChip status={s.status} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: s => `Rs ${s.amount.toLocaleString('en-IN')}` },
    {
      key: 'contract', header: 'Contract', secondary: true,
      render: s => s.contract_url ? (
        <a href={s.contract_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">View</a>
      ) : <span className="text-secondary">—</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Sponsorship pipeline"
        description={rows && rows.length > 0 ? `Rs ${total.toLocaleString('en-IN')} across ${rows.length} sponsor${rows.length === 1 ? '' : 's'}` : undefined}
      />
      <DataTable
        caption="Sponsorships"
        columns={columns}
        rows={rows ?? []}
        getRowKey={s => s.id}
        emptyState={<EmptyState title="No sponsorships recorded" icon={Handshake} />}
      />
    </div>
  );
};
