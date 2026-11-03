import React from 'react';
import { Pin } from 'lucide-react';

import { useMeetings, useNotes, useTasks } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Card } from '../../../components/ui/Card';
import { ListRow } from '../../../components/ui/ListRow';
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
        <Card as="section">
          <SectionHeader title="Meetings" />
          <div className="mt-4 flex flex-col gap-3">
            {(meetings.data ?? []).length === 0 ? (
              <p className="text-sm text-secondary">No meetings scheduled.</p>
            ) : (
              meetings.data?.slice(0, 5).map(m => (
                <ListRow
                  key={m.id}
                  title={m.title}
                  meta={`${m.date} · ${m.time}`}
                  status={<span className="text-sm text-secondary">{m.venue}</span>}
                />
              ))
            )}
          </div>
        </Card>

        <Card as="section">
          <SectionHeader title="Open tasks" />
          <div className="mt-4 flex flex-col gap-3">
            {urgent.length === 0 ? (
              <p className="text-sm text-secondary">Nothing outstanding.</p>
            ) : (
              urgent.map(t => (
                <ListRow
                  key={t.id}
                  title={t.title}
                  meta={`Due ${t.due_date ?? '—'}`}
                  status={<StatusChip status={t.status} />}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      <Card as="section">
        <SectionHeader title="Pinned notes" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pinned.length === 0 ? (
            <EmptyState title="Nothing pinned" description="Pin a note to keep it here." icon={Pin} />
          ) : (
            pinned.map(note => (
              <Card key={note.id} as="article" tone="muted" padding="sm" elevation="none">
                <h3 className="flex items-center justify-between font-medium text-primary">
                  {note.title}
                  <Pin className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-secondary">{note.content}</p>
              </Card>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
