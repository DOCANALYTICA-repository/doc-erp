import React from 'react';
import { UserPlus } from 'lucide-react';

import { useClubRecruitmentDrives } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { Card } from '../../../components/ui/Card';
import { ErrorState } from '../../../components/ui/ErrorState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const RecruitmentTab: React.FC = () => {
  const { clubId } = useClubWorkspace();
  const { data: drives, isLoading, isError, error, refetch } = useClubRecruitmentDrives(clubId);

  if (isLoading) return <PageSkeleton variant="list" label="Loading recruitment drives" />;
  if (isError) return <ErrorState title="Recruitment drives didn't load" error={error} onRetry={() => void refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Recruitment drives" />
      {drives && drives.length === 0 ? (
        <EmptyState
          title="No recruitment drives yet"
          description="Open drives are visible to students outside the club so they can apply."
          icon={UserPlus}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {drives?.map(drive => (
            <Card as="article" padding="md" key={drive.id}>
              <div className="flex items-center justify-between">
                <StatusChip status={drive.status} />
                <span className="text-sm text-secondary">{drive.recruitment_period}</span>
              </div>
              <h3 className="mt-3 font-semibold text-primary">{drive.title}</h3>
              {drive.eligibility ? (
                <p className="mt-2 text-sm leading-relaxed text-secondary">{drive.eligibility}</p>
              ) : null}
              {drive.positions_available ? (
                <p className="mt-3 text-sm text-secondary">
                  Positions available: {drive.positions_available}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
