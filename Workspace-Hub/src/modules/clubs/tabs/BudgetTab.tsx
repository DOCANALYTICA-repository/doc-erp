import React from 'react';
import { Wallet } from 'lucide-react';

import { useClubBudgets } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { useClubWorkspace } from '../ClubWorkspaceContext';

const rupees = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;

export const BudgetTab: React.FC = () => {
  const { clubId } = useClubWorkspace();
  const { data: budgets, isLoading, isError, error, refetch } = useClubBudgets(clubId);

  if (isLoading) return <PageLoader label="Loading budget..." />;
  if (isError) return <ErrorState title="Budget didn't load" error={error} onRetry={() => void refetch()} />;

  const budget = budgets?.[0];
  if (!budget) {
    return (
      <EmptyState
        title="No budget allocated yet"
        description="A budget is allocated per academic year once the annual plan is approved."
        icon={Wallet}
      />
    );
  }

  // Guard the division: an allocation of zero used to render NaN% and a bar of
  // width "NaN%", which the browser silently drops.
  const allocated = budget.allocated_amount || 0;
  const spent = budget.spent_amount || 0;
  const pct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;
  const isOverspent = allocated > 0 && spent > allocated;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={`Academic year ${budget.academic_year}`} />

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex justify-between text-sm font-medium text-slate-500">
          <span>Usage</span>
          <span className={isOverspent ? 'text-rose-600' : undefined}>
            {allocated > 0 ? `${pct}% used` : 'No allocation'}
          </span>
        </div>

        <div
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Budget used"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${isOverspent ? 'bg-rose-500' : 'bg-sky-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 flex justify-between text-sm font-medium text-slate-700">
          <span>Spent: {rupees(spent)}</span>
          <span>Allocated: {rupees(allocated)}</span>
        </div>

        {isOverspent ? (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Spending exceeds the allocation by {rupees(spent - allocated)}.
          </p>
        ) : null}
      </section>
    </div>
  );
};
