import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { useToast } from '@astryxdesign/core/Toast';
import { Calendar, Plus } from 'lucide-react';

import { useClubEvents } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { asIsoDate } from '../../../lib/date';
import { clubKeys } from '../../../lib/queryKeys';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import { PageLoader } from '../../../components/ui/PageLoader';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { EventAttendanceSheet } from '../EventAttendanceSheet';

export const EventsTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: events, isLoading, isError, error, refetch } = useClubEvents(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  // Form state lives HERE, not in 17 slots on a shared parent.
  const [isOpen, setIsOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState('');
  const [venue, setVenue] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [attendanceFor, setAttendanceFor] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post(`/clubs/${clubId}/events`, {
        club_id: clubId, title, date, venue, budget: Number(budget) || 0,
      });
      setTitle(''); setDate(''); setVenue(''); setBudget('');
      setIsOpen(false);
      showToast({ body: 'Event proposal submitted for approval.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'events') });
      refreshShell();
    } catch (err) {
      // Previously this form awaited a write with no catch: a rejected
      // proposal cleared nothing and said nothing.
      showToast({ body: `Could not submit: ${describeError(err)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <PageLoader label="Loading events..." />;
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
              clickAction={() => setIsOpen(open => !open)}
            />
          ) : null
        }
      />

      {isOpen ? (
        <form
          onSubmit={submit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-4"
        >
          <label className="sr-only" htmlFor="event-title">Event title</label>
          <input
            id="event-title" required placeholder="Event title" value={title}
            onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <DateInput label="Event date" isLabelHidden value={asIsoDate(date)} onChange={v => setDate(v || '')} isRequired />
          <label className="sr-only" htmlFor="event-venue">Venue</label>
          <input
            id="event-venue" required placeholder="Venue" value={venue}
            onChange={e => setVenue(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <label className="sr-only" htmlFor="event-budget">Budget in rupees</label>
          <input
            id="event-budget" required type="number" min="0" placeholder="Budget (Rs)" value={budget}
            onChange={e => setBudget(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <div className="sm:col-span-4">
            <Button label={isSaving ? 'Submitting…' : 'Submit proposal'} variant="primary" isDisabled={isSaving} type="submit" />
          </div>
        </form>
      ) : null}

      {events && events.length === 0 ? (
        <EmptyState
          title="No events proposed yet"
          description="Proposals go to the club's Faculty Coordinator for approval."
          icon={Calendar}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {events?.map(evt => (
            <article key={evt.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <StatusChip status={evt.status} />
                  <span className="text-sm text-slate-500">{evt.date}</span>
                </div>
                <h3 className="font-semibold text-slate-900">{evt.title}</h3>
                {evt.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{evt.description}</p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
