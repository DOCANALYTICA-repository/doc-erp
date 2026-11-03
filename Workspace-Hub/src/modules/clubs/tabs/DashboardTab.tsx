import React from 'react';
import { Calendar, ClipboardList, Users, Wallet } from 'lucide-react';

import { useClubEvents } from '../../../api/hooks';
import { StatusChip } from '../../../components/ui/StatusChip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatTile } from '../../../components/ui/StatTile';
import { ListRow } from '../../../components/ui/ListRow';
import { Card } from '../../../components/ui/Card';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const DashboardTab: React.FC = () => {
  const { bootstrap } = useClubWorkspace();
  const { counters } = bootstrap;

  // The counters come from the shell, so these tiles cost NOTHING — they used
  // to be `members.length` and `events.length` on five fully-fetched lists.
  const { data: events = [] } = useClubEvents(bootstrap.club.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Members" value={counters.members} icon={Users} />
        <StatTile label="Events" value={counters.events} icon={Calendar} />
        <StatTile
          label="Budget spent"
          value={`Rs ${counters.budget_spent.toLocaleString('en-IN')}`}
          icon={Wallet}
        />
        <StatTile label="Open tasks" value={counters.open_tasks} icon={ClipboardList} />
      </div>

      <Card as="section">
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
              <ListRow
                key={evt.id}
                leading={<StatusChip status={evt.status} />}
                title={evt.title}
                meta={evt.date}
                status={<span className="text-sm text-secondary">{evt.venue}</span>}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
