import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { useToast } from '@astryxdesign/core/Toast';
import { BellOff, X } from 'lucide-react';

import { useNotifications } from '../api/hooks';
import { api } from '../services/api';
import { describeError } from '../services/errors';
import { platformKeys } from '../lib/queryKeys';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import type { Notification } from '../api/types';

/**
 * Where a notification actually takes you.
 *
 * entity_type/entity_id exist on the server precisely so this mapping is
 * possible. Before them, a claims notification named a reference number in
 * prose and left the user to go and find it.
 */
function destinationFor(n: Notification): string | null {
  if (!n.entity_type || !n.entity_id) return null;
  switch (n.entity_type) {
    case 'claim':
      return `/app/claims/my_claims?claim=${n.entity_id}`;
    case 'annual_plan':
      return '/app/clubs/annual-plan';
    case 'club':
      return `/app/clubs/dashboard?club=${n.entity_id}`;
    case 'task':
      return '/app/faculty/tasks';
    case 'meeting':
      return '/app/faculty/meetings';
    default:
      return null;
  }
}

export const NotificationTray: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { data: notifications, isLoading, isError, error, refetch } = useNotifications();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showToast = useToast();

  // Escape closes the tray. It previously had no keyboard dismissal at all.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: platformKeys.notifications });
    queryClient.invalidateQueries({ queryKey: platformKeys.unreadCount });
  };

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`, {});
      invalidate();
    } catch (e) {
      showToast({ body: `Could not mark that read: ${describeError(e)}`, type: 'error' });
    }
  };

  const markAllRead = async () => {
    try {
      const { marked_read: count } = await api.post<{ marked_read: number }>('/notifications/read-all', {});
      showToast({ body: `${count} notification${count === 1 ? '' : 's'} marked read.`, type: 'info' });
      invalidate();
    } catch (e) {
      showToast({ body: `Could not mark all read: ${describeError(e)}`, type: 'error' });
    }
  };

  const open = (n: Notification) => {
    const href = destinationFor(n);
    if (!n.is_read) void markRead(n.id);
    if (href) {
      navigate(href);
      onClose();
    }
  };

  const items = notifications ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 className="font-semibold text-slate-900">Notifications</h2>
        <div className="flex items-center gap-1">
          {items.length > 0 ? (
            <Button label="Mark all read" variant="ghost" size="sm" clickAction={markAllRead} />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="rounded-lg p-1.5 hover:bg-slate-100"
          >
            <X className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => <Skeleton key={i} height={64} index={i} />)}
          </div>
        ) : isError ? (
          <ErrorState title="Notifications didn't load" error={error} onRetry={() => void refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing unread" description="You're up to date." icon={BellOff} />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map(n => {
              const href = destinationFor(n);
              return (
                <li key={n.id}>
                  {/* A card that leads somewhere. Notifications used to name a
                      reference number and stop there. */}
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-slate-200 hover:bg-slate-100"
                  >
                    <div className="font-medium text-slate-900">{n.title}</div>
                    {n.content ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{n.content}</p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs">
                      <span className="font-medium uppercase tracking-wide text-slate-400">
                        {n.source_module}
                      </span>
                      <span className="text-sky-700">{href ? 'Open →' : 'Mark read'}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
