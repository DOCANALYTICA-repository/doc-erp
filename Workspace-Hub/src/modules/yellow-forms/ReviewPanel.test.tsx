import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api, ApiError } from '../../services/api';
import { platformKeys, yellowFormKeys } from '../../lib/queryKeys';
import { ReviewPanel } from './ReviewPanel';
import { renderWithClient } from './renderWithClient';
import { CLAIM_SHEET_FIXTURE, PRE_APPROVAL_FIXTURE } from './testFixtures';

afterEach(() => vi.restoreAllMocks());

const FORM_AT_FC = {
  ...PRE_APPROVAL_FIXTURE,
  id: 'paf_da_2',
  status: 'faculty_coordinator_review',
};

describe('ReviewPanel', () => {
  it('needs a reason before it will send back or reject, but not to approve', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReviewPanel kind="pre_approval" id="paf_da_2" />);

    const sendBack = screen.getByRole('button', { name: 'Send back to club' });
    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(sendBack).toBeDisabled();
    expect(reject).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();

    await user.type(screen.getByLabelText(/reason/i), '   ');
    expect(sendBack).toBeDisabled();

    await user.type(screen.getByLabelText(/reason/i), 'Add the venue.');
    expect(sendBack).toBeEnabled();
    expect(reject).toBeEnabled();
  });

  it('sends the pre-approval back with the reason, then reports and invalidates', async () => {
    const user = userEvent.setup();
    const returned = { ...FORM_AT_FC, status: 'returned' };
    const post = vi.spyOn(api, 'post').mockResolvedValue(returned as never);
    const onReviewed = vi.fn();
    const { queryClient } = renderWithClient(
      <ReviewPanel kind="pre_approval" id="paf_da_2" onReviewed={onReviewed} />,
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(yellowFormKeys.queue(), { pre_approvals: [FORM_AT_FC], claim_sheets: [] });
    queryClient.setQueryData(yellowFormKeys.clubPreApprovals('club_doc_analytica'), [FORM_AT_FC]);

    await user.type(screen.getByLabelText(/reason/i), '  Add the venue.  ');
    await user.click(screen.getByRole('button', { name: 'Send back to club' }));

    await waitFor(() => expect(onReviewed).toHaveBeenCalledWith('revise', returned));
    expect(post).toHaveBeenCalledWith('/yellow-forms/pre-approvals/paf_da_2/review', {
      action: 'revise',
      comments: 'Add the venue.',
    });
    expect(await screen.findByText('Sent back to the club with your reason.')).toBeTruthy();

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(expect.arrayContaining([
      yellowFormKeys.all,
      platformKeys.actionQueue,
      platformKeys.pipeline,
      platformKeys.notifications,
    ]));
    expect(queryClient.getQueryState(yellowFormKeys.queue())?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(yellowFormKeys.clubPreApprovals('club_doc_analytica'))?.isInvalidated,
    ).toBe(true);
    // The static workflow table is left alone.
    expect(queryClient.getQueryState(yellowFormKeys.workflow())?.isInvalidated).toBe(false);
    expect(screen.getByLabelText(/reason/i)).toHaveValue('');
  });

  it('says where an approval went next', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue(
      { ...FORM_AT_FC, status: 'associate_hod_review' } as never,
    );
    renderWithClient(<ReviewPanel kind="pre_approval" id="paf_da_2" />);

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/now goes to the Associate HOD/i)).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/yellow-forms/pre-approvals/paf_da_2/review', {
      action: 'approve',
      comments: null,
    });
  });

  it('approves a claim sheet through the claim-sheet endpoint', async () => {
    const user = userEvent.setup();
    const approved = { ...CLAIM_SHEET_FIXTURE, status: 'approved' };
    const post = vi.spyOn(api, 'post').mockResolvedValue(approved as never);
    const onReviewed = vi.fn();
    renderWithClient(<ReviewPanel kind="claim_sheet" id="ccs_da_7" onReviewed={onReviewed} />);

    await user.click(screen.getByRole('button', { name: 'Approve and forward' }));

    await waitFor(() => expect(onReviewed).toHaveBeenCalledWith('approve', approved));
    expect(post).toHaveBeenCalledWith('/yellow-forms/claim-sheets/ccs_da_7/review', {
      action: 'approve',
      comments: null,
    });
    expect(await screen.findByText(/forwarded to the attendance office/i)).toBeTruthy();
  });

  it('shows the server\'s refusal and keeps the reason', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'post').mockRejectedValue(
      new ApiError(403, { detail: 'You are not the assigned Faculty Coordinator for this club' }),
    );
    const onReviewed = vi.fn();
    renderWithClient(<ReviewPanel kind="pre_approval" id="paf_cc_1" onReviewed={onReviewed} />);

    await user.type(screen.getByLabelText(/reason/i), 'Wrong dates');
    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(
      await screen.findByText('You are not the assigned Faculty Coordinator for this club'),
    ).toBeTruthy();
    expect(onReviewed).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/reason/i)).toHaveValue('Wrong dates');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled());
  });
});
