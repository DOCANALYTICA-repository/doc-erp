import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Award, CalendarClock, CheckCircle2, ClipboardList,
  Compass, FileText, FolderOpen, Receipt,
} from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { useActionQueue } from '../../api/hooks';
import type { ActionItem, ActionKind, Urgency } from '../../api/types';
import { useStore } from '../../context/useStore';
import { api } from '../../services/api';
import { describeError } from '../../services/errors';
import { platformKeys } from '../../lib/queryKeys';
import { PageLoader } from '../../components/ui/PageLoader';

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
};

const KIND_LABEL: Record<ActionKind, string> = {
  claim_review: 'Claim',
  annual_plan_review: 'Annual plan',
  task_due: 'Task',
  meeting_without_minutes: 'Meeting',
  reimbursement_review: 'Reimbursement',
};

const URGENCY_STYLE: Record<Urgency, { dot: string; label: string; text: string }> = {
  overdue: { dot: 'bg-rose-500', label: 'Overdue', text: 'text-rose-700' },
  today: { dot: 'bg-amber-500', label: 'Due today', text: 'text-amber-700' },
  soon: { dot: 'bg-sky-500', label: 'Due soon', text: 'text-sky-700' },
  normal: { dot: 'bg-slate-300', label: '', text: 'text-slate-500' },
};

const MODULES = [
  { id: 'clubs', title: 'Clubs', icon: Award, perm: 'clubs:view' },
  { id: 'claims', title: 'Claims', icon: Compass, perm: 'claims:view_own' },
  { id: 'faculty', title: 'Faculty workspace', icon: FolderOpen, perm: 'faculty:dashboard' },
];

function ActionCard({ item, onApprove, isBusy }: {
  item: ActionItem;
  onApprove: (item: ActionItem) => void;
  isBusy: boolean;
}) {
  const Icon = KIND_ICON[item.kind];
  const urgency = URGENCY_STYLE[item.urgency];

  return (
    <li className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100">
        <Icon className="h-4 w-4 text-slate-600" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {KIND_LABEL[item.kind]}
          </span>
          {urgency.label ? (
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${urgency.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} aria-hidden="true" />
              {urgency.label}
            </span>
          ) : null}
        </div>

        {/* The whole card is addressable: entity_type/entity_id exist on the
            server precisely so this can be a link rather than prose naming a
            reference number and leaving the user to go looking. */}
        <Link to={item.href} className="mt-1 block font-medium text-slate-900 hover:underline">
          {item.title}
        </Link>
        {item.subtitle ? (
          <p className="mt-0.5 truncate text-sm text-slate-500">{item.subtitle}</p>
        ) : null}
        {item.due_date ? (
          <p className="mt-1 text-xs text-slate-400">Due {item.due_date}</p>
        ) : null}
      </div>

      {item.can_approve_inline ? (
        <Button
          label="Approve"
          variant="secondary"
          size="sm"
          isDisabled={isBusy}
          clickAction={() => onApprove(item)}
        />
      ) : null}
    </li>
  );
}

export const Inbox: React.FC = () => {
  const user = useStore(s => s.user);
  const hasPermission = useStore(s => s.hasPermission);
  const navigate = useNavigate();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = React.useState<string | null>(null);

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

  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <header className="border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {items.length > 0 ? 'Waiting on you' : `Good to see you, ${user.name.split(' ')[0]}`}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {items.length > 0
            ? `${items.length} ${items.length === 1 ? 'item needs' : 'items need'} your attention, most urgent first.`
            : 'Nothing needs your attention right now.'}
        </p>
      </header>

      <section className="py-6">
        {isLoading ? (
          <PageLoader label="Checking what needs you..." />
        ) : isError ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
              <h2 className="font-semibold text-rose-900">Couldn't load your queue</h2>
            </div>
            <p className="text-sm text-rose-800">{describeError(error)}</p>
            <Button label="Try again" variant="secondary" clickAction={() => { void refetch(); }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
            <p className="font-medium text-slate-900">You're all caught up</p>
            <p className="max-w-sm text-sm text-slate-500">
              Approvals, claims awaiting your review and tasks coming due will appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map(item => (
              <ActionCard
                key={item.id}
                item={item}
                onApprove={approve}
                isBusy={busyId === item.id}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-slate-200 pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Browse</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {MODULES.filter(m => hasPermission(m.perm)).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(`/app/${m.id}`)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900"
            >
              <m.icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {m.title}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
