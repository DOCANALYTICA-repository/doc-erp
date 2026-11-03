import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

import { usePipeline } from '../../api/hooks';
import type { PipelineItem, PipelineStage } from '../../api/types';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/PageSkeleton';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { PageShell } from '../../components/ui/PageShell';
import { PageHeader } from '../../components/ui/PageHeader';

/**
 * Both workflows, every stage, and how long things have been sitting there.
 *
 * The claim state machine and the annual-plan state machine both worked, and
 * neither was visible in aggregate: you could ask how ONE claim was doing, and
 * nothing could tell you that six had been at subject-faculty review for a
 * fortnight. That is the difference between a workflow that runs and a
 * workflow a department can manage.
 */

const ItemRow: React.FC<{ item: PipelineItem }> = ({ item }) => (
  <li className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
    <div className="min-w-0">
      <Link to={item.href} className="block truncate text-sm font-medium text-primary hover:underline">
        {item.title}
      </Link>
      <p className="mt-0.5 truncate text-xs text-secondary">
        {item.reference}
        {item.owner ? ` · ${item.owner}` : ''} · waiting on {item.waiting_on}
      </p>
    </div>
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
        item.is_breaching_sla ? 'bg-error-muted text-error' : 'bg-muted text-secondary'
      }`}
      title={`SLA for this stage is ${item.sla_days} day${item.sla_days === 1 ? '' : 's'}`}
    >
      {item.days_waiting}d
    </span>
  </li>
);

const StageColumn: React.FC<{ stage: PipelineStage }> = ({ stage }) => {
  const items = stage.items ?? [];
  return (
    <Card as="section" padding="sm" className="flex min-w-[260px] flex-1 flex-col">
      <header className="flex items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <h3 className="text-sm font-semibold text-primary">{stage.label}</h3>
          <p className="mt-0.5 text-xs text-secondary">
            {stage.count} item{stage.count === 1 ? '' : 's'}
            {/* The number that a count alone hides: a stage with a healthy
                median and one item stuck for three weeks looks fine. */}
            {stage.count > 0 ? ` · oldest ${stage.oldest_days}d` : ''}
          </p>
        </div>
        {stage.breaching > 0 ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-error-muted px-2 py-0.5 text-xs font-semibold text-error">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {stage.breaching}
          </span>
        ) : null}
      </header>

      {items.length === 0 ? (
        // Deliberately a short muted line, not `EmptyState`: that renders a
        // large dashed panel, and five of them side by side in a stage board
        // would shout about the stages that are FINE.
        <p className="py-6 text-center text-sm text-secondary">Nothing waiting</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {items.map(item => <ItemRow key={`${item.kind}-${item.id}`} item={item} />)}
        </ul>
      )}
    </Card>
  );
};

export const PipelineBoard: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = usePipeline();

  if (isLoading) return <PageSkeleton variant="list" label="Reading the pipeline" />;
  if (isError || !data) {
    return (
      <div className="p-8">
        <ErrorState title="The pipeline didn't load" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const claimStages = data.stages.filter(s =>
    ['initial_review', 'subject_faculty', 'course_coordinator'].includes(s.id),
  );
  // Stage ids are prefixed by the server so they cannot collide with the plan stages.
  const yellowFormStages = data.stages.filter(
    s => s.id.startsWith('pre_approval_') || s.id.startsWith('claim_sheet_'),
  );
  const planStages = data.stages.filter(
    s => s.id.endsWith('_review') && !claimStages.includes(s) && !yellowFormStages.includes(s),
  );
  const escalations = data.escalations ?? [];

  return (
    <PageShell maxWidth="6xl">
      {/*
        * PageHeader, not SectionHeader. This screen used to open at h2 — its
        * document outline began at level 2 with nothing above it, and the two
        * `<h2>`s further down competed with the page title for the same rank.
        */}
      <PageHeader
        title="Workflow pipeline"
        description={`${data.total} item${data.total === 1 ? '' : 's'} in flight across claims, yellow forms and annual plans.`}
      />

      {escalations.length > 0 ? (
        <section className="mt-6 rounded-lg border border-error/25 bg-error-muted p-5">
          <h2 className="flex items-center gap-2 font-semibold text-error">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {escalations.length} past their service level
          </h2>
          <p className="mt-1 text-sm text-error">
            Oldest first. These are the ones somebody is waiting on.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {escalations.slice(0, 8).map(item => (
              <li key={`esc-${item.kind}-${item.id}`} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link to={item.href} className="text-sm font-medium text-error hover:underline">
                  {item.title}
                </Link>
                <span className="text-sm text-error">
                  {item.days_waiting} days at {item.stage_label} · waiting on {item.waiting_on}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-success/25 bg-success-muted px-5 py-4">
          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          <p className="text-sm text-success">
            Nothing is past its service level.
          </p>
        </div>
      )}

      <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold text-primary">
        <Clock className="h-4 w-4 text-secondary" aria-hidden="true" /> Attendance claims
      </h2>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
        {claimStages.map(stage => <StageColumn key={stage.id} stage={stage} />)}
      </div>

      {yellowFormStages.length > 0 ? (
        <>
          <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold text-primary">
            <Clock className="h-4 w-4 text-secondary" aria-hidden="true" /> Yellow forms
          </h2>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {yellowFormStages.map(stage => <StageColumn key={stage.id} stage={stage} />)}
          </div>
        </>
      ) : null}

      <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold text-primary">
        <Clock className="h-4 w-4 text-secondary" aria-hidden="true" /> Annual plans
      </h2>
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
        {planStages.map(stage => <StageColumn key={stage.id} stage={stage} />)}
      </div>

      {data.total === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nothing in flight" description="Submitted claims, yellow forms and plans appear here as they move." />
        </div>
      ) : null}
    </PageShell>
  );
};
