import React from 'react';
import { AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';

import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { ClaimStatusStepper } from '../components/ClaimStatusStepper';
import { useClaimsWorkspace } from '../ClaimsContext';

export const OverviewTab: React.FC = () => {
  const { claims } = useClaimsWorkspace();

  const cards = [
    { title: 'Total submissions', count: claims.length, icon: FileText, tone: 'text-secondary' },
    {
      title: 'Approved',
      count: claims.filter(c => c.status === 'approved' || c.status === 'closed').length,
      icon: CheckCircle, tone: 'text-success',
    },
    {
      title: 'Pending review',
      count: claims.filter(c => c.status === 'submitted' || c.status === 'under_review').length,
      icon: Clock, tone: 'text-warning',
    },
    {
      title: 'Needs your action',
      count: claims.filter(c => c.status === 'returned').length,
      icon: AlertTriangle, tone: 'text-error',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(card => (
          <Card padding="md" className="flex items-center justify-between" key={card.title}>
            <div>
              <div className="text-sm font-medium text-secondary">{card.title}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-primary">{card.count}</div>
            </div>
            <card.icon className={`h-7 w-7 ${card.tone}`} aria-hidden="true" />
          </Card>
        ))}
      </div>

      <Card as="section">
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
              <div key={claim.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-body p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-primary">{claim.reference_number}</span>
                    <span className="rounded bg-sand-300 px-1.5 py-0.5 text-xs font-medium uppercase text-secondary">
                      {claim.category}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-secondary">{claim.date_range}</p>
                </div>
                <ClaimStatusStepper
                  status={claim.status as never}
                  currentStage={claim.current_workflow_stage as never}
                  submissionType={claim.submission_type as never}
                  referenceNumber={claim.reference_number}
                  revisionReason={claim.revision_reason}
                  lastRevisedStage={claim.last_revised_stage}
                />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
