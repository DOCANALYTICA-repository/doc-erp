import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Award } from 'lucide-react';

import { useClubAnnualPlans, usePlanReviewInvalidator } from '../../../api/hooks';
import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { clubKeys } from '../../../lib/queryKeys';
import { useStore } from '../../../context/useStore';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { AnnualPlan } from '../../../api/types';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const CURRENT_ACADEMIC_YEAR = '2025-2026';

/** Mirrors backend/app/api/v1/endpoints/clubs.py::ANNUAL_PLAN_STAGE_PERMISSIONS. */
const STAGE_PERMISSIONS: Record<string, string> = {
  faculty_coordinator_review: 'clubs:approve_plan_faculty_coordinator',
  cultural_coordinator_review: 'clubs:approve_plan_cultural_coordinator',
  hod_review: 'clubs:approve_plan_hod',
};

const STAGES = [
  'draft', 'faculty_coordinator_review', 'cultural_coordinator_review',
  'hod_review', 'approved', 'locked',
];

const STAGE_LABEL: Record<string, string> = {
  draft: 'Draft',
  faculty_coordinator_review: 'Faculty Coordinator',
  cultural_coordinator_review: 'Cultural Coordinator',
  hod_review: 'HOD',
  approved: 'Approved',
  locked: 'Locked',
};

function PlanTimeline({ status }: { status: string }) {
  const current = STAGES.indexOf(status);
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Approval progress">
      {STAGES.map((stage, idx) => (
        <li key={stage} className="flex-1">
          <div
            className={`h-1.5 rounded-full ${idx <= current ? 'bg-emerald-500' : 'bg-slate-200'}`}
            title={STAGE_LABEL[stage]}
          />
          <span className="sr-only">
            {STAGE_LABEL[stage]}: {idx < current ? 'complete' : idx === current ? 'current' : 'not started'}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const AnnualPlanTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const { data: plans, isLoading, isError, error, refetch } = useClubAnnualPlans(clubId);
  const hasPermission = useStore(s => s.hasPermission);
  const showToast = useToast();
  const queryClient = useQueryClient();
  const invalidatePlanReview = usePlanReviewInvalidator();

  const [isOpen, setIsOpen] = React.useState(false);
  const [vision, setVision] = React.useState('');
  const [objectives, setObjectives] = React.useState('');
  const [budget, setBudget] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'annual-plans') });
    invalidatePlanReview(clubId);
    refreshShell();
  };

  const act = async (planId: string, run: () => Promise<unknown>, success: string) => {
    setBusyId(planId);
    try {
      await run();
      showToast({ body: success, type: 'info' });
      refresh();
    } catch (e) {
      // These four actions previously had no catch at all — a coordinator who
      // was not scoped for the club saw the spinner stop and nothing else.
      showToast({ body: describeError(e), type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const createPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/clubs/${clubId}/annual-plans`, {
        academic_year: CURRENT_ACADEMIC_YEAR,
        vision, objectives, budget_allocation: Number(budget) || 0,
      });
      setVision(''); setObjectives(''); setBudget(''); setIsOpen(false);
      showToast({ body: 'Draft plan saved.', type: 'info' });
      refresh();
    } catch (err) {
      showToast({ body: `Could not save the plan: ${describeError(err)}`, type: 'error' });
    }
  };

  if (isLoading) return <PageLoader label="Loading annual plans..." />;
  if (isError) return <ErrorState title="Annual plans didn't load" error={error} onRetry={() => void refetch()} />;

  const canReview = (plan: AnnualPlan) => {
    const needed = STAGE_PERMISSIONS[plan.status];
    return Boolean(needed) && hasPermission(needed);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Annual planning"
        description="Draft → Faculty Coordinator → Cultural Coordinator → HOD → approved."
        action={
          bootstrap.capabilities.can_write ? (
            <Button label="New annual plan" variant="primary" size="sm" clickAction={() => setIsOpen(o => !o)} />
          ) : null
        }
      />

      {isOpen ? (
        <form onSubmit={createPlan} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
          <label className="font-medium text-slate-600" htmlFor="plan-vision">Vision</label>
          <textarea id="plan-vision" required rows={2} value={vision} onChange={e => setVision(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <label className="font-medium text-slate-600" htmlFor="plan-objectives">Objectives</label>
          <textarea id="plan-objectives" rows={2} value={objectives} onChange={e => setObjectives(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <label className="font-medium text-slate-600" htmlFor="plan-budget">Budget allocation (Rs)</label>
          <input id="plan-budget" type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" />
          <div>
            <Button label={`Save as draft (${CURRENT_ACADEMIC_YEAR})`} variant="primary" type="submit" />
          </div>
        </form>
      ) : null}

      {plans && plans.length === 0 ? (
        <EmptyState
          title="No annual plan yet"
          description="A plan sets out the club's vision, objectives and budget for the year."
          icon={Award}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {plans?.map(plan => (
            <article key={plan.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">Academic year {plan.academic_year}</h3>
                <StatusChip status={plan.status} />
              </div>

              <PlanTimeline status={plan.status} />

              {plan.vision ? (
                <p className="mt-4 text-sm leading-relaxed text-slate-600">{plan.vision}</p>
              ) : null}

              {plan.review_comments ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Reviewer comment: {plan.review_comments}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {plan.status === 'draft' && bootstrap.capabilities.can_write ? (
                  <Button
                    label="Submit for review" variant="primary" size="sm"
                    isDisabled={busyId === plan.id}
                    clickAction={() => act(plan.id, () => api.post(`/clubs/annual-plans/${plan.id}/submit`, {}), 'Plan submitted for review.')}
                  />
                ) : null}

                {canReview(plan) ? (
                  <>
                    <Button
                      label="Approve" variant="primary" size="sm"
                      isDisabled={busyId === plan.id}
                      clickAction={() => act(plan.id, () => api.post(`/clubs/annual-plans/${plan.id}/review`, { action: 'approve' }), 'Plan approved and moved to the next stage.')}
                    />
                    <Button
                      label="Reject" variant="destructive" size="sm"
                      isDisabled={busyId === plan.id}
                      clickAction={() => setRejectingId(rejectingId === plan.id ? null : plan.id)}
                    />
                  </>
                ) : null}

                {plan.status === 'approved' && bootstrap.capabilities.can_manage_settings ? (
                  <Button
                    label="Lock plan" variant="secondary" size="sm"
                    isDisabled={busyId === plan.id}
                    clickAction={() => act(plan.id, () => api.post(`/clubs/annual-plans/${plan.id}/lock`, {}), 'Plan locked.')}
                  />
                ) : null}
              </div>

              {rejectingId === plan.id ? (
                <div className="mt-4 flex flex-col gap-2 rounded-lg bg-slate-50 p-4">
                  {/* Rejection previously sent a hardcoded "Please revise." with
                      no way for the reviewer to say what was actually wrong. */}
                  <label className="text-sm font-medium text-slate-600" htmlFor={`reject-${plan.id}`}>
                    Why is this being sent back? (shown to the club)
                  </label>
                  <textarea
                    id={`reject-${plan.id}`} rows={2} value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <div>
                    <Button
                      label="Send back to draft" variant="destructive" size="sm"
                      isDisabled={busyId === plan.id || !rejectReason.trim()}
                      clickAction={() => act(
                        plan.id,
                        () => api.post(`/clubs/annual-plans/${plan.id}/review`, { action: 'reject', comments: rejectReason }),
                        'Plan returned to the club.',
                      ).then(() => { setRejectingId(null); setRejectReason(''); })}
                    />
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
