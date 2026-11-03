import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@astryxdesign/core/Toast';

import { api } from '../services/api';
import { describeError } from '../services/errors';
import { ErrorState } from '../components/ui/ErrorState';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { Switch } from '@astryxdesign/core/Switch';
import { PageShell } from '../components/ui/PageShell';
import { PageHeader } from '../components/ui/PageHeader';

interface Preferences {
  email_on_action_required: boolean;
  email_daily_digest: boolean;
}

const KEY = ['me', 'notification-preferences'] as const;

/**
 * One preference row.
 *
 * Was a file-local control built on a raw `<input type="checkbox"
 * role="switch">`. That was honest markup — focusable, Space-toggleable,
 * announces its own state — but it also meant this screen had its own switch
 * that looked nothing like the design system's.
 *
 * Now Astryx `Switch`, with `labelSpacing="spread"` to keep the label left and
 * the control right.
 *
 * Astryx `Switch` directly, not a react-hook-form-bound field: these
 * preferences save the moment they are flipped rather than on a submit, so a
 * form with no submit button would be the wrong abstraction — and worse, would
 * imply unsaved state where there is none. See the note in
 * src/components/ui/form/fields.tsx on why no `SwitchField` exists.
 */
const PreferenceRow: React.FC<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ id, label, description, checked, disabled, onChange }) => (
  <div className="border-b border-border py-5 last:border-b-0">
    <Switch
      id={id}
      label={label}
      description={description}
      value={checked}
      isDisabled={disabled}
      labelPosition="start"
      labelSpacing="spread"
      onChange={next => onChange(next)}
    />
  </div>
);

/**
 * Turning email off.
 *
 * A system that emails you about things you did not ask to hear about, with no
 * way to stop it, gets filtered wholesale — including the messages that
 * actually needed you. This screen is what makes the default-on
 * action-required email defensible.
 */
export const NotificationSettings: React.FC = () => {
  const showToast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Preferences>('/me/notification-preferences'),
  });

  const save = useMutation({
    mutationFn: (next: Preferences) => api.put<Preferences>('/me/notification-preferences', next),
    onSuccess: updated => {
      queryClient.setQueryData(KEY, updated);
      showToast({ body: 'Notification preferences saved.', type: 'info' });
    },
    onError: e => {
      // Put the real value back rather than leaving the switch showing
      // something the server did not accept.
      void refetch();
      showToast({ body: `Could not save: ${describeError(e)}`, type: 'error' });
    },
  });

  if (isLoading) return <PageSkeleton variant="detail" label="Loading your preferences" />;
  if (isError || !data) {
    return (
      <div className="p-8">
        <ErrorState title="Preferences didn't load" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const update = (patch: Partial<Preferences>) => save.mutate({ ...data, ...patch });

  return (
    <PageShell maxWidth="3xl">
      {/*
        * PageHeader, not SectionHeader: this is the screen's own name, so it
        * has to be an h1. It was an h2 before, which meant this page had no
        * level-1 heading at all and a screen-reader user got no announcement
        * of where they had landed.
        */}
      <PageHeader
        title="Notifications"
        description="What reaches you outside the portal."
      />

      <div className="mt-6 rounded-lg border border-border bg-card px-6 shadow-sm">
        <PreferenceRow
          id="pref-action-required"
          label="Email me when something needs my action"
          description="A claim routed to you for review, a plan awaiting your approval, an event proposal you have to sign off. Approval workflows stall until somebody notices, which is why this is on by default."
          checked={data.email_on_action_required}
          disabled={save.isPending}
          onChange={next => update({ email_on_action_required: next })}
        />
        <PreferenceRow
          id="pref-daily-digest"
          label="Send me a daily digest"
          description="One morning email summarising everything waiting on you, most urgent first. Nothing is sent on days when your queue is empty."
          checked={data.email_daily_digest}
          disabled={save.isPending}
          onChange={next => update({ email_daily_digest: next })}
        />
      </div>

      <p className="mt-4 text-sm text-secondary">
        In-app notifications are always shown; these settings only control email.
      </p>
    </PageShell>
  );
};
