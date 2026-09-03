import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useStore } from '../../context/useStore';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { CheckSquare, FileText, Folder, BookOpen, Clock, Compass, Plus, Pin, Star, Share2, Info, Users } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Skeleton } from '@astryxdesign/core/Skeleton';

export const FacultyDashboard: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'calendar' | 'tasks' | 'meetings' | 'notes' | 'documents' | 'directory' | 'reminders'>('dashboard');
  const user = useStore(state => state.user);

  const [notes, setNotes] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [directorySearch, setDirectorySearch] = useState('');
  const [reminders, setReminders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  // Notes Form State
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Meeting Form State
  const [meetTitle, setMeetTitle] = useState('');
  const [meetDate, setMeetDate] = useState('');
  const [meetTime, setMeetTime] = useState('');
  const [meetVenue, setMeetVenue] = useState('');

  // Document Form State
  const [docFile, setDocFile] = useState<File | null>(null);

  // Reminder Form State
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDueDate, setReminderDueDate] = useState('');

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const nList = await api.get<any[]>('/faculty/notes');
        setNotes(nList);

        const dList = await api.get<any[]>('/faculty/documents');
        setDocs(dList);

        const mList = await api.get<any[]>('/faculty/meetings');
        setMeetings(mList);

        const tList = await api.get<any[]>('/tasks');
        setTasks(tList);

        const rList = await api.get<any[]>('/faculty/reminders');
        setReminders(rList);

        if (activeSubTab === 'calendar' || activeSubTab === 'dashboard') {
          const cal = await api.get<any[]>('/calendar');
          setCalendarEvents(cal);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [activeSubTab]);

  // Kept separate from loadData() above — previously every keystroke in the
  // directory search box re-fetched notes/docs/meetings/tasks/reminders too.
  useEffect(() => {
    if (activeSubTab !== 'directory') return;
    let cancelled = false;
    setIsLoadingDirectory(true);
    api.get<any[]>(`/users/directory${directorySearch ? `?q=${encodeURIComponent(directorySearch)}` : ''}`)
      .then(dir => { if (!cancelled) setDirectory(dir); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setIsLoadingDirectory(false); });
    return () => { cancelled = true; };
  }, [activeSubTab, directorySearch]);

  const togglePin = async (note: any) => {
    const updated = await api.put<any>(`/faculty/notes/${note.id}`, { is_pinned: !note.is_pinned });
    setNotes(notes.map(n => n.id === note.id ? updated : n));
  };

  const handleCreateReminder = async () => {
    if (!reminderTitle || !reminderDueDate) return;
    const created = await api.post<any>('/faculty/reminders', { title: reminderTitle, due_date: reminderDueDate, reminder_type: 'due_date' });
    setReminders([...reminders, created]);
    setReminderTitle(''); setReminderDueDate('');
  };

  const completeReminder = async (reminder: any) => {
    const updated = await api.put<any>(`/faculty/reminders/${reminder.id}`, { status: 'completed' });
    setReminders(reminders.map(r => r.id === reminder.id ? updated : r));
  };

  const handleAddNote = async () => {
    if (!noteTitle) return;
    await api.post('/faculty/notes', { title: noteTitle, content: noteContent });
    setNoteTitle('');
    setNoteContent('');
    setActiveSubTab('notes');
  };

  const handleCreateMeeting = async () => {
    if (!meetTitle) return;
    await api.post('/faculty/meetings', { title: meetTitle, date: meetDate, time: meetTime, venue: meetVenue });
    setMeetTitle('');
    setMeetDate('');
    setMeetTime('');
    setMeetVenue('');
    setActiveSubTab('meetings');
  };

  const handleUploadDocument = async () => {
    if (!docFile) return;
    const formData = new FormData();
    formData.append('file', docFile);
    formData.append('name', docFile.name);
    await api.upload('/faculty/documents', formData);
    setDocFile(null);
    setActiveSubTab('documents');
  };

  return (
    <div className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 flex flex-col">
      {/* Sub Navbar (Horizontal Top Bar) */}
      <div className="w-full border-b border-slate-200/40 bg-white px-6 py-2.5 flex gap-4 overflow-x-auto scrollbar-none z-10 shadow-sm">
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'calendar', label: 'Calendar Schedule' },
          { id: 'tasks', label: 'Task List' },
          { id: 'meetings', label: 'Meetings Desk' },
          { id: 'notes', label: 'Personal Notes' },
          { id: 'documents', label: 'Documents Locker' },
          { id: 'directory', label: 'Faculty Directory' },
          { id: 'reminders', label: 'Reminders' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveSubTab(item.id as any)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap focus:outline-none ${ activeSubTab === item.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 ' }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Workspace Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl w-full mx-auto">
        <div className="mb-6">
          <span className="text-xs font-bold text-sky-500 uppercase tracking-wider">Personal Operating System</span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Welcome, {user?.name}</h1>
          <p className="text-xs text-slate-500 mt-1">Manage notes, documents, timetables, and meeting logs from a unified dashboard.</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <Skeleton key={i} height={80} index={i} />)}
          </div>
        ) : (
        <>
        {/* Tab 1: Dashboard Widgets */}
        {activeSubTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Today's Meetings */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                <h3 className="font-bold text-slate-900 text-sm mb-4">Department Meetings</h3>
                <div className="space-y-3">
                  {meetings.map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{m.title}</div>
                        <div className="text-slate-400 mt-0.5">{m.date} | {m.time}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-600">{m.venue}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks due */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
                <h3 className="font-bold text-slate-900 text-sm mb-4">Urgent Tasks</h3>
                <div className="space-y-3">
                  {tasks.map((t, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{t.title}</div>
                        <div className="text-slate-400 mt-0.5">Due: {t.due_date}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded uppercase font-bold text-[9px] ${ t.priority === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600' }`}>{t.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Notes Widget */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-4">Pinned Notes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {notes.filter(n => n.is_pinned).map(note => (
                  <div key={note.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 text-xs">
                    <h4 className="font-bold text-slate-900 flex items-center justify-between">
                      {note.title}
                      <Pin className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                    </h4>
                    <p className="text-slate-500 mt-2 leading-relaxed">{note.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Calendar Schedule — real, via the Calendar Engine (Phase 6).
            Was previously a hardcoded 3-day literal array with zero API calls. */}
        {activeSubTab === 'calendar' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-900 text-sm">Unified Calendar</h3>
            {(['timetable', 'meeting', 'club_event', 'task'] as const).map(type => {
              const items = calendarEvents.filter(ev => ev.type === type);
              if (items.length === 0) return null;
              const labels: Record<string, string> = {
                timetable: 'Teaching Timetable', meeting: 'Meetings', club_event: 'Club Events', task: 'Tasks Due',
              };
              return (
                <div key={type}>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{labels[type]}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {items.map((ev, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white border border-slate-200/60 shadow-sm text-xs">
                        <div className="font-bold text-slate-900">{ev.title}</div>
                        <div className="text-slate-400 mt-1">
                          {ev.start} {ev.hour ? `| ${ev.hour}` : ''} {ev.venue ? `| ${ev.venue}` : ''}
                        </div>
                        {ev.description && <p className="text-slate-500 mt-1.5 leading-relaxed">{ev.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {calendarEvents.length === 0 && <div className="text-xs text-slate-400">No calendar events to show yet.</div>}
          </div>
        )}

        {/* Tab 3: Tasks */}
        {activeSubTab === 'tasks' && (
          <div className="space-y-6">
            <h3 className="font-bold text-slate-900 text-sm">Actionable Items List</h3>
            <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-4">Task Description</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {tasks.map(t => (
                    <tr key={t.id}>
                      <td className="px-6 py-4 font-bold text-slate-900">{t.title}</td>
                      <td className="px-6 py-4">{t.due_date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] ${ t.priority === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600' }`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-500">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Meetings */}
        {activeSubTab === 'meetings' && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Create Meeting form */}
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
              <div className="space-y-4 text-xs">
                <h3 className="font-bold text-slate-900 text-sm">Schedule Meeting</h3>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Title</label>
                  <input type="text" value={meetTitle} onChange={e => setMeetTitle(e.target.value)} required className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <DateInput label="Date" value={meetDate || undefined} onChange={(v) => setMeetDate(v || '')} isRequired />
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Time</label>
                  <input type="text" placeholder="02:30 PM" value={meetTime} onChange={e => setMeetTime(e.target.value)} required className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Venue</label>
                  <input type="text" value={meetVenue} onChange={e => setMeetVenue(e.target.value)} required className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <Button
                  label={user?.primary_role === 'super_admin' ? 'View-Only Admin Mode' : 'Create Meeting Entry'}
                  isDisabled={user?.primary_role === 'super_admin' || !meetTitle}
                  variant="primary"
                  clickAction={handleCreateMeeting}
                />
              </div>
            </div>

            {/* Meetings list */}
            <div className="md:col-span-2 space-y-6">
              <h3 className="font-bold text-slate-900 text-sm">Upcoming Meetings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {meetings.map(m => (
                  <div key={m.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">{m.type}</span>
                      <h4 className="font-bold text-slate-900 mt-1 text-xs">{m.title}</h4>
                      <p className="text-slate-500 mt-2 text-[10px] leading-relaxed">Location: {m.venue} | {m.time}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-[10px]">
                      <span className="text-slate-400">{m.date}</span>
                      <span className="font-bold text-sky-500 uppercase">{m.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Notes */}
        {activeSubTab === 'notes' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
              <div className="space-y-4 text-xs">
                <h3 className="font-bold text-slate-900 text-sm">Add Quick Note</h3>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Title</label>
                  <input type="text" value={noteTitle} onChange={e => setNoteTitle(e.target.value)} required className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Content</label>
                  <textarea rows={4} value={noteContent} onChange={e => setNoteContent(e.target.value)} required className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <Button
                  label={user?.primary_role === 'super_admin' ? 'View-Only Admin Mode' : 'Save Note'}
                  isDisabled={user?.primary_role === 'super_admin' || !noteTitle}
                  variant="primary"
                  clickAction={handleAddNote}
                />
              </div>
            </div>

            <div className="md:col-span-2 space-y-6">
              <h3 className="font-bold text-slate-900 text-sm">Your Personal Repository</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {notes.map(note => (
                  <div key={note.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between relative">
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">{note.title}</h4>
                      <p className="text-slate-500 mt-2 text-xs leading-relaxed">{note.content}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2 justify-end text-[10px] items-center">
                      <button onClick={() => togglePin(note)} title={note.is_pinned ? 'Unpin' : 'Pin'}>
                        <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300'}`} />
                      </button>
                      {note.is_favorite && <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Documents */}
        {activeSubTab === 'documents' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
              <div className="space-y-4 text-xs">
                <h3 className="font-bold text-slate-900 text-sm">Upload Document</h3>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Name</label>
                  <input type="file" onChange={e => setDocFile(e.target.files?.[0] ?? null)} required className="text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white" />
                </div>
                <Button
                  label={user?.primary_role === 'super_admin' ? 'View-Only Admin Mode' : 'Upload PDF'}
                  isDisabled={user?.primary_role === 'super_admin' || !docFile}
                  variant="primary"
                  clickAction={handleUploadDocument}
                />
              </div>
            </div>

            <div className="md:col-span-2 space-y-6">
              <h3 className="font-bold text-slate-900 text-sm">Locker Documents</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {docs.map(doc => (
                  <div key={doc.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">{doc.folder_path}</span>
                      <h4 className="font-bold text-slate-900 mt-1 text-xs">{doc.name}</h4>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <button
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/shared/${doc.shared_link}`)}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Copy Share Link
                      </button>
                      <a
                        href="#"
                        onClick={async e => {
                          e.preventDefault();
                          const { url } = await api.get<{ url: string }>(`/faculty/documents/${doc.id}/download-url`);
                          window.open(url, '_blank');
                        }}
                        className="text-slate-400 hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 7: Faculty Directory — real, via GET /users/directory (Phase 6).
            No such endpoint existed before; this tab was 100% static JSX. */}
        {activeSubTab === 'directory' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Department Faculty Directory</h3>
              <input
                type="text"
                placeholder="Search by name, designation, role..."
                value={directorySearch}
                onChange={e => setDirectorySearch(e.target.value)}
                className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg w-64"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {isLoadingDirectory && [0, 1, 2].map(i => <Skeleton key={i} height={120} index={i} />)}
              {!isLoadingDirectory && directory.map((fct) => (
                <div key={fct.id} className="p-5 rounded-2xl bg-white border border-slate-200/60 shadow-sm space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900">{fct.name}</h4>
                  <div className="text-slate-500 font-semibold">{fct.designation || fct.role_tags_str || 'Faculty'}</div>
                  <div className="text-slate-400">{fct.email}</div>
                  {fct.office_location && <div className="text-slate-400 text-[10px]">{fct.office_location}</div>}
                  {fct.office_hours && <div className="text-slate-400 text-[10px]">Office hours: {fct.office_hours}</div>}
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase ${ fct.availability_status === 'available' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500' }`}>{fct.availability_status}</span>
                </div>
              ))}
              {!isLoadingDirectory && directory.length === 0 && <div className="text-xs text-slate-400">No faculty found.</div>}
            </div>
          </div>
        )}

        {/* Tab 8: Reminders (Phase 6 — new; no model/endpoints existed before) */}
        {activeSubTab === 'reminders' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/60 shadow-sm">
              <div className="space-y-4 text-xs">
                <h3 className="font-bold text-slate-900 text-sm">New Reminder</h3>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 font-semibold">Title</label>
                  <input type="text" value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} required className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg" />
                </div>
                <DateInput label="Due Date" value={reminderDueDate || undefined} onChange={(v) => setReminderDueDate(v || '')} isRequired />
                <Button
                  label="Create Reminder"
                  isDisabled={!reminderTitle || !reminderDueDate}
                  variant="primary"
                  clickAction={handleCreateReminder}
                />
              </div>
            </div>
            <div className="md:col-span-2 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">Your Reminders</h3>
              {reminders.map(r => (
                <div key={r.id} className="p-4 rounded-xl bg-white border border-slate-200/60 shadow-sm flex items-center justify-between text-xs">
                  <div>
                    <div className={`font-bold ${r.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900 '}`}>{r.title}</div>
                    <div className="text-slate-400 mt-0.5">Due: {r.due_date}</div>
                  </div>
                  {r.status !== 'completed' && (
                    <Button label="Mark Done" size="sm" variant="secondary" clickAction={() => completeReminder(r)} />
                  )}
                </div>
              ))}
              {reminders.length === 0 && <div className="text-xs text-slate-400">No reminders yet.</div>}
            </div>
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
};
