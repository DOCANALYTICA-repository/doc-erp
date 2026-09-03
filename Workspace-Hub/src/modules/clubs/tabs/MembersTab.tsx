import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@astryxdesign/core/Toast';
import { Users } from 'lucide-react';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { StatusChip } from '../../../components/ui/StatusChip';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { ClubMember } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const MembersTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { members, hierarchy, capabilities } = bootstrap;
  const showToast = useToast();
  const queryClient = useQueryClient();

  // Sorted once, at the top level, rather than inside the render of every row.
  const levels = React.useMemo(
    () => [...hierarchy].sort((a, b) => a.level_order - b.level_order),
    [hierarchy],
  );

  const assignLevel = async (member: ClubMember, levelId: string) => {
    if (!levelId) return;
    try {
      await api.put(`/clubs/${clubId}/members/${member.id}/hierarchy-level`, {
        hierarchy_level_id: levelId,
      });
      showToast({ body: 'Club responsibility updated.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'members') });
      refreshShell();
    } catch (e) {
      // This write previously had no error handling at all: the <select>
      // showed the new value while the server had rejected it.
      showToast({ body: `Could not update: ${describeError(e)}`, type: 'error' });
      refreshShell();
    }
  };

  const columns: Column<ClubMember>[] = [
    {
      key: 'name',
      header: 'Student',
      render: m => (
        <span className="font-medium text-slate-900">{m.student_name ?? m.student_id}</span>
      ),
    },
    {
      key: 'role',
      header: 'Club responsibility',
      render: m =>
        capabilities.can_manage_members && levels.length > 0 ? (
          <select
            aria-label={`Club responsibility for ${m.student_name ?? m.student_id}`}
            defaultValue={m.hierarchy_level_id ?? ''}
            onChange={e => assignLevel(m, e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm"
          >
            <option value="" disabled>{m.role}</option>
            {levels.map(l => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        ) : (
          m.role
        ),
    },
    { key: 'year', header: 'Academic period', secondary: true, render: m => m.academic_year },
    { key: 'status', header: 'Status', render: m => <StatusChip status={m.status} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Members"
        description={`${members.filter(m => m.status === 'active').length} active`}
      />
      <DataTable
        caption="Club members"
        columns={columns}
        rows={members}
        getRowKey={m => m.id}
        emptyState={
          <EmptyState
            title="No members yet"
            description="Students who join through a recruitment drive will appear here."
            icon={Users}
          />
        }
      />
    </div>
  );
};
