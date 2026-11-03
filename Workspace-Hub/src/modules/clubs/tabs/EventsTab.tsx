import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Calendar, Plus } from 'lucide-react';
import { z } from 'zod';

import { useClubEvents } from '../../../api/hooks';
import { api } from '../../../services/api';
import { clubKeys } from '../../../lib/queryKeys';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, NumberField, DateField, TextAreaField } from '../../../components/ui/form/fields';
import { Drawer } from '../../../components/ui/Drawer';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';
import { EventAttendanceSheet } from '../EventAttendanceSheet';

/**
 * An event proposal goes to a Faculty Coordinator for approval, so the numbers
 * in it are a real request for real money.
 *
 * `budget` was `Number(budget) || 0`: a typo submitted a proposal for zero
 * rupees, which the coordinator would then approve. Zero IS allowed here (an
 * event can genuinely cost nothing) — but it has to be entered deliberately,
 * not arrived at by accident, which is why the field is required and typed as
 * a number rather than coerced from a string.
 */
const eventSchema = z.object({
  title: z.string().trim().min(1, 'Name the event.'),
  date: z.string().min(1, 'Pick the date the event runs.'),
  venue: z.string().trim().min(1, 'Say where it will be held.'),
  budget: z
    .number({ message: 'Enter a budget — use 0 if the event costs nothing.' })
    .min(0, 'A budget cannot be negative.'),
  /*
   * Optional, and new.
   *
   * `EventCreate.description` has always existed on the API and the event
   * card has always rendered it — but no form ever offered the field, so the
   * only way it could be non-null was a direct API call. A coordinator
   * approving a proposal saw a title, a date, a venue and an amount, with no
   * room for what the event actually is. The design canvas's sheet includes
   * it; so does this.
   */
  description: z.string().trim().optional(),
});

/** Ties the pinned footer's submit button to the <form> inside the drawer. */
const EVENT_FORM_ID = 'club-event-proposal-form';

export const EventsTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: events, isLoading, isError, error, refetch } = useClubEvents(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);
  const [attendanceFor, setAttendanceFor] = React.useState<string | null>(null);

  const form = useZodForm(eventSchema, {
    defaultValues: { title: '', date: '', venue: '', budget: undefined, description: '' },
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const submit = withServerErrors(form, async values => {
    await api.post(`/clubs/${clubId}/events`, {
      club_id: clubId,
      title: values.title,
      date: values.date,
      venue: values.venue,
      budget: values.budget,
      description: values.description?.trim() ? values.description.trim() : null,
    });
    reset();
    setIsOpen(false);
    showToast({ body: 'Event proposal submitted for approval.', type: 'info' });
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'events') });
    refreshShell();
  });

  if (isLoading) return <PageSkeleton variant="list" label="Loading events" />;
  if (isError) return <ErrorState title="Events didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Annual event schedule"
        action={
          bootstrap.capabilities.can_write ? (
            <Button
              label="Submit event proposal"
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              clickAction={() => setIsOpen(true)}
            />
          ) : null
        }
      />

      {/*
        * The canvas's `sheetOpen` pattern, adopted here.
        *
        * This was an inline panel that expanded between the section header
        * and the event grid. The trade-off is real in both directions — an
        * inline panel keeps the list visible while you type, and a sheet
        * covers it — but three things settle it for this form specifically:
        *
        *  - it is five fields including a textarea, so the panel pushed the
        *    whole grid down by roughly a screen and the "Submit" button
        *    landed below the fold on a laptop;
        *  - the list it covers is not reference material for filling it in.
        *    You do not read the existing events to write a new proposal;
        *  - `purpose="form"` means a stray backdrop click cannot discard what
        *    you typed, which the inline panel could not offer at all — its
        *    only dismissal was the same button that opened it.
        *
        * `Drawer` supplies the focus trap, focus restore and Escape via
        * Astryx `Dialog`; none of that existed on the inline version.
        */}
      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        purpose="form"
        title="Submit an event proposal"
        subtitle="Goes to the club's Faculty Coordinator for approval."
        actions={
          <>
            <Button
              label="Cancel"
              variant="secondary"
              isDisabled={isSubmitting}
              clickAction={() => setIsOpen(false)}
            />
            <Button
              label={isSubmitting ? 'Submitting…' : 'Submit proposal'}
              variant="primary"
              isDisabled={isSubmitting}
              type="submit"
              form={EVENT_FORM_ID}
            />
          </>
        }
      >
        {/*
          * Real labels, not `sr-only` labels over placeholder text.
          *
          * The previous version hid every label and relied on the
          * placeholder to say what each box was for — and a placeholder
          * vanishes the moment you start typing, so anyone who paused
          * mid-form had four unlabelled boxes. Astryx renders the label
          * visibly and still associates it.
          *
          * The `id`/`form` pairing is what lets the submit button live in the
          * drawer's pinned footer, outside this <form>, and still submit it —
          * so Enter-to-submit and the button do the same thing.
          */}
        <form
          id={EVENT_FORM_ID}
          className="flex flex-col gap-4 text-sm"
          onSubmit={handleSubmit(submit)}
          noValidate
        >
          <TextField control={control} name="title" label="Event title" isRequired />
          <DateField control={control} name="date" label="Event date" isRequired />
          <TextField control={control} name="venue" label="Venue" isRequired />
          <NumberField control={control} name="budget" label="Budget (Rs)" min={0} isRequired />
          <TextAreaField
            control={control}
            name="description"
            label="Description"
            rows={4}
          />

          <FormError message={rootServerError(errors)} />
        </form>
      </Drawer>

      {events && events.length === 0 ? (
        <EmptyState
          title="No events proposed yet"
          description="Proposals go to the club's Faculty Coordinator for approval."
          icon={Calendar}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {events?.map(evt => (
            <Card as="article" padding="md" className="flex flex-col justify-between" key={evt.id}>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <StatusChip status={evt.status} />
                  <span className="text-sm text-secondary">{evt.date}</span>
                </div>
                <h3 className="font-semibold text-primary">{evt.title}</h3>
                {evt.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-secondary">{evt.description}</p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-secondary">
                <span>{evt.venue}</span>
                {/* Event attendance capture had NO UI, and two shipped
                    analytics features read the table it writes to. */}
                {bootstrap.capabilities.can_write ? (
                  <Button
                    label={attendanceFor === evt.id ? 'Close register' : 'Attendance'}
                    variant="ghost"
                    size="sm"
                    clickAction={() => setAttendanceFor(attendanceFor === evt.id ? null : evt.id)}
                  />
                ) : null}
              </div>
              {attendanceFor === evt.id ? (
                <EventAttendanceSheet event={evt} onClose={() => setAttendanceFor(null)} />
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
