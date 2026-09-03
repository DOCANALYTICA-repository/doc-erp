import React from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';

import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { ClaimStatusStepper } from '../components/ClaimStatusStepper';
import { useClaimsWorkspace } from '../ClaimsContext';

export const OverviewTab: React.FC = () => {
  const { claims } = useClaimsWorkspace();

  const cards = [
    { title: 'Total submissions', count: claims.length, icon: FileText, tone: 'text-slate-400' },
    {
      title: 'Approved',
      count: claims.filter(c => c.status === 'approved' || c.status === 'closed').length,
      icon: CheckCircle, tone: 'text-emerald-500',
    },
    {
      title: 'Pending review',
      count: claims.filter(c => c.status === 'submitted' || c.status === 'under_review').length,
      icon: Clock, tone: 'text-amber-500',
    },
    {
      title: 'Needs your action',
      count: claims.filter(c => c.status === 'returned').length,
      icon: AlertTriangle, tone: 'text-rose-500',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.title} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <div className="text-sm font-medium text-slate-500">{card.title}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{card.count}</div>
            </div>
            <card.icon className={`h-7 w-7 ${card.tone}`} aria-hidden="true" />
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Latest submissions" />
        <div className="mt-4 flex flex-col gap-3">
          {claims.length === 0 ? (
            <EmptyState
              title="No claims submitted yet"
              description="A claim records the classes you missed and why, and routes it for approval."
              icon={FileText}
            />
          ) : (
            claims.slice(0, 3).map(claim => (
              <div key={claim.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{claim.reference_number}</span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium uppercase text-slate-600">
                      {claim.category}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{claim.date_range}</p>
                </div>
                <ClaimStatusStepper
                  status={claim.status as never}
                  currentStage={claim.current_workflow_stage as never}
                  submissionType={claim.submission_type as never}
                  referenceNumber={claim.reference_number}
                  revisionReason={claim.revision_reason}
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
