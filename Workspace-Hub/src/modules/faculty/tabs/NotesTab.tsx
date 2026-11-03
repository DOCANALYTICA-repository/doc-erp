import React from 'react';
import { z } from 'zod';
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
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, TextAreaField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';
import type { Note } from '../../../api/types';

/**
 * `title` was guarded by an imperative toast ("A note needs a title.") that
 * fired only after the user clicked Save. The rule is the same; it now appears
 * on the title field, on blur, before they reach the button.
 */
const noteSchema = z.object({
  title: z.string().trim().min(1, 'A note needs a title.'),
  content: z.string().optional(),
});

export const NotesTab: React.FC = () => {
  const { data: notes, isLoading, isError, error, refetch } = useNotes();
  const user = useStore(s => s.user);
  const showToast = useToast();
  const queryClient = useQueryClient();


  const isReadOnly = user?.primary_role === 'super_admin';
  const invalidate = () => queryClient.invalidateQueries({ queryKey: facultyKeys.notes() });

  const form = useZodForm(noteSchema, { defaultValues: { title: '', content: '' } });
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  const add = withServerErrors(form, async values => {
    await api.post('/faculty/notes', { title: values.title, content: values.content });
    reset();
    showToast({ body: 'Note saved.', type: 'info' });
    invalidate();
  });

  const togglePin = async (note: Note) => {
    try {
      await api.put(`/faculty/notes/${note.id}`, { is_pinned: !note.is_pinned });
      invalidate();
    } catch (e) {
      showToast({ body: `Could not update the note: ${describeError(e)}`, type: 'error' });
    }
  };

  if (isLoading) return <PageSkeleton variant="list" label="Loading notes" />;
  if (isError) return <ErrorState title="Notes didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Card as="section">
        <SectionHeader title="Add a note" />
        {/*
          * A real <form>, so Enter submits. This was a <div> of inputs with a
          * click handler on the button — pressing Enter in the title field did
          * nothing at all, which on a note-taking screen is the single most
          * likely thing a user tries.
          */}
        <form onSubmit={handleSubmit(add)} noValidate className="mt-4 flex flex-col gap-4 text-sm">
          <TextField control={control} name="title" label="Title" isRequired isDisabled={isReadOnly} />
          <TextAreaField control={control} name="content" label="Content" rows={4} isDisabled={isReadOnly} />

          <FormError message={rootServerError(errors)} />

          <Button
            label={isReadOnly ? 'Admin is view-only here' : isSubmitting ? 'Saving…' : 'Save note'}
            variant="primary"
            isDisabled={isReadOnly || isSubmitting}
            type="submit"
          />
        </form>
      </Card>

      <div className="flex flex-col gap-4 md:col-span-2">
        <SectionHeader title="Your notes" />
        {(notes ?? []).length === 0 ? (
          <EmptyState title="No notes yet" icon={StickyNote} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {notes?.map(note => (
              <Card as="article" padding="md" className="flex flex-col justify-between" key={note.id}>
                <div>
                  <h3 className="font-medium text-primary">{note.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-secondary">{note.content}</p>
                </div>
                <div className="mt-4 flex justify-end border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => togglePin(note)}
                    aria-label={note.is_pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                    aria-pressed={Boolean(note.is_pinned)}
                    className="rounded p-1 hover:bg-body"
                  >
                    <Pin className={`h-4 w-4 ${note.is_pinned ? 'fill-warning text-warning' : 'text-sand-400'}`} aria-hidden="true" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
