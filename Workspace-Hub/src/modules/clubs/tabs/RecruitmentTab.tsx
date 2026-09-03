import React from 'react';
import { UserPlus } from 'lucide-react';

import { useClubRecruitmentDrives } from '../../../api/hooks';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageLoader } from '../../../components/ui/PageLoader';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const RecruitmentTab: React.FC = () => {
  const { clubId } = useClubWorkspace();
  const { data: drives, isLoading, isError, error, refetch } = useClubRecruitmentDrives(clubId);

  if (isLoading) return <PageLoader label="Loading recruitment drives..." />;
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
            <article key={drive.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <StatusChip status={drive.status} />
                <span className="text-sm text-slate-500">{drive.recruitment_period}</span>
              </div>
              <h3 className="mt-3 font-semibold text-slate-900">{drive.title}</h3>
              {drive.eligibility ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{drive.eligibility}</p>
              ) : null}
              {drive.positions_available ? (
                <p className="mt-3 text-sm text-slate-400">
                  Positions available: {drive.positions_available}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
