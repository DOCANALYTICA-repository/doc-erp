import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Megaphone } from 'lucide-react';

import { useClubAnnouncements } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const TYPES = [
  { value: 'general', label: 'General update' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'event', label: 'Event update' },
  { value: 'deadline', label: 'Deadline reminder' },
];

export const AnnouncementsTab: React.FC = () => {
  const { clubId, bootstrap } = useClubWorkspace();
  const { data: rows, isLoading, isError, error, refetch } = useClubAnnouncements(clubId);
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [type, setType] = React.useState('general');
  const [isSaving, setIsSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post(`/clubs/${clubId}/announcements`, {
        club_id: clubId, title, body, announcement_type: type,
      });
      setTitle(''); setBody(''); setIsOpen(false);
      showToast({ body: 'Announcement published.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'announcements') });
    } catch (err) {
      showToast({ body: `Could not publish: ${describeError(err)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <PageLoader label="Loading announcements..." />;
  if (isError) return <ErrorState title="Announcements didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Club announcements"
        action={
          bootstrap.capabilities.can_write ? (
            <Button label="New announcement" variant="primary" size="sm" clickAction={() => setIsOpen(o => !o)} />
          ) : null
        }
      />

      {isOpen ? (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
          <label className="font-medium text-slate-600" htmlFor="ann-title">Title</label>
          <input
            id="ann-title" required value={title} onChange={e => setTitle(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <label className="font-medium text-slate-600" htmlFor="ann-body">Message</label>
          <textarea
            id="ann-body" required rows={3} value={body} onChange={e => setBody(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          />
          <label className="font-medium text-slate-600" htmlFor="ann-type">Type</label>
          <select
            id="ann-type" value={type} onChange={e => setType(e.target.value)}
            className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          >
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div>
            <Button label={isSaving ? 'Publishing…' : 'Publish'} variant="primary" isDisabled={isSaving} type="submit" />
          </div>
        </form>
      ) : null}

      {rows && rows.length === 0 ? (
        <EmptyState title="No announcements yet" icon={Megaphone} />
      ) : (
        <div className="flex flex-col gap-3">
          {rows?.map(a => (
            <article key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{a.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
