import React from 'react';
import { ClipboardList } from 'lucide-react';

import { useTasks } from '../../../api/hooks';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Task } from '../../../api/types';

export const TasksTab: React.FC = () => {
  const { data: tasks, isLoading, isError, error, refetch } = useTasks();

  if (isLoading) return <PageSkeleton variant="table" label="Loading tasks" />;
  if (isError) return <ErrorState title="Tasks didn't load" error={error} onRetry={() => void refetch()} />;

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', render: t => <span className="font-medium text-primary">{t.title}</span> },
    { key: 'due', header: 'Due', secondary: true, render: t => t.due_date ?? '—' },
    {
      key: 'priority', header: 'Priority', secondary: true,
      render: t => (
        <span className={t.priority === 'high' ? 'font-medium text-error' : 'text-secondary'}>
          {t.priority}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: t => <StatusChip status={t.status} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Your tasks" />
      <DataTable
        caption="Tasks assigned to you"
        columns={columns}
        rows={tasks ?? []}
        getRowKey={t => t.id}
        emptyState={<EmptyState title="No tasks assigned to you" icon={ClipboardList} />}
      />
    </div>
  );
};
