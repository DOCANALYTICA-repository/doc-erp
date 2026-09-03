import React from 'react';
import { Pin } from 'lucide-react';

import { useMeetings, useNotes, useTasks } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';

export const OverviewTab: React.FC = () => {
  const meetings = useMeetings();
  const tasks = useTasks();
  const notes = useNotes();

  const pinned = (notes.data ?? []).filter(n => n.is_pinned);
  const urgent = (tasks.data ?? []).filter(t => t.status !== 'completed').slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Meetings" />
          <div className="mt-4 flex flex-col gap-3">
            {(meetings.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No meetings scheduled.</p>
            ) : (
              meetings.data?.slice(0, 5).map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{m.title}</div>
                    <div className="text-sm text-slate-500">{m.date} · {m.time}</div>
                  </div>
                  <span className="shrink-0 text-sm text-slate-500">{m.venue}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Open tasks" />
          <div className="mt-4 flex flex-col gap-3">
            {urgent.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing outstanding.</p>
            ) : (
              urgent.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{t.title}</div>
                    <div className="text-sm text-slate-500">Due {t.due_date ?? '—'}</div>
                  </div>
                  <StatusChip status={t.status} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Pinned notes" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pinned.length === 0 ? (
            <EmptyState title="Nothing pinned" description="Pin a note to keep it here." icon={Pin} />
          ) : (
            pinned.map(note => (
              <article key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <h3 className="flex items-center justify-between font-medium text-slate-900">
                  {note.title}
                  <Pin className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{note.content}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
