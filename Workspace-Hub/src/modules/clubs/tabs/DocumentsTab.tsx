import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { FileText } from 'lucide-react';

import { useClubDocuments, useClubKnowledgeBase } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { ClubDocument } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const CATEGORIES = [
  'Annual Plans', 'Reports', 'Meeting Documents', 'Policies', 'Templates',
  'Recruitment Material', 'Financial Documents', 'Brand Assets', 'Presentations',
];

export const DocumentsTab: React.FC = () => {
  const { clubId, bootstrap } = useClubWorkspace();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = React.useState<'all' | 'knowledge-base'>('all');
  const all = useClubDocuments(clubId);
  const kb = useClubKnowledgeBase(clubId);
  const active = view === 'all' ? all : kb;

  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('Templates');
  const [tags, setTags] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name || file.name);
      fd.append('category', category);
      fd.append('tags', tags);
      await api.upload(`/clubs/${clubId}/documents`, fd);
      setFile(null); setName(''); setTags('');
      showToast({ body: 'Document uploaded.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'documents') });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'knowledge-base') });
    } catch (err) {
      // The server refuses oversized files (413) and disallowed types (415)
      // with a specific reason; surface it rather than a generic message.
      showToast({ body: `Upload failed: ${describeError(err)}`, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

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

  if (active.isLoading) return <PageLoader label="Loading documents..." />;
  if (active.isError) {
    return <ErrorState title="Documents didn't load" error={active.error} onRetry={() => void active.refetch()} />;
  }

  const columns: Column<ClubDocument>[] = [
    { key: 'name', header: 'Name', render: d => <span className="font-medium text-slate-900">{d.name}</span> },
    { key: 'category', header: 'Category', secondary: true, render: d => d.category },
    { key: 'version', header: 'Version', secondary: true, render: d => `v${d.version}` },
    { key: 'tags', header: 'Tags', secondary: true, render: d => d.tags || '—' },
    {
      key: 'action', header: 'Action', align: 'right',
      render: d => (
        <button type="button" onClick={() => download(d)} className="text-sky-700 hover:underline">
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
              view === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {v === 'all' ? 'All documents' : 'Knowledge base'}
          </button>
        ))}
      </div>

      {bootstrap.capabilities.can_write ? (
        <form onSubmit={upload} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm sm:grid-cols-4">
          <label className="sr-only" htmlFor="doc-file">File</label>
          <input
            id="doc-file" required type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2"
          />
          <label className="sr-only" htmlFor="doc-name">Display name</label>
          <input id="doc-name" placeholder="Display name (optional)" value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <label className="sr-only" htmlFor="doc-category">Category</label>
          <select id="doc-category" value={category} onChange={e => setCategory(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="sr-only" htmlFor="doc-tags">Tags</label>
          <input id="doc-tags" placeholder="Tags (comma separated, e.g. sop,knowledge-base)" value={tags}
            onChange={e => setTags(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-3" />
          <Button label={isUploading ? 'Uploading…' : 'Upload'} variant="primary" isDisabled={isUploading || !file} type="submit" />
        </form>
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
