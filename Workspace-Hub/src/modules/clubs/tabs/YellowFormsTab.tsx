import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { ClipboardCheck, Plus } from 'lucide-react';

import {
  useClaimSheet,
  useClubClaimSheets,
  useClubPreApprovals,
  usePreApproval,
  useYellowFormWorkflow,
} from '../../../api/hooks';
import type { ClaimSheet, PreApproval } from '../../../api/types';
import { describeError } from '../../../services/errors';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { statusLabelFor, yellowFormKindOf } from '../../yellow-forms';
import { useClubWorkspace } from '../ClubWorkspaceContext';
import { ClaimSheetDrawer } from '../yellow-forms/ClaimSheetDrawer';
import { ClaimSheetEditor } from '../yellow-forms/ClaimSheetEditor';
import { PreApprovalDrawer } from '../yellow-forms/PreApprovalDrawer';
import { PreApprovalEditor } from '../yellow-forms/PreApprovalEditor';
import { ClaimSheetsTable, PreApprovalsTable } from '../yellow-forms/YellowFormTables';

const STEPS = [
  {
    title: 'Pre-approval',
    detail: 'The Faculty Coordinator, then the Associate HOD, approve the event and the students — before the event starts.',
  },
  {
    title: 'Run the event',
    detail: 'Note which periods each student misses on each day.',
  },
  {
    title: 'Claim sheet',
    detail: "Once it's over, file the periods and each student's attendance with and without claims. The Claims Coordinator forwards it to the attendance office.",
  },
] as const;

type Editor =
  | { kind: 'pre_approval'; form: PreApproval | null }
  | { kind: 'claim_sheet'; preApproval: PreApproval }
  | { kind: 'claim_sheet'; sheet: ClaimSheet };

/**
 * Yellow forms: co-curricular attendance claims, filed by the club.
 *
 * A pre-approval (event + students) is signed by the club's Faculty
 * Coordinator and then the Associate HOD before the event starts; after the
 * event the club files one claim sheet against it for the Claims Coordinator.
 *
 * The open record lives in `?open=<id>` (paf_ or ccs_), so the action queue,
 * notifications and emails can deep-link straight to it, and `?club=` is
 * always kept.
 */
