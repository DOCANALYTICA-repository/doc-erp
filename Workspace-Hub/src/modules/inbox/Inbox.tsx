import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Award, CalendarCheck, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList,
  FileSpreadsheet, FileText, Receipt, Undo2,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { useActionQueue } from '../../api/hooks';
import type { ActionItem, ActionKind, Urgency } from '../../api/types';
import { useStore } from '../../context/useStore';
import { api } from '../../services/api';
import { describeError } from '../../services/errors';
import { platformKeys } from '../../lib/queryKeys';
import { MODULES } from '../../lib/navigation';
import { PageLoader } from '../../components/ui/PageLoader';
import { PageShell } from '../../components/ui/PageShell';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSkeleton } from '../../components/ui/PageSkeleton';
import { FilterChips } from '../../components/ui/FilterChips';
import { ListRow } from '../../components/ui/ListRow';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';

/**
 * One inbox instead of three workspaces.
 *
 * Nobody logs in wanting "the Clubs module" — they log in because something
 * needs them. The three-card launcher this replaces asked the user to guess
 * which module their work was hiding in, which is the deeper reason the
 * Faculty Coordinator never approved his club's annual plan: not that he
 * couldn't navigate to it, but that nothing ever told him it was there.
 *
 * The modules are still one click away; they are now where you BROWSE, not
 * where you find out what needs doing.
 */

const KIND_ICON: Record<ActionKind, React.ComponentType<{ className?: string }>> = {
  claim_review: FileText,
  annual_plan_review: Award,
  task_due: ClipboardList,
  meeting_without_minutes: CalendarClock,
  reimbursement_review: Receipt,
  pre_approval_review: ClipboardCheck,
  claim_sheet_review: FileSpreadsheet,
  claim_sheet_due: CalendarCheck,
  yellow_form_returned: Undo2,
};

const KIND_LABEL: Record<ActionKind, string> = {
  claim_review: 'Claim',
  annual_plan_review: 'Annual plan',
  task_due: 'Task',
  meeting_without_minutes: 'Meeting',
  reimbursement_review: 'Reimbursement',
  pre_approval_review: 'Pre-approval',
  claim_sheet_review: 'Claim sheet',
  claim_sheet_due: 'Claim sheet due',
  yellow_form_returned: 'Yellow form returned',
};

/**
 * How urgent an item is, in the semantic colours.
 *
 * `normal` has no label on purpose: every row would otherwise carry a chip
 * saying nothing, and the point of the colour is to make the two or three
 * urgent rows stand out from the rest.
 */
const URGENCY_STYLE: Record<Urgency, { dot: string; label: string; text: string }> = {
  overdue: { dot: 'bg-error', label: 'Overdue', text: 'text-error' },
  today: { dot: 'bg-warning', label: 'Due today', text: 'text-warning' },
  soon: { dot: 'bg-accent', label: 'Due soon', text: 'text-accent' },
  normal: { dot: 'bg-sand-400', label: '', text: 'text-secondary' },
};

/**
 * One queue item, on the shared `ListRow`.
 *
 * This was a bespoke `ActionCard` — the third parallel implementation of
 * "icon, label, title, meta, trailing action" in the codebase. Everything it
 * needed turned out to be a `ListRow` slot already: the icon is `leading`, the
 * kind and urgency are `eyebrow`, and Approve is `action`. Only `as="li"` had
 * to be added to `ListRow`, so the `<ul>` keeps real list semantics.
 */
