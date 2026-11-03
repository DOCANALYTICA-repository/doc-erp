import React from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { BellRing } from 'lucide-react';

import { useReminders } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { facultyKeys } from '../../../lib/queryKeys';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, DateField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';
import type { Reminder } from '../../../api/types';

/**
 * Replaces an imperative guard ("A reminder needs a title and a due date.")
 * that fired after the click, plus a disabled submit button that gave no
 * reason at all.
 */
const reminderSchema = z.object({
  title: z.string().trim().min(1, 'Give the reminder a title.'),
  due_date: z.string().min(1, 'Pick the date this is due.'),
});

export const RemindersTab: React.FC = () => {
  const { data: reminders, isLoading, isError, error, refetch } = useReminders();
  const showToast = useToast();
  const queryClient = useQueryClient();


  const invalidate = () => queryClient.invalidateQueries({ queryKey: facultyKeys.reminders() });

  const form = useZodForm(reminderSchema, { defaultValues: { title: '', due_date: '' } });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const create = withServerErrors(form, async values => {
    await api.post('/faculty/reminders', {
      title: values.title,
      due_date: values.due_date,
      reminder_type: 'due_date',
    });
    reset();
    showToast({ body: 'Reminder created.', type: 'info' });
    invalidate();
  });

  const complete = async (reminder: Reminder) => {
    try {
      await api.put(`/faculty/reminders/${reminder.id}`, { status: 'completed' });
      invalidate();
    } catch (e) {
      showToast({ body: `Could not complete the reminder: ${describeError(e)}`, type: 'error' });
    }
  };

  if (isLoading) return <PageSkeleton variant="list" label="Loading reminders" />;
  if (isError) return <ErrorState title="Reminders didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Card as="section">
        <SectionHeader title="New reminder" />
        {/*
          * A real <form>, so Enter submits.
          *
          * The button was also `isDisabled={!title || !dueDate}` — a disabled
          * control that never says why. It is now always enabled and the
          * schema explains which field is missing, which is both clearer and
          * reachable by keyboard (a disabled button cannot be focused, so a
          * screen-reader user got no explanation at all).
          */}
        <form onSubmit={handleSubmit(create)} noValidate className="mt-4 flex flex-col gap-4 text-sm">
          <TextField control={control} name="title" label="Title" isRequired />
          <DateField control={control} name="due_date" label="Due date" isRequired />

          <FormError message={rootServerError(errors)} />

          <Button
            label={isSubmitting ? 'Creating…' : 'Create reminder'}
            variant="primary"
            isDisabled={isSubmitting}
            type="submit"
          />
        </form>
      </Card>

      <div className="flex flex-col gap-3 md:col-span-2">
        <SectionHeader title="Your reminders" />
        {(reminders ?? []).length === 0 ? (
          <EmptyState title="No reminders yet" icon={BellRing} />
        ) : (
          reminders?.map(r => (
            <Card padding="sm" className="flex items-center justify-between" key={r.id}>
              <div>
                <div className={`font-medium ${r.status === 'completed' ? 'text-secondary line-through' : 'text-primary'}`}>
                  {r.title}
                </div>
                <div className="mt-0.5 text-sm text-secondary">Due {r.due_date}</div>
              </div>
              {r.status !== 'completed' ? (
                <Button label="Mark done" size="sm" variant="secondary" clickAction={() => complete(r)} />
              ) : null}
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
