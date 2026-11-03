import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Card } from '../../../components/ui/Card';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { ClubMember } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const TEMPLATES = [
  { value: '', label: 'Member' },
  { value: 'Club Head', label: 'Club Head' },
  { value: 'Documentation Head', label: 'Documentation Head' },
  { value: 'Events Head', label: 'Events Head' },
  { value: 'Sponsorship Head', label: 'Sponsorship Head' },
  { value: 'Finance Head', label: 'Finance Head' },
];

export const SettingsTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { club, members, capabilities } = bootstrap;
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [contactEmail, setContactEmail] = React.useState(club.contact_email ?? '');
  const [isSaving, setIsSaving] = React.useState(false);

  // Keep the field in step when the shell refetches, without clobbering an
  // edit in progress.
  React.useEffect(() => { setContactEmail(club.contact_email ?? ''); }, [club.contact_email]);

  const saveEmail = async () => {
    setIsSaving(true);
    try {
      await api.put(`/clubs/${clubId}/settings`, { contact_email: contactEmail });
      showToast({ body: 'Contact email updated.', type: 'info' });
      refreshShell();
    } catch (e) {
      showToast({ body: `Could not save: ${describeError(e)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const assignTemplate = async (member: ClubMember, template: string) => {
    try {
      await api.put(`/clubs/${clubId}/members/${member.id}/permission-template`, {
        permission_template: template || null,
      });
      showToast({ body: 'Permission template updated.', type: 'info' });
      queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'members') });
      refreshShell();
    } catch (e) {
      // Previously no catch: the select showed the new template while the
      // server had refused the change.
      showToast({ body: `Could not update: ${describeError(e)}`, type: 'error' });
      refreshShell();
    }
  };

  const columns: Column<ClubMember>[] = [
    { key: 'member', header: 'Member', render: m => <span className="font-medium text-primary">{m.student_name ?? m.student_id}</span> },
    { key: 'role', header: 'Club role', secondary: true, render: m => m.role },
    {
      key: 'template', header: 'Permission template',
      render: m =>
        capabilities.can_manage_settings ? (
          <select
            aria-label={`Permission template for ${m.student_name ?? m.student_id}`}
            defaultValue={m.permission_template ?? ''}
            onChange={e => assignTemplate(m, e.target.value)}
            className="rounded-lg border border-border bg-body px-2 py-1 text-sm"
          >
            {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        ) : (
          <span className="text-secondary">{m.permission_template || 'Member'}</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card as="section" className="max-w-md">
        <SectionHeader title="Official contact email" />
        {capabilities.can_manage_settings ? (
          <div className="mt-4 flex gap-2">
            <label className="sr-only" htmlFor="club-contact-email">Official contact email</label>
            <input
              id="club-contact-email"
              type="email"
              autoComplete="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              placeholder="club@christuniversity.in"
              className="flex-1 rounded-lg border border-border bg-body px-3 py-2 text-sm"
            />
            <Button label={isSaving ? 'Saving…' : 'Save'} variant="primary" size="sm" isDisabled={isSaving} clickAction={saveEmail} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-secondary">{club.contact_email || 'Not set.'}</p>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <SectionHeader
          title="Permission templates"
          description="Templates grant club-scoped abilities on top of a member's hierarchy level."
        />
        <DataTable
          caption="Member permission templates"
          columns={columns}
          rows={members}
          getRowKey={m => m.id}
        />
      </div>
    </div>
  );
};
