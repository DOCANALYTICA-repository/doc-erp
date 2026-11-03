import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Megaphone } from 'lucide-react';
import { z } from 'zod';

import { useClubAnnouncements } from '../../../api/hooks';
import { api } from '../../../services/api';
import { clubKeys } from '../../../lib/queryKeys';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, TextAreaField, SelectField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';

/**
 * Validated before the request, so an empty title is caught next to the title
 * field rather than becoming a 422 and a toast.
 *
 * The old form relied on native `required`, which does work inside a real
 * `<form>` — but it produces the browser's own bubble, which cannot be styled,
 * disappears on the next click, and says "Please fill out this field" rather
 * than anything about announcements.
 */
const announcementSchema = z.object({
  title: z.string().trim().min(1, 'Give the announcement a title.'),
  body: z.string().trim().min(1, 'Write the message you want members to see.'),
  announcement_type: z.string().min(1, 'Choose a type.'),
});

const TYPES = [
  { value: 'general', label: 'General update' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'event', label: 'Event update' },
  { value: 'deadline', label: 'Deadline reminder' },
];

export const AnnouncementsTab: React.FC = () => {
  const { clubId, bootstrap } = useClubWorkspace();
  const { data: rows, isLoading, isError, error, refetch } = useClubAnnouncements(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);

  const form = useZodForm(announcementSchema, {
    defaultValues: { title: '', body: '', announcement_type: 'general' },
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  /*
   * `withServerErrors` handles the failure path: a 422 lands on the field it
   * names, anything else becomes a form-level alert. The toast that remains is
   * for SUCCESS only — announcing "published" while the form collapses is
   * exactly what a toast is for. The old `Could not publish: …` toast is gone,
   * because a failure now appears next to the thing that caused it.
   */
  const submit = withServerErrors(form, async values => {
    await api.post(`/clubs/${clubId}/announcements`, {
      club_id: clubId,
      title: values.title,
      body: values.body,
      announcement_type: values.announcement_type,
    });
    reset();
    setIsOpen(false);
    showToast({ body: 'Announcement published.', type: 'info' });
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'announcements') });
  });

  if (isLoading) return <PageSkeleton variant="list" label="Loading announcements" />;
  if (isError) return <ErrorState title="Announcements didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Club announcements"
        action={
          bootstrap.capabilities.can_write ? (
            <Button label="New announcement" variant="primary" size="sm" clickAction={() => setIsOpen(o => !o)} />
          ) : null
        }
      />

      {isOpen ? (
        <Card as="form" padding="md" className="flex flex-col gap-4 text-sm shadow-sm" onSubmit={handleSubmit(submit)} noValidate>
          <TextField control={control} name="title" label="Title" isRequired />
          <TextAreaField control={control} name="body" label="Message" rows={3} isRequired />
          <SelectField
            control={control}
            name="announcement_type"
            label="Type"
            options={TYPES}
            isRequired
          />

          <FormError message={rootServerError(errors)} />

          <div>
            <Button
              label={isSubmitting ? 'Publishing…' : 'Publish'}
              variant="primary"
              isDisabled={isSubmitting}
              type="submit"
            />
          </div>
        </Card>
      ) : null}

      {rows && rows.length === 0 ? (
        <EmptyState title="No announcements yet" icon={Megaphone} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows?.map(a => (
            <Card as="article" padding="sm" key={a.id}>
              <h3 className="font-semibold text-primary">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
