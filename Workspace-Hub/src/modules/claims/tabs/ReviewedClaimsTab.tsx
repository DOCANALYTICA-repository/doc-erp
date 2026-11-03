import React from 'react';
import { CheckCircle2 } from 'lucide-react';

import { EmptyState } from '../../../components/ui/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { ClaimStatusStepper } from '../components/ClaimStatusStepper';
import { ClaimDetailDrawer, ClaimReferenceButton } from '../components/ClaimDetailDrawer';
import { PendingApprovals } from '../components/PendingApprovals';
import { useClaimsWorkspace } from '../ClaimsContext';
import { PagedFooter } from '../../../components/ui/PagedFooter';
import { DataTable } from '../../../components/ui/DataTable';

/**
 * What this reviewer has already decided — read-only, by definition.
 *
 * The review queue used to hold these too, so a claim a reviewer had signed
 * last week sat beside the ones waiting on them with nothing but the stage
 * column to tell them apart, and the queue grew all semester. Splitting them
 * makes "Review Queue" mean exactly one thing: claims your decision is
 * holding up.
 *
 * Both outcomes live here on purpose. A claim that is fully approved and one
 * that has merely moved to the next desk are the same fact from this
 * reviewer's side — they have signed it — and which desk it is on now is
 * shown in the row rather than being the thing that hides it.
 */
export const ReviewedClaimsTab: React.FC = () => {
  const { claims, totalClaims, page, pageSize, setPage } = useClaimsWorkspace();
  const [viewingId, setViewingId] = React.useState<string | null>(null);

  if (claims.length === 0) {
    return (
      <EmptyState
        title="You haven't actioned any claims yet"
        description="Claims you approve, return or reject move here from your review queue."
        icon={CheckCircle2}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Approved & actioned"
        description={`${totalClaims} claim${totalClaims === 1 ? '' : 's'} you have decided`}
      />

      <DataTable
        caption="Claims you have already decided"
        rows={claims}
        getRowKey={claim => claim.id}
        columns={[
          {
            key: 'reference',
            header: 'Reference',
            render: claim => (
              <ClaimReferenceButton
                reference={claim.reference_number}
                onOpen={() => setViewingId(claim.id)}
              />
            ),
          },
          {
            key: 'student',
            header: 'Student',
            secondary: true,
            render: claim => claim.submitter_name ?? claim.submitted_by,
          },
          {
            key: 'dates',
            header: 'Dates',
            secondary: true,
            render: claim => claim.date_range,
          },
          {
            key: 'status',
            header: 'Status',
            render: claim => (
              <ClaimStatusStepper
                status={claim.status as never}
                currentStage={claim.current_workflow_stage as never}
                submissionType={claim.submission_type as never}
                referenceNumber={claim.reference_number}
                revisionReason={claim.revision_reason}
                lastRevisedStage={claim.last_revised_stage}
                pendingApprovals={claim.pending_approvals}
              />
            ),
          },
          {
            key: 'waiting_on',
            header: 'Now with',
            secondary: true,
            render: claim => (
              <span className="block max-w-[14rem] text-sm">
                <PendingApprovals pending={claim.pending_approvals ?? []} variant="inline" />
              </span>
            ),
          },
        ]}
      />

      <ClaimDetailDrawer
        claim={claims.find(c => c.id === viewingId)}
        onClose={() => setViewingId(null)}
      />

      <PagedFooter
        page={page}
        pageSize={pageSize}
        total={totalClaims}
        onChange={setPage}
        label="Actioned claims pages"
      />
    </div>
  );
};
