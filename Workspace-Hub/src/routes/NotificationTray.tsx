import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { useToast } from '@astryxdesign/core/Toast';
import { BellOff } from 'lucide-react';

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
export function destinationFor(n: Notification): string | null {
  if (!n.entity_type || !n.entity_id) return null;
  switch (n.entity_type) {
    case 'claim':
      return `/app/claims/my_claims?claim=${n.entity_id}`;
    // No club id on a notification, so Claims opens it for everyone and offers filers the club link.
    case 'pre_approval':
    case 'claim_sheet':
      return `/app/claims/yellow_forms?open=${encodeURIComponent(n.entity_id)}`;
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

  /*
   * Astryx Dialog, replacing a hand-rolled panel.
   *
   * The old tray declared `role="dialog" aria-modal="true"` and then honoured
   * neither: there was no backdrop, so the page behind it stayed clickable
   * while a screen reader was told the rest of the document was inert; and
   * there was no focus trap or focus restore, so Tab walked straight out of
   * the "modal" into the page underneath and never came back.
   *
   * Dialog supplies the backdrop, the focus trap, focus-on-open, focus restore
   * and Escape. `purpose="info"` keeps backdrop-click dismissal, which is what
   * a notification tray should do.
   *
   * `position` pins it to the top-right so it still reads as a tray hanging
   * off the bell, rather than a centred modal — the same affordance, correctly
   * implemented.
   */
  return (
    <Dialog
      isOpen
      onOpenChange={isOpen => {
        if (!isOpen) onClose();
      }}
      purpose="info"
      width={420}
      maxHeight="80vh"
      position={{ top: 72, right: 16 }}
    >
      <DialogHeader
        title="Notifications"
        onOpenChange={(isOpen: boolean) => {
          if (!isOpen) onClose();
        }}
        endContent={
          items.length > 0 ? (
            <Button label="Mark all read" variant="ghost" size="sm" clickAction={markAllRead} />
          ) : null
        }
      />

      <div className="overflow-y-auto p-6">
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
                    className="w-full rounded-lg border border-border bg-body p-4 text-left hover:border-border hover:bg-muted"
                  >
                    <div className="font-medium text-primary">{n.title}</div>
                    {n.content ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-secondary">{n.content}</p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs">
                      <span className="font-medium uppercase tracking-wide text-secondary">
                        {n.source_module}
                      </span>
                      <span className="text-accent">{href ? 'Open →' : 'Mark read'}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
};
