import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';

import { useClaimSheet, usePreApproval } from '../../../api/hooks';
import type { ClaimSheet, PreApproval, YellowFormBundle } from '../../../api/types';
import { Drawer } from '../../../components/ui/Drawer';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageSkeleton } from '../../../components/ui/PageSkeleton';
import {
  ClaimSheetDetail,
  ExportCsvButton,
  PreApprovalDetail,
  ReviewPanel,
  YellowFormStatusChip,
  yellowFormKindOf,
} from '../../yellow-forms';

function clubHref(clubId: string, id: string): string {
  return `/app/clubs/yellow-forms?club=${encodeURIComponent(clubId)}&open=${encodeURIComponent(id)}`;
}

/** Filing happens in the club workspace; these flags mean the viewer can act there. */
function filerCanActOnForm(form: PreApproval): boolean {
  return form.viewer_can_edit || form.viewer_can_submit || form.viewer_can_delete || form.viewer_can_file_claim_sheet;
}

function filerCanActOnSheet(sheet: ClaimSheet): boolean {
  return sheet.viewer_can_edit || sheet.viewer_can_submit || sheet.viewer_can_delete;
}

/**
 * One pre-approval or claim sheet, opened by `?open=<id>` (the prefix says
 * which). The row from the list paints at once; the detail request refreshes
 * it, and is all there is for a deep link to a form in neither list. The
 * decision panel appears only when the server says this viewer may review.
 */
export const YellowFormDrawer: React.FC<{
  openId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Rows already on screen, used until the detail arrives. */
  lists: YellowFormBundle[];
  allowReview: boolean;
}> = ({ openId, onOpen, onClose, lists, allowReview }) => {
  const navigate = useNavigate();
  const kind = yellowFormKindOf(openId);

  const formQuery = usePreApproval(kind === 'pre_approval' ? openId : null);
  const sheetQuery = useClaimSheet(kind === 'claim_sheet' ? openId : null);

  const form = kind === 'pre_approval'
    ? formQuery.data ?? lists.flatMap(l => l.pre_approvals ?? []).find(f => f.id === openId)
    : undefined;
  const sheet = kind === 'claim_sheet'
    ? sheetQuery.data ?? lists.flatMap(l => l.claim_sheets ?? []).find(s => s.id === openId)
    : undefined;
  const query = kind === 'pre_approval' ? formQuery : sheetQuery;

  const canReview = allowReview && Boolean(form?.viewer_can_review || sheet?.viewer_can_review);
  const reference = form?.reference_number ?? sheet?.reference_number;

  let body: React.ReactNode;
  if (form) {
    body = (
      <div className="flex flex-col gap-5">
        <PreApprovalDetail form={form} />
        {canReview ? <ReviewPanel key={form.id} kind="pre_approval" id={form.id} onReviewed={onClose} /> : null}
      </div>
    );
  } else if (sheet) {
    body = (
      <div className="flex flex-col gap-5">
        <ClaimSheetDetail sheet={sheet} />
        {canReview ? <ReviewPanel key={sheet.id} kind="claim_sheet" id={sheet.id} onReviewed={onClose} /> : null}
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState
        title="This yellow form didn't load"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  } else {
    body = <PageSkeleton variant="detail" label="Loading the yellow form" />;
  }

  const actions: React.ReactNode[] = [];
  if (form?.claim_sheet_id && form.claim_sheet_status !== 'draft') {
    const sheetId = form.claim_sheet_id;
    actions.push(
      <Button key="sheet" label="View claim sheet" variant="secondary" size="sm" clickAction={() => onOpen(sheetId)} />,
    );
  }
  if (sheet) {
    const preApprovalId = sheet.pre_approval_id;
    actions.push(
      <Button key="pre" label="View pre-approval" variant="secondary" size="sm" clickAction={() => onOpen(preApprovalId)} />,
      <ExportCsvButton key="csv" sheet={sheet} />,
    );
  }
  const clubTarget = form && filerCanActOnForm(form) ? form : sheet && filerCanActOnSheet(sheet) ? sheet : null;
  if (clubTarget) {
    actions.push(
      <Button
        key="club"
        label="Open in club workspace"
        variant="primary"
        size="sm"
        clickAction={() => navigate(clubHref(clubTarget.club_id, clubTarget.id))}
      />,
    );
  }

  return (
    <Drawer
      isOpen={kind !== null}
      onClose={onClose}
      // A half-typed reason must survive a stray backdrop click.
      purpose={canReview ? 'form' : 'info'}
      // Wide enough for the claim sheet's 13 template columns at laptop widths.
      width={kind === 'claim_sheet' ? 1040 : 600}
      title={form?.event_name ?? sheet?.event_name ?? (kind === 'claim_sheet' ? 'Claim sheet' : 'Pre-approval')}
      subtitle={reference ? `${kind === 'claim_sheet' ? 'Claim sheet' : 'Pre-approval'} · ${reference}` : undefined}
      headerContent={
        form ? (
          <YellowFormStatusChip status={form.status} label={form.status_label} isExpired={form.is_expired} />
        ) : sheet ? (
          <YellowFormStatusChip status={sheet.status} label={sheet.status_label} />
        ) : null
      }
      actions={actions.length > 0 ? actions : undefined}
    >
      {body}
    </Drawer>
  );
};
