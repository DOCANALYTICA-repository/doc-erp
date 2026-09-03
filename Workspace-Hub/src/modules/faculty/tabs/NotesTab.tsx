import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Pin, StickyNote } from 'lucide-react';

import { useNotes } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { facultyKeys } from '../../../lib/queryKeys';
import { useStore } from '../../../context/useStore';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { Note } from '../../../api/types';

export const NotesTab: React.FC = () => {
  const { data: notes, isLoading, isError, error, refetch } = useNotes();
  const user = useStore(s => s.user);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const isReadOnly = user?.primary_role === 'super_admin';
  const invalidate = () => queryClient.invalidateQueries({ queryKey: facultyKeys.notes() });

  const add = async () => {
    if (!title.trim()) {
      showToast({ body: 'A note needs a title.', type: 'error' });
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/faculty/notes', { title, content });
      setTitle(''); setContent('');
      showToast({ body: 'Note saved.', type: 'info' });
      invalidate();
    } catch (e) {
      // This handler used to await the write, clear nothing, and call
      // setActiveSubTab to the tab it was already on — a no-op, so the new
      // note simply never appeared.
      showToast({ body: `Could not save the note: ${describeError(e)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (note: Note) => {
    try {
      await api.put(`/faculty/notes/${note.id}`, { is_pinned: !note.is_pinned });
      invalidate();
    } catch (e) {
      showToast({ body: `Could not update the note: ${describeError(e)}`, type: 'error' });
    }
  };

  if (isLoading) return <PageLoader label="Loading notes..." />;
  if (isError) return <ErrorState title="Notes didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Add a note" />
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="font-medium text-slate-600" htmlFor="note-title">Title</label>
          <input id="note-title" value={title} onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <label className="font-medium text-slate-600" htmlFor="note-content">Content</label>
          <textarea id="note-content" rows={4} value={content} onChange={e => setContent(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <Button
            label={isReadOnly ? 'Admin is view-only here' : isSaving ? 'Saving…' : 'Save note'}
            variant="primary"
            isDisabled={isReadOnly || isSaving}
            clickAction={add}
          />
        </div>
      </section>

      <div className="flex flex-col gap-4 md:col-span-2">
        <SectionHeader title="Your notes" />
        {(notes ?? []).length === 0 ? (
          <EmptyState title="No notes yet" icon={StickyNote} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {notes?.map(note => (
              <article key={note.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <h3 className="font-medium text-slate-900">{note.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{note.content}</p>
                </div>
                <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => togglePin(note)}
                    aria-label={note.is_pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                    aria-pressed={Boolean(note.is_pinned)}
                    className="rounded p-1 hover:bg-slate-50"
                  >
                    <Pin className={`h-4 w-4 ${note.is_pinned ? 'fill-amber-500 text-amber-500' : 'text-slate-300'}`} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