function ActionRow({ item, onApprove, isBusy }: {
  item: ActionItem;
  onApprove: (item: ActionItem) => void;
  isBusy: boolean;
}) {
  // parseActionQueue accepts any kind string, so a newer backend's kind must not crash the row.
  const Icon = KIND_ICON[item.kind] ?? ClipboardList;
  const urgency = URGENCY_STYLE[item.urgency];

  return (
    <ListRow
      as="li"
      // `href` makes the title a real link. entity_type/entity_id exist on the
      // server precisely so this can lead somewhere, rather than naming a
      // reference number and leaving the user to go looking.
      href={item.href}
      leading={
        <span className="grid h-9 w-9 place-items-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-secondary" aria-hidden="true" />
        </span>
      }
      eyebrow={
        <span className="flex flex-wrap items-center gap-2">
          {KIND_LABEL[item.kind] ?? 'To do'}
          {urgency.label ? (
            <span className={`inline-flex items-center gap-1.5 normal-case ${urgency.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} aria-hidden="true" />
              {urgency.label}
            </span>
          ) : null}
        </span>
      }
      title={item.title}
      meta={
        item.subtitle || item.due_date ? (
          <span className="flex flex-col">
            {item.subtitle ? <span>{item.subtitle}</span> : null}
            {item.due_date ? (
              <span className="text-xs text-secondary">Due {item.due_date}</span>
            ) : null}
          </span>
        ) : null
      }
      action={
        item.can_approve_inline ? (
          <Button
            label="Approve"
            variant="secondary"
            size="sm"
            isDisabled={isBusy}
            clickAction={() => onApprove(item)}
          />
        ) : null
      }
    />
  );
}

export const Inbox: React.FC = () => {
  const user = useStore(s => s.user);
  const hasPermission = useStore(s => s.hasPermission);
  const navigate = useNavigate();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // 'all' plus any ActionKind. Local state, not a URL param: this is a
  // transient view filter, and putting it in the URL would make Back undo it.
  const [kindFilter, setKindFilter] = React.useState<ActionKind | 'all'>('all');

  const { data, isLoading, isError, error, refetch } = useActionQueue();

  if (!user) return <PageLoader label="Loading your workspace..." />;

  const approve = async (item: ActionItem) => {
    if (!item.approve_href) return;
    setBusyId(item.id);
    try {
      // Annual plans take a body; the claims stage endpoint takes query params.
      if (item.kind === 'annual_plan_review') {
        await api.post(item.approve_href, { action: 'approve', comments: 'Approved from inbox.' });
      } else {
        await api.post(item.approve_href, {});
      }
      showToast({ body: `Approved: ${item.title}`, type: 'info' });
      queryClient.invalidateQueries({ queryKey: platformKeys.actionQueue });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    } catch (e) {
      showToast({ body: `Could not approve this: ${describeError(e)}`, type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const allItems = data?.items ?? [];

  /*
   * Filter chips, per the design canvas.
   *
   * The queue is already sorted most-urgent-first by the server, which is the
   * right default. What it could not do before was answer "just show me the
   * claims" — with a dozen mixed items, finding the one type you have time for
   * meant reading all of them.
   *
   * `FilterChips`, not `TabStrip`: this is a view filter on the current
   * screen, so it must NOT push history. A Back button that undoes a filter
   * instead of leaving the page is the bug that distinction prevents.
   *
   * Counts come from the unfiltered list, so a chip reading "Claim 3" stays
   * truthful whichever chip is active.
   */
  const kindsPresent = Array.from(new Set(allItems.map(i => i.kind)));
  const chips = [
    { id: 'all' as const, label: 'All', count: allItems.length },
    ...kindsPresent.map(kind => ({
      id: kind,
      label: KIND_LABEL[kind] ?? 'To do',
      count: allItems.filter(i => i.kind === kind).length,
    })),
  ];
  const items = kindFilter === 'all' ? allItems : allItems.filter(i => i.kind === kindFilter);

  const firstName = user.name.split(' ')[0];

  return (
    <PageShell maxWidth="5xl">
      <PageHeader
        title={allItems.length > 0 ? 'Waiting on you' : `Good to see you, ${firstName}`}
        description={
          allItems.length > 0
            ? `${allItems.length} ${allItems.length === 1 ? 'item needs' : 'items need'} your attention, most urgent first.`
            : 'Nothing needs your attention right now.'
        }
      />

      <section aria-label="Your action queue">
        {isLoading ? (
          <PageSkeleton variant="list" label="Checking what needs you" />
        ) : isError ? (
          <ErrorState
            title="Couldn't load your queue"
            error={error}
            onRetry={() => void refetch()}
          />
        ) : allItems.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            description="Approvals, claims awaiting your review and tasks coming due will appear here."
            icon={CheckCircle2}
          />
        ) : (
          <>
            {/* Only worth showing when there is more than one type to choose
                between — a single chip labelled "All" is noise. */}
            {chips.length > 2 ? (
              <div className="mb-5">
                <FilterChips
                  label="Filter by type"
                  items={chips}
                  activeId={kindFilter}
                  onChange={setKindFilter}
                />
              </div>
            ) : null}

            <ul className="flex flex-col gap-3">
              {items.map(item => (
                <ActionRow
                  key={item.id}
                  item={item}
                  onApprove={approve}
                  isBusy={busyId === item.id}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-secondary">Browse</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {MODULES.filter(m => hasPermission(m.permission)).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(m.path)}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-muted"
            >
              <m.icon className="h-4 w-4 text-secondary" aria-hidden="true" />
              {m.label}
            </button>
          ))}
        </div>
      </section>
    </PageShell>
  );
};
