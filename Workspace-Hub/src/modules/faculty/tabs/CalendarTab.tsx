import React from 'react';
import { CalendarDays } from 'lucide-react';

import { useCalendar } from '../../../api/hooks';
import type { CalendarEvent } from '../../../api/types';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';

/**
 * A label and tone per event source, so a day column stays readable when four
 * kinds of thing land on the same afternoon.
 *
 * Tones come from the ramps rather than the status tokens: these are
 * categories, not states — a club event is not "worse" than a meeting.
 */
const KIND: Record<string, { label: string; tone: string }> = {
  timetable: { label: 'Class', tone: 'bg-gold-200 text-gold-800' },
  meeting: { label: 'Meeting', tone: 'bg-sage-200 text-sage-900' },
  club_event: { label: 'Club', tone: 'bg-sand-300 text-sand-800' },
  task: { label: 'Task due', tone: 'bg-warning-muted text-warning' },
};

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const DATE_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/**
 * Group events by calendar day, earliest first.
 *
 * `start` is an ISO string; the date portion is the grouping key so events on
 * the same day land together regardless of time. A malformed or missing
 * `start` would otherwise create a bucket named "Invalid Date" — those are
 * collected under a single trailing group rather than dropped, because an
 * event with a broken date is still an event someone needs to know about.
 */
function groupByDay(events: CalendarEvent[]) {
  const buckets = new Map<string, CalendarEvent[]>();
  const undated: CalendarEvent[] = [];

  for (const event of events) {
    const key = (event.start ?? '').slice(0, 10);
    if (!key || Number.isNaN(new Date(key).getTime())) {
      undated.push(event);
      continue;
    }
    const bucket = buckets.get(key) ?? [];
    bucket.push(event);
    buckets.set(key, bucket);
  }

  const days = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      date: new Date(key),
      // Within a day, order by the hour string if there is one. Timetable
      // slots carry "1st hour" style labels rather than clock times, so this
      // is a stable sort rather than a chronological one.
      items: [...items].sort((a, b) => (a.hour ?? '').localeCompare(b.hour ?? '')),
    }));

  return { days, undated };
}

/**
 * The unified calendar, as a day-by-day schedule.
 *
 * It used to group by TYPE — all classes, then all meetings, then all club
 * events, then all tasks. That answers "show me my meetings", which is a
 * useful question but not the one a calendar is for: "what is on Tuesday"
 * required reading four separate lists and reassembling them mentally.
 *
 * Grouping by day is what the design canvas specifies (`isFacultyCal`), and
 * the type is preserved as a chip on each event so nothing is lost.
 */
export const CalendarTab: React.FC = () => {
  const { data: events, isLoading, isError, error, refetch } = useCalendar();

  if (isLoading) return <PageSkeleton variant="list" label="Loading your calendar" />;
  if (isError) {
    return (
      <ErrorState title="Calendar didn't load" error={error} onRetry={() => void refetch()} />
    );
  }

  const all = events ?? [];
  if (all.length === 0) {
    return (
      <EmptyState
        title="Nothing on your calendar"
        description="Your timetable, meetings, club events and task deadlines appear here."
        icon={CalendarDays}
      />
    );
  }

  const { days, undated } = groupByDay(all);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Unified calendar"
        description="Your timetable, meetings, club events and task deadlines, day by day."
      />

      <div className="flex flex-col gap-4">
        {days.map(day => (
          <section key={day.key} className="flex flex-col gap-2 sm:flex-row sm:gap-5">
            {/* Sticky day label, so the date stays visible while a busy day's
                events scroll past it on a narrow screen. */}
            <header className="flex shrink-0 items-baseline gap-2 sm:w-28 sm:flex-col sm:items-start sm:gap-0.5">
              <span className="font-heading text-lg font-semibold text-primary">
                {DATE_LABEL.format(day.date)}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                {DAY_LABEL.format(day.date)}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-2">
              {day.items.map(event => {
                const kind = KIND[event.type] ?? { label: event.type, tone: 'bg-muted text-secondary' };
                return (
                  <Card
                    as="article"
                    padding="sm"
                    key={`${event.type}-${event.id}`}
                    className="transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${kind.tone}`}
                      >
                        {kind.label}
                      </span>
                      {event.hour ? (
                        <span className="text-xs tabular-nums text-secondary">{event.hour}</span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 font-medium text-primary">{event.title}</div>
                    {event.venue ? (
                      <div className="mt-0.5 text-sm text-secondary">{event.venue}</div>
                    ) : null}
                    {event.description ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                        {event.description}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}

        {/* Events whose date could not be read. Shown rather than dropped —
            a broken date is a data problem, not a reason to hide the event. */}
        {undated.length > 0 ? (
          <section className="flex flex-col gap-2 sm:flex-row sm:gap-5">
            <header className="shrink-0 sm:w-28">
              <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                No date
              </span>
            </header>
            <div className="flex flex-1 flex-col gap-2">
              {undated.map(event => (
                <Card as="article" padding="sm" key={`${event.type}-${event.id}`}>
                  <div className="font-medium text-primary">{event.title}</div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
