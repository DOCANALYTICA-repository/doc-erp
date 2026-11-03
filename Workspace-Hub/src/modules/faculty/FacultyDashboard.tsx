import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { FACULTY_DEFAULT_TAB, FACULTY_TABS, isFacultyTab } from './tabs';

import { CalendarTab } from './tabs/CalendarTab';
import { DirectoryTab } from './tabs/DirectoryTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { MeetingsTab } from './tabs/MeetingsTab';
import { NotesTab } from './tabs/NotesTab';
import { OverviewTab } from './tabs/OverviewTab';
import { RemindersTab } from './tabs/RemindersTab';
import { TasksTab } from './tabs/TasksTab';
import { TabStrip } from '../../components/ui/TabStrip';
import { PageShell } from '../../components/ui/PageShell';
import { PageHeader } from '../../components/ui/PageHeader';

/**
 * The Faculty workspace shell.
 *
 * 622 lines down to a router. Each tab owns its own query, so switching tabs
 * issues no network traffic at all — the previous effect re-ran five requests
 * on every one of the eight tab clicks.
 */
const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: OverviewTab,
  calendar: CalendarTab,
  tasks: TasksTab,
  meetings: MeetingsTab,
  notes: NotesTab,
  documents: DocumentsTab,
  directory: DirectoryTab,
  reminders: RemindersTab,
};

export const FacultyDashboard: React.FC = () => {
  const { tab } = useParams<{ tab: string }>();

  if (!isFacultyTab(tab)) {
    return <Navigate to={`/app/faculty/${FACULTY_DEFAULT_TAB}`} replace />;
  }

  const ActiveTab = TAB_COMPONENTS[tab];

  return (
    <PageShell
      maxWidth="6xl"
      toolbar={
        <TabStrip
          label="Faculty workspace sections"
          activeId={tab}
          items={FACULTY_TABS.map(item => ({
            id: item.id,
            label: item.label,
            to: `/app/faculty/${item.id}`,
          }))}
        />
      }
    >
      <PageHeader
        title="Faculty workspace"
        description="Meetings, notes, documents, your timetable and the department directory."
      />

      <ActiveTab />
    </PageShell>
  );
};
