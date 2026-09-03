export const FACULTY_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar', label: 'Calendar Schedule' },
  { id: 'tasks', label: 'Task List' },
  { id: 'meetings', label: 'Meetings Desk' },
  { id: 'notes', label: 'Personal Notes' },
  { id: 'documents', label: 'Documents Locker' },
  { id: 'directory', label: 'Faculty Directory' },
  { id: 'reminders', label: 'Reminders' },
] as const;

export type FacultyTab = (typeof FACULTY_TABS)[number]['id'];

export const FACULTY_DEFAULT_TAB: FacultyTab = 'dashboard';

const VALID = new Set<string>(FACULTY_TABS.map(t => t.id));

export function isFacultyTab(value: string | undefined): value is FacultyTab {
  return value !== undefined && VALID.has(value);
}
