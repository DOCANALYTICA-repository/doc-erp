import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { FolderOpen, Share2 } from 'lucide-react';

import { useFacultyDocuments } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { facultyKeys } from '../../../lib/queryKeys';
import { useStore } from '../../../context/useStore';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { FacultyDocument } from '../../../api/types';

export const DocumentsTab: React.FC = () => {
  const { data: docs, isLoading, isError, error, refetch } = useFacultyDocuments();
  const user = useStore(s => s.user);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [file, setFile] = React.useState<File | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const isReadOnly = user?.primary_role === 'super_admin';

  const upload = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', file.name);
      await api.upload('/faculty/documents', fd);
      setFile(null);
      showToast({ body: 'Document uploaded.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: facultyKeys.documents() });
    } catch (e) {
      showToast({ body: `Upload failed: ${describeError(e)}`, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const download = async (doc: FacultyDocument) => {
    try {
      const { url } = await api.get<{ url: string }>(`/faculty/documents/${doc.id}/download-url`);
      if (!url) {
        showToast({ body: 'That document has no stored file.', type: 'error' });
        return;
      }
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      showToast({ body: `Could not open the document: ${describeError(e)}`, type: 'error' });
    }
  };

  const copyShareLink = async (doc: FacultyDocument) => {
    const link = `${window.location.origin}/shared/${doc.shared_link}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ body: 'Share link copied.', type: 'info' });
    } catch {
      // clipboard access is denied in some browsers and every insecure origin;
      // previously this failed completely silently.
      showToast({ body: `Copy failed. The link is ${link}`, type: 'error' });
    }
  };

  if (isLoading) return <PageSkeleton variant="list" label="Loading documents" />;
  if (isError) return <ErrorState title="Documents didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Card as="section">
        <SectionHeader title="Upload" />
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <label className="font-medium text-secondary" htmlFor="faculty-doc-file">File</label>
          <input
            id="faculty-doc-file"
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-secondary file:mr-4 file:rounded-md file:border-0 file:bg-sand-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
          <p className="text-xs text-secondary">PDF, image, Office document or plain text, up to 10 MB.</p>
          <Button
            label={isReadOnly ? 'Admin is view-only here' : isUploading ? 'Uploading…' : 'Upload'}
            variant="primary"
            isDisabled={isReadOnly || isUploading || !file}
            clickAction={upload}
          />
        </div>
      </Card>

      <div className="flex flex-col gap-4 md:col-span-2">
        <SectionHeader title="Document locker" />
        {(docs ?? []).length === 0 ? (
          <EmptyState title="No documents yet" icon={FolderOpen} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {docs?.map(doc => (
              <Card as="article" padding="md" className="flex flex-col justify-between" key={doc.id}>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                    {doc.folder_path}
                  </span>
                  <h3 className="mt-1 font-medium text-primary">{doc.name}</h3>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <button
                    type="button"
                    onClick={() => copyShareLink(doc)}
                    className="inline-flex items-center gap-1.5 text-accent hover:underline"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Copy share link
                  </button>
                  <button type="button" onClick={() => download(doc)} className="text-secondary hover:underline">
                    Download
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
