import React from 'react';
import { CalendarDays } from 'lucide-react';

import { useCalendar } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';

const GROUPS = [
  { type: 'timetable', label: 'Teaching timetable' },
  { type: 'meeting', label: 'Meetings' },
  { type: 'club_event', label: 'Club events' },
  { type: 'task', label: 'Tasks due' },
] as const;

export const CalendarTab: React.FC = () => {
  const { data: events, isLoading, isError, error, refetch } = useCalendar();

  if (isLoading) return <PageLoader label="Loading your calendar..." />;
  if (isError) return <ErrorState title="Calendar didn't load" error={error} onRetry={() => void refetch()} />;

  const all = events ?? [];
  if (all.length === 0) {
    return <EmptyState title="Nothing on your calendar" icon={CalendarDays} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        title="Unified calendar"
        description="Your timetable, meetings, club events and task deadlines in one place."
      />
      {GROUPS.map(group => {
        const items = all.filter(ev => ev.type === group.type);
        if (items.length === 0) return null;
        return (
          <section key={group.type}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.label}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {items.map(ev => (
                <article key={`${ev.type}-${ev.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="font-medium text-slate-900">{ev.title}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {[ev.start, ev.hour, ev.venue].filter(Boolean).join(' · ')}
                  </div>
                  {ev.description ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{ev.description}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
