import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { useToast } from '@astryxdesign/core/Toast';
import { ClipboardList, Plus } from 'lucide-react';

import { useClubTasks } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { asIsoDate } from '../../../lib/date';
import { clubKeys, platformKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Task } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const TasksTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: tasks, isLoading, isError, error, refetch } = useClubTasks(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [priority, setPriority] = React.useState('medium');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const activeMembers = bootstrap.members.filter(m => m.status === 'active');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'tasks') });
    queryClient.invalidateQueries({ queryKey: platformKeys.tasks });
    queryClient.invalidateQueries({ queryKey: platformKeys.actionQueue });
    refreshShell();
  };

  const act = async (taskId: string, run: () => Promise<unknown>, success: string) => {
    setBusyId(taskId);
    try {
      await run();
      showToast({ body: success, type: 'info' });
      refresh();
    } catch (e) {
      showToast({ body: describeError(e), type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const createTask = async () => {
    try {
      await api.post(`/clubs/${clubId}/tasks`, {
        title, due_date: dueDate, priority, assignee_id: assigneeId,
      });
      setTitle(''); setDueDate(''); setAssigneeId(''); setIsOpen(false);
      showToast({ body: 'Task assigned.', type: 'info' });
      refresh();
    } catch (e) {
      showToast({ body: `Could not assign the task: ${describeError(e)}`, type: 'error' });
    }
  };

  if (isLoading) return <PageLoader label="Loading tasks..." />;
  if (isError) return <ErrorState title="Tasks didn't load" error={error} onRetry={() => void refetch()} />;

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', render: t => <span className="font-medium text-slate-900">{t.title}</span> },
    { key: 'due', header: 'Due', secondary: true, render: t => t.due_date ?? '—' },
    {
      key: 'priority', header: 'Priority', secondary: true,
      render: t => (
        <span className={`text-sm font-medium ${t.priority === 'high' ? 'text-rose-700' : 'text-slate-500'}`}>
          {t.priority}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: t => <StatusChip status={t.status} /> },
    {
      key: 'action', header: 'Action', align: 'right',
      render: t => (
        <div className="flex justify-end gap-2">
          {t.status !== 'completed' && t.status !== 'pending_review' ? (
            <Button
              label="Mark done" variant="secondary" size="sm"
              isDisabled={busyId === t.id}
              // This exact call used to 500: BaseRepository.update blind-set
              // every field, so a single-field body nulled title/due_date/
              // priority and hit the NOT NULL constraint.
              clickAction={() => act(t.id, () => api.put(`/tasks/${t.id}`, { status: 'pending_review' }), 'Marked done — awaiting review.')}
            />
          ) : null}
          {t.status === 'pending_review' && bootstrap.capabilities.can_assign_tasks ? (
            <>
              <Button
                label="Approve" variant="primary" size="sm"
                isDisabled={busyId === t.id}
                clickAction={() => act(t.id, () => api.post(`/clubs/${clubId}/tasks/${t.id}/review`, { action: 'approve' }), 'Task approved.')}
              />
              <Button
                label="Send back" variant="secondary" size="sm"
                isDisabled={busyId === t.id}
                clickAction={() => act(t.id, () => api.post(`/clubs/${clubId}/tasks/${t.id}/review`, { action: 'reject' }), 'Task sent back.')}
              />
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Task manager"
        action={
          bootstrap.capabilities.can_assign_tasks ? (
            <Button
              label="Assign task" variant="primary" size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              clickAction={() => setIsOpen(o => !o)}
            />
          ) : null
        }
      />

      {isOpen ? (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-4">
          <label className="sr-only" htmlFor="task-title">Task title</label>
          <input id="task-title" required placeholder="Task title" value={title}
            onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <DateInput label="Due date" isLabelHidden value={asIsoDate(dueDate)} onChange={v => setDueDate(v || '')} isRequired />
          <label className="sr-only" htmlFor="task-priority">Priority</label>
          <select id="task-priority" value={priority} onChange={e => setPriority(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <label className="sr-only" htmlFor="task-assignee">Assignee</label>
          <select id="task-assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <option value="">Select assignee</option>
            {activeMembers.map(m => (
              <option key={m.id} value={m.student_id}>{m.student_name ?? m.student_id}</option>
            ))}
          </select>
          <div className="sm:col-span-4">
            <Button
              label="Assign" variant="primary"
              isDisabled={!title || !dueDate || !assigneeId}
              clickAction={createTask}
            />
          </div>
        </div>
      ) : null}

      <DataTable
        caption="Club tasks"
        columns={columns}
        rows={tasks ?? []}
        getRowKey={t => t.id}
        emptyState={<EmptyState title="No tasks assigned yet" icon={ClipboardList} />}
      />
    </div>
  );
};
