import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@astryxdesign/core/Toast';

import { api } from '../services/api';
import { describeError } from '../services/errors';
import { ErrorState } from '../components/ui/ErrorState';
import { PageLoader } from '../components/ui/PageLoader';
import { SectionHeader } from '../components/ui/SectionHeader';

interface Preferences {
  email_on_action_required: boolean;
  email_daily_digest: boolean;
}

const KEY = ['me', 'notification-preferences'] as const;

const Toggle: React.FC<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ id, label, description, checked, disabled, onChange }) => (
  <div className="flex items-start justify-between gap-6 border-b border-slate-100 py-4 last:border-b-0">
    <div>
      <label htmlFor={id} className="font-medium text-slate-900">{label}</label>
      <p className="mt-1 max-w-prose text-sm text-slate-500">{description}</p>
    </div>
    {/* A real checkbox, so it is focusable, toggles with Space, and announces
        its own state. A styled div would do none of those. */}
    <input
      id={id}
      type="checkbox"
      role="switch"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      className="mt-1 h-5 w-5 shrink-0 accent-sky-600"
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

  if (isLoading) return <PageLoader label="Loading your preferences..." />;
  if (isError || !data) {
    return (
      <div className="p-8">
        <ErrorState title="Preferences didn't load" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const update = (patch: Partial<Preferences>) => save.mutate({ ...data, ...patch });

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <SectionHeader
        title="Notifications"
        description="What reaches you outside the portal."
      />

      <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
        <Toggle
          id="pref-action-required"
          label="Email me when something needs my action"
          description="A claim routed to you for review, a plan awaiting your approval, an event proposal you have to sign off. Approval workflows stall until somebody notices, which is why this is on by default."
          checked={data.email_on_action_required}
          disabled={save.isPending}
          onChange={next => update({ email_on_action_required: next })}
        />
        <Toggle
          id="pref-daily-digest"
          label="Send me a daily digest"
          description="One morning email summarising everything waiting on you, most urgent first. Nothing is sent on days when your queue is empty."
          checked={data.email_daily_digest}
          disabled={save.isPending}
          onChange={next => update({ email_daily_digest: next })}
        />
      </div>

      <p className="mt-4 text-sm text-slate-500">
        In-app notifications are always shown; these settings only control email.
      </p>
    </div>
  );
};