export const YellowFormsTab: React.FC = () => {
  const { clubId, bootstrap } = useClubWorkspace();
  const showToast = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const preApprovals = useClubPreApprovals(clubId);
  const claimSheets = useClubClaimSheets(clubId);
  const { data: workflow } = useYellowFormWorkflow();
  const [editor, setEditor] = React.useState<Editor | null>(null);

  const openId = searchParams.get('open');
  const openKind = yellowFormKindOf(openId);

  const setOpen = React.useCallback(
    (id: string | null) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (id) next.set('open', id);
          else next.delete('open');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const hrefFor = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('open', id);
    return `${location.pathname}?${next.toString()}`;
  };

  // A deep link may name a form this list does not hold (another club, or one
  // the list has not refetched yet); fetch that one on its own.
  const listedForm =
    openKind === 'pre_approval' ? preApprovals.data?.find(form => form.id === openId) : undefined;
  const listedSheet =
    openKind === 'claim_sheet' ? claimSheets.data?.find(sheet => sheet.id === openId) : undefined;
  const formDetail = usePreApproval(
    openKind === 'pre_approval' && preApprovals.isSuccess && !listedForm ? openId : null,
  );
  const sheetDetail = useClaimSheet(
    openKind === 'claim_sheet' && claimSheets.isSuccess && !listedSheet ? openId : null,
  );
  const openForm = listedForm ?? formDetail.data;
  const openSheet = listedSheet ?? sheetDetail.data;
  const openError = formDetail.error ?? sheetDetail.error;

  React.useEffect(() => {
    if (!openError) return;
    showToast({ body: `That yellow form couldn't be opened: ${describeError(openError)}`, type: 'error' });
    setOpen(null);
  }, [openError, setOpen, showToast]);

  const claimSheetLabel = (status: string) => statusLabelFor(workflow?.claim_sheet, status);
  const canFile = bootstrap.capabilities.can_file_yellow_forms;

  // Closing an editor goes back to the record it was editing, if there is one.
  const leaveEditor = (id: string | null) => {
    setEditor(null);
    setOpen(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Yellow forms"
        description="Co-curricular attendance claims for students who miss class for a club event."
        action={
          canFile ? (
            <Button
              label="New pre-approval"
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              clickAction={() => setEditor({ kind: 'pre_approval', form: null })}
            />
          ) : null
        }
      />

      <ol aria-label="How yellow forms work" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-md border border-border bg-card px-4 py-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-primary"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-primary">
                <span className="sr-only">Step {index + 1}: </span>
                {step.title}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-secondary">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-3" aria-labelledby="yellow-forms-pre-approvals">
        <h3 id="yellow-forms-pre-approvals" className="font-heading text-sm font-semibold text-primary">
          Pre-approvals
        </h3>
        {preApprovals.isLoading ? (
          <PageSkeleton variant="table" label="Loading pre-approvals" />
        ) : preApprovals.isError ? (
          <ErrorState
            title="Pre-approvals didn't load"
            error={preApprovals.error}
            onRetry={() => void preApprovals.refetch()}
          />
        ) : (
          <PreApprovalsTable
            forms={preApprovals.data ?? []}
            hrefFor={hrefFor}
            claimSheetLabel={claimSheetLabel}
            emptyState={
              <EmptyState
                title="No pre-approvals yet"
                description={
                  canFile
                    ? 'Start one at least a day before the event: the Faculty Coordinator and the Associate HOD both have to approve it before the event begins.'
                    : "When the club's leadership files a pre-approval, it appears here."
                }
                icon={ClipboardCheck}
              />
            }
          />
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="yellow-forms-claim-sheets">
        <h3 id="yellow-forms-claim-sheets" className="font-heading text-sm font-semibold text-primary">
          Claim sheets
        </h3>
        {claimSheets.isLoading ? (
          <PageSkeleton variant="table" label="Loading claim sheets" />
        ) : claimSheets.isError ? (
          <ErrorState
            title="Claim sheets didn't load"
            error={claimSheets.error}
            onRetry={() => void claimSheets.refetch()}
          />
        ) : (
          <ClaimSheetsTable
            sheets={claimSheets.data ?? []}
            hrefFor={hrefFor}
            emptyState={
              <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-secondary">
                No claim sheets yet. Once a pre-approved event is over, file its claim sheet from the
                pre-approval.
              </p>
            }
          />
        )}
      </section>

      <PreApprovalDrawer
        form={openKind === 'pre_approval' ? openForm : undefined}
        onClose={() => setOpen(null)}
        onEdit={form => {
          setOpen(null);
          setEditor({ kind: 'pre_approval', form });
        }}
        onFileClaimSheet={form => {
          setOpen(null);
          setEditor({ kind: 'claim_sheet', preApproval: form });
        }}
        onOpenClaimSheet={setOpen}
      />

      <ClaimSheetDrawer
        sheet={openKind === 'claim_sheet' ? openSheet : undefined}
        onClose={() => setOpen(null)}
        onEdit={sheet => {
          setOpen(null);
          setEditor({ kind: 'claim_sheet', sheet });
        }}
        onViewPreApproval={setOpen}
      />

      {editor?.kind === 'pre_approval' ? (
        <PreApprovalEditor
          key={editor.form?.id ?? 'new'}
          clubId={clubId}
          clubName={bootstrap.club.name}
          form={editor.form}
          onClose={saved => leaveEditor(saved?.id ?? null)}
          onSaved={form => leaveEditor(form.id)}
        />
      ) : null}

      {editor?.kind === 'claim_sheet' ? (
        'sheet' in editor ? (
          <ClaimSheetEditor
            key={editor.sheet.id}
            sheet={editor.sheet}
            onClose={saved => leaveEditor(saved?.id ?? editor.sheet.id)}
            onSubmitted={sheet => leaveEditor(sheet.id)}
          />
        ) : (
          <ClaimSheetEditor
            key={editor.preApproval.id}
            preApproval={editor.preApproval}
            onClose={saved => leaveEditor(saved?.id ?? editor.preApproval.id)}
            onSubmitted={sheet => leaveEditor(sheet.id)}
          />
        )
      ) : null}
    </div>
  );
};
