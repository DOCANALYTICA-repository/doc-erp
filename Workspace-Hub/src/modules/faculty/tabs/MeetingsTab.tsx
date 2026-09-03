import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { useToast } from '@astryxdesign/core/Toast';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';

import { useDirectory, useMeetings } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { asIsoDate } from '../../../lib/date';
import { facultyKeys, platformKeys } from '../../../lib/queryKeys';
import { useStore } from '../../../context/useStore';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { Meeting } from '../../../api/types';

interface DraftActionItem {
  title: string;
  assignee_id: string;
  due_date: string;
}

/**
 * Record what a meeting decided.
 *
 * POST /faculty/meetings/{id}/minutes has been fully implemented,
 * organizer-gated and wired into the task engine since Phase 6 — action items
 * become real tasks with notifications. `grep -rn "minutes" src/` returned
 * ZERO hits, so every meeting stayed permanently 'scheduled' and the whole
 * feature was invisible.
 *
 * The form mirrors the server's own gates: non-empty minutes, at least one
 * decision, and every action item carrying both a title and an assignee.
 */
const MinutesForm: React.FC<{ meeting: Meeting; onDone: () => void }> = ({ meeting, onDone }) => {
  const showToast = useToast();
  const directory = useDirectory('');
  const [minutes, setMinutes] = React.useState('');
  const [decisions, setDecisions] = React.useState<string[]>(['']);
  const [actionItems, setActionItems] = React.useState<DraftActionItem[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  const cleanDecisions = decisions.map(d => d.trim()).filter(Boolean);
  const incompleteItems = actionItems.filter(i => !i.title.trim() || !i.assignee_id);
  const canSubmit =
    minutes.trim().length > 0 && cleanDecisions.length > 0 && incompleteItems.length === 0;

  const save = async () => {
    setIsSaving(true);
    try {
      await api.post(`/faculty/meetings/${meeting.id}/minutes`, {
        minutes: minutes.trim(),
        decisions: cleanDecisions,
        action_items: actionItems.map(i => ({
          title: i.title.trim(),
          assignee_id: i.assignee_id,
          due_date: i.due_date || null,
        })),
      });
      showToast({
        body: `Minutes recorded. ${actionItems.length} action item${actionItems.length === 1 ? '' : 's'} became tasks.`,
        type: 'info',
      });
      onDone();
    } catch (e) {
      showToast({ body: `Could not record minutes: ${describeError(e)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-slate-100 pt-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-600" htmlFor={`minutes-${meeting.id}`}>
          Minutes
        </label>
        <textarea
          id={`minutes-${meeting.id}`}
          rows={4}
          value={minutes}
          onChange={e => setMinutes(e.target.value)}
          placeholder="What was discussed…"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-600">Decisions (at least one)</legend>
        {decisions.map((d, i) => (
          <div key={i} className="flex gap-2">
            <label className="sr-only" htmlFor={`decision-${meeting.id}-${i}`}>Decision {i + 1}</label>
            <input
              id={`decision-${meeting.id}-${i}`}
              value={d}
              onChange={e => setDecisions(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="e.g. Approved the revised conclave budget"
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
            {decisions.length > 1 ? (
              <button
                type="button"
                onClick={() => setDecisions(prev => prev.filter((_, j) => j !== i))}
                aria-label={`Remove decision ${i + 1}`}
                className="rounded-lg px-2 text-slate-400 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
        <div>
          <Button
            label="Add decision" variant="secondary" size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            clickAction={() => setDecisions(prev => [...prev, ''])}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-600">
          Action items — each becomes a task for its assignee
        </legend>
        {actionItems.map((item, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <label className="sr-only" htmlFor={`ai-title-${meeting.id}-${i}`}>Action item {i + 1} title</label>
            <input
              id={`ai-title-${meeting.id}-${i}`}
              value={item.title}
              onChange={e => setActionItems(prev => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              placeholder="What needs doing"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
            <label className="sr-only" htmlFor={`ai-assignee-${meeting.id}-${i}`}>Action item {i + 1} assignee</label>
            <select
              id={`ai-assignee-${meeting.id}-${i}`}
              value={item.assignee_id}
              onChange={e => setActionItems(prev => prev.map((x, j) => (j === i ? { ...x, assignee_id: e.target.value } : x)))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <option value="">Assign to…</option>
              {(directory.data ?? []).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <DateInput
              label={`Action item ${i + 1} due date`}
              isLabelHidden
              value={asIsoDate(item.due_date)}
              onChange={v => setActionItems(prev => prev.map((x, j) => (j === i ? { ...x, due_date: v || '' } : x)))}
            />
            <button
              type="button"
              onClick={() => setActionItems(prev => prev.filter((_, j) => j !== i))}
              aria-label={`Remove action item ${i + 1}`}
              className="rounded-lg px-2 text-slate-400 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <div>
          <Button
            label="Add action item" variant="secondary" size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            clickAction={() => setActionItems(prev => [...prev, { title: '', assignee_id: '', due_date: '' }])}
          />
        </div>
      </fieldset>

      {!canSubmit ? (
        <p className="text-sm text-slate-500">
          {minutes.trim() === ''
            ? 'Minutes are required.'
            : cleanDecisions.length === 0
              ? 'Record at least one decision.'
              : 'Every action item needs a title and an assignee.'}
        </p>
      ) : null}

      <div>
        <Button
          label={isSaving ? 'Recording…' : 'Record minutes and complete'}
          variant="primary"
          isDisabled={!canSubmit || isSaving}
          clickAction={save}
        />
      </div>
    </div>
  );
};

export const MeetingsTab: React.FC = () => {
  const { data: meetings, isLoading, isError, error, refetch } = useMeetings();
  const user = useStore(s => s.user);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [venue, setVenue] = React.useState('');
  const [recordingFor, setRecordingFor] = React.useState<string | null>(null);

  const isReadOnly = user?.primary_role === 'super_admin';

  const create = async () => {
    // The form used to validate only the title, so a meeting could be created
    // with no date, no time and no venue.
    if (!title.trim() || !date || !time.trim() || !venue.trim()) {
      showToast({ body: 'Title, date, time and venue are all required.', type: 'error' });
      return;
    }
    try {
      await api.post('/faculty/meetings', { title, date, time, venue });
      setTitle(''); setDate(''); setTime(''); setVenue('');
      showToast({ body: 'Meeting scheduled.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: facultyKeys.meetings() });
      queryClient.invalidateQueries({ queryKey: platformKeys.actionQueue });
    } catch (e) {
      showToast({ body: `Could not schedule: ${describeError(e)}`, type: 'error' });
    }
  };

  const afterMinutes = () => {
    setRecordingFor(null);
    queryClient.invalidateQueries({ queryKey: facultyKeys.meetings() });
    queryClient.invalidateQueries({ queryKey: platformKeys.tasks });
    queryClient.invalidateQueries({ queryKey: platformKeys.actionQueue });
  };

  if (isLoading) return <PageLoader label="Loading meetings..." />;
  if (isError) return <ErrorState title="Meetings didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Schedule a meeting" />
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="font-medium text-slate-600" htmlFor="meeting-title">Title</label>
          <input id="meeting-title" value={title} onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <DateInput label="Date" value={asIsoDate(date)} onChange={v => setDate(v || '')} isRequired />
          <label className="font-medium text-slate-600" htmlFor="meeting-time">Time</label>
          <input id="meeting-time" placeholder="02:30 PM" value={time} onChange={e => setTime(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <label className="font-medium text-slate-600" htmlFor="meeting-venue">Venue</label>
          <input id="meeting-venue" value={venue} onChange={e => setVenue(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <Button
            label={isReadOnly ? 'Admin is view-only here' : 'Create meeting'}
            variant="primary"
            isDisabled={isReadOnly}
            clickAction={create}
          />
        </div>
      </section>

      <div className="flex flex-col gap-4 md:col-span-2">
        <SectionHeader title="Meetings" />
        {(meetings ?? []).length === 0 ? (
          <EmptyState title="No meetings yet" icon={CalendarClock} />
        ) : (
          meetings?.map(m => {
            const hasMinutes = Boolean(m.minutes && m.minutes.trim());
            // Optional in the generated schema because they carry defaults on
            // the server; normalize once rather than guarding at four sites.
            const decisions = m.decisions ?? [];
            const actionItems = m.action_items ?? [];
            const isOrganizer = m.organizer_id === user?.id;
            return (
              <article key={m.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{m.type}</span>
                    <h3 className="mt-0.5 font-semibold text-slate-900">{m.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{m.date} · {m.time} · {m.venue}</p>
                  </div>
                  <StatusChip status={m.status} />
                </div>

                {hasMinutes ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <h4 className="text-sm font-medium text-slate-600">Minutes</h4>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{m.minutes}</p>
                    {decisions.length > 0 ? (
                      <>
                        <h4 className="mt-3 text-sm font-medium text-slate-600">Decisions</h4>
                        {/* A real list from the server. It used to be one
                            comma-joined string, so "Rs 40,000" rendered as two
                            separate decisions. */}
                        <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                          {decisions.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </>
                    ) : null}
                    {actionItems.length > 0 ? (
                      <>
                        <h4 className="mt-3 text-sm font-medium text-slate-600">Action items</h4>
                        <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-600">
                          {actionItems.map((item, i) => (
                            <li key={i}>
                              {item.title}
                              {item.due_date ? <span className="text-slate-400"> — due {item.due_date}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : isOrganizer ? (
                  recordingFor === m.id ? (
                    <MinutesForm meeting={m} onDone={afterMinutes} />
                  ) : (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <Button
                        label="Record minutes"
                        variant="secondary"
                        size="sm"
                        clickAction={() => setRecordingFor(m.id)}
                      />
                    </div>
                  )
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};
