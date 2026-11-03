import React from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { ClipboardList, Plus } from 'lucide-react';

import { useClubTasks } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys, platformKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Task } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, SelectField, DateField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';

/**
 * A task with no assignee is a task nobody does, so `assignee_id` is required
 * rather than defaulting to the empty string the old form happily posted.
 */
const taskSchema = z.object({
  title: z.string().trim().min(1, 'Describe the task.'),
  due_date: z.string().min(1, 'Pick a due date.'),
  priority: z.enum(['low', 'medium', 'high']),
  assignee_id: z.string().min(1, 'Choose who is doing this.'),
});

export const TasksTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: tasks, isLoading, isError, error, refetch } = useClubTasks(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);
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

  const form = useZodForm(taskSchema, {
    defaultValues: { title: '', due_date: '', priority: 'medium', assignee_id: '' },
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const createTask = withServerErrors(form, async values => {
    await api.post(`/clubs/${clubId}/tasks`, {
      title: values.title,
      due_date: values.due_date,
      priority: values.priority,
      assignee_id: values.assignee_id,
    });
    reset();
    setIsOpen(false);
    showToast({ body: 'Task assigned.', type: 'info' });
    refresh();
  });

  if (isLoading) return <PageSkeleton variant="table" label="Loading tasks" />;
  if (isError) return <ErrorState title="Tasks didn't load" error={error} onRetry={() => void refetch()} />;

  const columns: Column<Task>[] = [
    { key: 'title', header: 'Task', render: t => <span className="font-medium text-primary">{t.title}</span> },
    { key: 'due', header: 'Due', secondary: true, render: t => t.due_date ?? '—' },
    {
      key: 'priority', header: 'Priority', secondary: true,
      render: t => (
        <span className={`text-sm font-medium ${t.priority === 'high' ? 'text-error' : 'text-secondary'}`}>
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

      {/*
        * A real <form>, so Enter submits — and real labels instead of
        * `sr-only` ones over placeholders, which vanish as soon as you type.
        *
        * The submit button was disabled until title, due date AND assignee
        * were all set: three reasons it might be dead, none of them stated,
        * and a disabled button cannot even be focused to ask. The schema now
        * names whichever field is missing.
        */}
      {isOpen ? (
        <Card as="form" padding="md" className="flex flex-col gap-4 text-sm shadow-sm" onSubmit={handleSubmit(createTask)} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField control={control} name="title" label="Task title" isRequired />
            <DateField control={control} name="due_date" label="Due date" isRequired />
            <SelectField
              control={control}
              name="priority"
              label="Priority"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
              isRequired
            />
            <SelectField
              control={control}
              name="assignee_id"
              label="Assignee"
              placeholder="Select assignee"
              options={activeMembers.map(m => ({
                value: m.student_id,
                label: m.student_name ?? m.student_id,
              }))}
              isRequired
            />
          </div>

          <FormError message={rootServerError(errors)} />

          <div>
            <Button
              label={isSubmitting ? 'Assigning…' : 'Assign'}
              variant="primary"
              isDisabled={isSubmitting}
              type="submit"
            />
          </div>
        </Card>
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
