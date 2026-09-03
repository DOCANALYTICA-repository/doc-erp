import React from 'react';
import { Calendar, ClipboardList, Users, Wallet } from 'lucide-react';

import { useClubEvents } from '../../../api/hooks';
import { StatusChip } from '../../../components/ui/StatusChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const Tile: React.FC<{
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}> = ({ label, value, icon: Icon }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
    <Icon className="h-7 w-7 text-slate-300" aria-hidden="true" />
  </div>
);

export const DashboardTab: React.FC = () => {
  const { bootstrap } = useClubWorkspace();
  const { counters } = bootstrap;

  // The counters come from the shell, so these tiles cost NOTHING — they used
  // to be `members.length` and `events.length` on five fully-fetched lists.
  const { data: events = [] } = useClubEvents(bootstrap.club.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Members" value={counters.members} icon={Users} />
        <Tile label="Events" value={counters.events} icon={Calendar} />
        <Tile
          label="Budget spent"
          value={`Rs ${counters.budget_spent.toLocaleString('en-IN')}`}
          icon={Wallet}
        />
        <Tile label="Open tasks" value={counters.open_tasks} icon={ClipboardList} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Upcoming and recent events" />
        <div className="mt-4 flex flex-col gap-2">
          {events.length === 0 ? (
            <EmptyState
              title="No events yet"
              description="Event proposals submitted from the Annual Events tab will appear here."
              icon={Calendar}
            />
          ) : (
            events.map(evt => (
              <div
                key={evt.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <StatusChip status={evt.status} />
                  <div>
                    <span className="text-sm font-medium text-slate-900">{evt.title}</span>
                    <span className="ml-2 text-sm text-slate-500">{evt.date}</span>
                  </div>
                </div>
                <span className="text-sm text-slate-500">{evt.venue}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
