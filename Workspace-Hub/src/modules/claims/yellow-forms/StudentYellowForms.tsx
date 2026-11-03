import React from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2 } from 'lucide-react';

import { useMyClubs, useMyYellowForms } from '../../../api/hooks';
import { DataTable } from '../../../components/ui/DataTable';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import {
  ClaimSheetStepper,
  Notice,
  PreApprovalStepper,
  YellowFormStatusChip,
  formatDateRange,
} from '../../yellow-forms';
import { OpenFormButton } from './parts';
import { useOpenParam } from './useOpenParam';
import { YellowFormDrawer } from './YellowFormDrawer';

/**
 * The yellow forms a student is listed on, read-only. Clubs file them; the
 * student's part is to see that their name is on the list and where it is.
 * Club leaders reach this page from notifications too, so it points at each
 * of the student's clubs, where the club's forms are filed.
 */
export const StudentYellowForms: React.FC = () => {
  const { openId, open, close } = useOpenParam();
  const mine = useMyYellowForms();
  const clubs = useMyClubs().data ?? [];

  const forms = mine.data?.pre_approvals ?? [];
  const sheets = mine.data?.claim_sheets ?? [];
  const drawer = (
    <YellowFormDrawer
      openId={openId}
      onOpen={open}
      onClose={close}
      lists={mine.data ? [mine.data] : []}
      allowReview={false}
    />
  );

  let content: React.ReactNode;
  if (mine.isLoading) {
    content = <PageSkeleton variant="table" label="Loading your yellow forms" />;
  } else if (mine.isError) {
    content = <ErrorState title="Your yellow forms didn't load" error={mine.error} onRetry={() => void mine.refetch()} />;
  } else if (forms.length === 0 && sheets.length === 0) {
    content = (
      <EmptyState
        title="You're not on any yellow forms yet"
        description="When your club lists you on a pre-approval and submits it, it appears here."
        icon={FileCheck2}
      />
    );
  } else {
    content = (
      <>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Pre-approvals you're on" />
          <DataTable
            caption="Pre-approvals that list you"
            rows={forms}
            getRowKey={form => form.id}
            emptyState={<p className="text-sm text-secondary">None yet.</p>}
            columns={[
              {
                key: 'event',
                header: 'Event',
                render: form => (
                  <OpenFormButton label={form.event_name} detail={form.club_name} onOpen={() => open(form.id)} />
                ),
              },
              {
                key: 'dates',
                header: 'Event dates',
                secondary: true,
                render: form => (
                  <span className="whitespace-nowrap">{formatDateRange(form.event_start_date, form.event_end_date)}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: form => (
                  <div className="flex flex-col items-start gap-1.5">
                    <YellowFormStatusChip status={form.status} label={form.status_label} isExpired={form.is_expired} />
                    <PreApprovalStepper form={form} />
                  </div>
                ),
              },
            ]}
          />
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Claim sheets you're on" />
          <DataTable
            caption="Claim sheets that list you"
            rows={sheets}
            getRowKey={sheet => sheet.id}
            emptyState={
              <p className="text-sm text-secondary">
                None yet. Your club files the claim sheet once a pre-approved event is over.
              </p>
            }
            columns={[
              {
                key: 'event',
                header: 'Event',
                render: sheet => (
                  <OpenFormButton label={sheet.event_name} detail={sheet.club_name} onOpen={() => open(sheet.id)} />
                ),
              },
              {
                key: 'reference',
                header: 'Reference',
                secondary: true,
                render: sheet => <span className="whitespace-nowrap">{sheet.reference_number}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: sheet => (
                  <div className="flex flex-col items-start gap-1.5">
                    <YellowFormStatusChip status={sheet.status} label={sheet.status_label} />
                    <ClaimSheetStepper sheet={sheet} />
                  </div>
                ),
              },
            ]}
          />
        </section>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Notice tone="info" title="Clubs file yellow forms">
        Before an event, your club gets the students who will miss class pre-approved by its Faculty
        Coordinator and the Associate HOD. Afterwards it files a claim sheet with each student's
        attendance for the Claims Coordinator. Forms that list you appear here. Individual yellow forms
        are coming in a future release.
        {clubs.length > 0 ? (
          <p className="mt-2">
            Club leaders file and track all of a club&apos;s forms from its Yellow Forms tab:{' '}
            {clubs.map((club, index) => (
              <React.Fragment key={club.id}>
                {index > 0 ? ', ' : ''}
                <Link
                  to={`/app/clubs/yellow-forms?club=${encodeURIComponent(club.id)}`}
                  className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {club.name}
                </Link>
              </React.Fragment>
            ))}
            .
          </p>
        ) : null}
      </Notice>
      {content}
      {drawer}
    </div>
  );
};
