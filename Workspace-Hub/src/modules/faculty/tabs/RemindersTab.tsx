import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { useToast } from '@astryxdesign/core/Toast';
import { BellRing } from 'lucide-react';

import { useReminders } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { asIsoDate } from '../../../lib/date';
import { facultyKeys } from '../../../lib/queryKeys';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { Reminder } from '../../../api/types';

export const RemindersTab: React.FC = () => {
  const { data: reminders, isLoading, isError, error, refetch } = useReminders();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: facultyKeys.reminders() });

  const create = async () => {
    if (!title.trim() || !dueDate) {
      showToast({ body: 'A reminder needs a title and a due date.', type: 'error' });
      return;
    }
    try {
      await api.post('/faculty/reminders', {
        title, due_date: dueDate, reminder_type: 'due_date',
      });
      setTitle(''); setDueDate('');
      showToast({ body: 'Reminder created.', type: 'info' });
      invalidate();
    } catch (e) {
      showToast({ body: `Could not create the reminder: ${describeError(e)}`, type: 'error' });
    }
  };

  const complete = async (reminder: Reminder) => {
    try {
      await api.put(`/faculty/reminders/${reminder.id}`, { status: 'completed' });
      invalidate();
    } catch (e) {
      showToast({ body: `Could not complete the reminder: ${describeError(e)}`, type: 'error' });
    }
  };

  if (isLoading) return <PageLoader label="Loading reminders..." />;
  if (isError) return <ErrorState title="Reminders didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="New reminder" />
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="font-medium text-slate-600" htmlFor="reminder-title">Title</label>
          <input id="reminder-title" value={title} onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <DateInput label="Due date" value={asIsoDate(dueDate)} onChange={v => setDueDate(v || '')} isRequired />
          <Button label="Create reminder" variant="primary" isDisabled={!title || !dueDate} clickAction={create} />
        </div>
      </section>

      <div className="flex flex-col gap-3 md:col-span-2">
        <SectionHeader title="Your reminders" />
        {(reminders ?? []).length === 0 ? (
          <EmptyState title="No reminders yet" icon={BellRing} />
        ) : (
          reminders?.map(r => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <div className={`font-medium ${r.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {r.title}
                </div>
                <div className="mt-0.5 text-sm text-slate-500">Due {r.due_date}</div>
              </div>
              {r.status !== 'completed' ? (
                <Button label="Mark done" size="sm" variant="secondary" clickAction={() => complete(r)} />
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
