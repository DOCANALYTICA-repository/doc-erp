import React from 'react';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { FileText } from 'lucide-react';

import { useClubDocuments, useClubKnowledgeBase } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { ClubDocument } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { useZodForm, withServerErrors } from '../../../lib/forms';
import { TextField, SelectField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';

const CATEGORIES = [
  'Annual Plans', 'Reports', 'Meeting Documents', 'Policies', 'Templates',
  'Recruitment Material', 'Financial Documents', 'Brand Assets', 'Presentations',
];

/**
 * Metadata only — the `File` itself is not an rhf field. See the note on
 * `file` state below.
 */
const uploadSchema = z.object({
  name: z.string().trim().optional(),
  category: z.string().min(1, 'Pick a category.'),
  tags: z.string().trim().optional(),
});

export const DocumentsTab: React.FC = () => {
  const { clubId, bootstrap } = useClubWorkspace();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = React.useState<'all' | 'knowledge-base'>('all');
  const all = useClubDocuments(clubId);
  const kb = useClubKnowledgeBase(clubId);
  const active = view === 'all' ? all : kb;

  /*
   * `file` stays in local state rather than in the form.
   *
   * A `File` is not serialisable and rhf's resolver would have to validate an
   * opaque browser object; the checks that matter (size, MIME type) are the
   * server's anyway, and it enforces them properly with 413 and 415. So the
   * schema validates the metadata and the file is carried alongside — with one
   * client-side rule kept, that a file was actually chosen.
   */
  const [file, setFile] = React.useState<File | null>(null);

  const form = useZodForm(uploadSchema, {
    defaultValues: { name: '', category: 'Templates', tags: '' },
  });
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const upload = withServerErrors(form, async values => {
    if (!file) {
      // The only client-side file rule worth having. It reads as a form-level
      // error because the file input is not an rhf field.
      setError('root.server', { type: 'manual', message: 'Choose a file to upload.' });
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    // Fall back to the file's own name, as before — an unnamed document in a
    // shared library is unfindable.
    fd.append('name', values.name?.trim() || file.name);
    fd.append('category', values.category);
    fd.append('tags', values.tags ?? '');

    // The server refuses oversized files (413) and disallowed types (415) with
    // a specific reason. `withServerErrors` surfaces it as a form-level alert
    // beside the control rather than a toast that vanishes.
    await api.upload(`/clubs/${clubId}/documents`, fd);

    setFile(null);
    reset();
    showToast({ body: 'Document uploaded.', type: 'info' });
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'documents') });
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'knowledge-base') });
  });


  const download = async (doc: ClubDocument) => {
    try {
      const { url } = await api.get<{ url: string }>(`/clubs/documents/${doc.id}/download-url`);
      if (!url) {
        showToast({ body: 'That file has no stored contents.', type: 'error' });
        return;
      }
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      showToast({ body: `Could not open the document: ${describeError(e)}`, type: 'error' });
    }
  };

  if (active.isLoading) return <PageSkeleton variant="table" label="Loading documents" />;
  if (active.isError) {
    return <ErrorState title="Documents didn't load" error={active.error} onRetry={() => void active.refetch()} />;
  }

  const columns: Column<ClubDocument>[] = [
    { key: 'name', header: 'Name', render: d => <span className="font-medium text-primary">{d.name}</span> },
    { key: 'category', header: 'Category', secondary: true, render: d => d.category },
    { key: 'version', header: 'Version', secondary: true, render: d => `v${d.version}` },
    { key: 'tags', header: 'Tags', secondary: true, render: d => d.tags || '—' },
    {
      key: 'action', header: 'Action', align: 'right',
      render: d => (
        <button type="button" onClick={() => download(d)} className="text-accent hover:underline">
          Download
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Documents" />

      <div className="flex gap-2" role="tablist" aria-label="Document view">
        {(['all', 'knowledge-base'] as const).map(v => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === v ? 'bg-sand-900 text-white' : 'text-secondary hover:text-primary'
            }`}
          >
            {v === 'all' ? 'All documents' : 'Knowledge base'}
          </button>
        ))}
      </div>

      {bootstrap.capabilities.can_write ? (
        <Card as="form" padding="md" className="flex flex-col gap-4 text-sm shadow-sm" onSubmit={handleSubmit(upload)} noValidate>
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-secondary" htmlFor="doc-file">
              File
            </label>
            <input
              id="doc-file"
              type="file"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="rounded-md border border-border bg-card px-3 py-2 file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-accent"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="name"
              label="Display name"
              placeholder={file?.name ?? 'Defaults to the file name'}
            />
            <SelectField
              control={control}
              name="category"
              label="Category"
              options={CATEGORIES.map(c => ({ value: c, label: c }))}
              isRequired
            />
          </div>

          <TextField
            control={control}
            name="tags"
            label="Tags"
            description="Comma separated. Add `knowledge-base` to surface it in that view."
            placeholder="sop, knowledge-base"
          />

          <FormError message={rootServerError(errors)} />

          <div>
            <Button
              label={isSubmitting ? 'Uploading…' : 'Upload'}
              variant="primary"
              isDisabled={isSubmitting}
              type="submit"
            />
          </div>
        </Card>
      ) : null}

      <DataTable
        caption="Club documents"
        columns={columns}
        rows={active.data ?? []}
        getRowKey={d => d.id}
        emptyState={
          <EmptyState
            title={view === 'all' ? 'No documents yet' : 'Nothing in the knowledge base yet'}
            description={view === 'knowledge-base' ? 'Tag a document "knowledge-base" to file it here.' : undefined}
            icon={FileText}
          />
        }
      />
    </div>
  );
};
