/**
 * The claim-sheet editor: the server's rules are checked before anything is
 * sent, and what is sent is exactly the sheet — included students only, and
 * only the dates that have a period ticked.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, api } from '../../../services/api';
import type { ClaimSheet, PreApproval } from '../../../api/types';
import { CLAIM_SHEET_FIXTURE, PRE_APPROVAL_FIXTURE } from '../../yellow-forms/testFixtures';
import { ClaimSheetEditor } from './ClaimSheetEditor';
import { renderInClubWorkspace } from './testHarness';

// Astryx's dialog restores scroll on unmount, which jsdom does not implement.
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const APPROVED: PreApproval = {
  ...PRE_APPROVAL_FIXTURE,
  claim_sheet_id: null,
  claim_sheet_status: null,
  claim_sheet_reference: null,
  viewer_can_file_claim_sheet: true,
};

const DRAFT_SHEET: ClaimSheet = {
  ...CLAIM_SHEET_FIXTURE,
  id: 'ccs_new',
  reference_number: 'YF-2026-000900',
  status: 'draft',
  status_label: 'Draft',
  submitted_at: null,
  students: [],
  student_count: 0,
  row_count: 0,
  viewer_can_edit: true,
  viewer_can_submit: true,
  viewer_can_delete: true,
  viewer_can_review: false,
  viewer_can_export: true,
};

function renderEditor(props: { preApproval: PreApproval } | { sheet: ClaimSheet }) {
  const onSubmitted = vi.fn();
  const onClose = vi.fn();
  renderInClubWorkspace(<ClaimSheetEditor {...props} onClose={onClose} onSubmitted={onSubmitted} />);
  return { onSubmitted, onClose };
}

async function fillAttendance(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  withClaims: string,
  withoutClaims: string,
) {
  await user.type(screen.getByLabelText(`${name}, attendance with claims (%)`), withClaims);
  await user.type(screen.getByLabelText(`${name}, attendance without claims (%)`), withoutClaims);
}

describe('ClaimSheetEditor', () => {
  it('lays out every pre-approved student against every event date, with a checkbox per period', () => {
    renderEditor({ preApproval: APPROVED });

    for (const name of ['Affan Ahmed A', 'Hariharan K', 'Meera Nair']) {
      expect(screen.getByLabelText(`Include ${name}`, { exact: false })).toBeChecked();
      for (const date of ['17 Aug', '18 Aug']) {
        for (const period of ['7:00 AM', '8:00 AM', '9:00 AM', '9:45 AM', '10:45 AM']) {
          expect(screen.getByRole('checkbox', { name: `${name}, ${date}, ${period}` })).not.toBeChecked();
        }
      }
    }
  });

  it('refuses to submit when attendance without claims is higher than with claims', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post');
    const put = vi.spyOn(api, 'put');
    renderEditor({ preApproval: APPROVED });

    await user.click(screen.getByLabelText(/Include Hariharan K/));
    await user.click(screen.getByLabelText(/Include Meera Nair/));
    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 17 Aug, 9:45 AM' }));
    await fillAttendance(user, 'Affan Ahmed A', '90', '95');
    await user.click(screen.getByRole('button', { name: 'Submit to Claims Coordinator' }));

    const alert = within(await screen.findByRole('alert'));
    expect(alert.getByText('Fix these before submitting')).toBeTruthy();
    expect(
      alert.getByText(
        'Affan Ahmed A (2611507): attendance without claims (95) cannot be higher than attendance with claims (90).',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Affan Ahmed A, attendance without claims (%)')).toHaveAttribute('aria-invalid', 'true');
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses to submit while an included student has no period ticked', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post');
    renderEditor({ preApproval: APPROVED });

    await user.click(screen.getByLabelText(/Include Meera Nair/));
    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 17 Aug, 9:45 AM' }));
    await fillAttendance(user, 'Affan Ahmed A', '97.78', '97.78');
    await fillAttendance(user, 'Hariharan K', '91.5', '88');
    await user.click(screen.getByRole('button', { name: 'Submit to Claims Coordinator' }));

    expect(
      await screen.findByText(
        'Hariharan K (2511234): tick at least one period they missed, or exclude them from the sheet.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Tick at least one period, or leave them off.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('sends only included students and only the dates with periods, then submits', async () => {
    const user = userEvent.setup();
    const submitted = { ...DRAFT_SHEET, status: 'claims_coordinator_review' };
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(DRAFT_SHEET as never)
      .mockResolvedValueOnce(submitted as never);
    const { onSubmitted } = renderEditor({ preApproval: APPROVED });

    await user.click(screen.getByLabelText(/Include Meera Nair/));
    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 17 Aug, 9:45 AM' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hariharan K, 18 Aug, 7:00 AM' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hariharan K, 17 Aug, 9:00 AM' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hariharan K, 17 Aug, 8:00 AM' }));
    // Ticked and unticked again: the date must not be sent with no periods.
    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 18 Aug, 10:45 AM' }));
    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 18 Aug, 10:45 AM' }));
    await fillAttendance(user, 'Affan Ahmed A', '97.78', '97.78');
    await fillAttendance(user, 'Hariharan K', '91.5', '88');
    const role = screen.getByLabelText('Hariharan K, role');
    await user.clear(role);
    await user.type(role, 'Event lead');

    await user.click(screen.getByRole('button', { name: 'Submit to Claims Coordinator' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(submitted));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]).toEqual([
      '/yellow-forms/pre-approvals/paf_da_7/claim-sheet',
      {
        students: [
          {
            pre_approval_student_id: 'pas_affan',
            attendance_with_claims: 97.78,
            attendance_without_claims: 97.78,
            role: 'DOC Analytica',
            entries: [{ date: '2026-08-17', periods: ['9_45AM'] }],
          },
          {
            pre_approval_student_id: 'pas_hari',
            attendance_with_claims: 91.5,
            attendance_without_claims: 88,
            role: 'Event lead',
            entries: [
              { date: '2026-08-17', periods: ['8AM', '9AM'] },
              { date: '2026-08-18', periods: ['7AM'] },
            ],
          },
        ],
      },
    ]);
    expect(post.mock.calls[1]).toEqual(['/yellow-forms/claim-sheets/ccs_new/submit', {}]);
  });

  it('saves a partial draft, then offers the CSV download for the saved sheet', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce(DRAFT_SHEET as never);
    renderEditor({ preApproval: APPROVED });

    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 17 Aug, 9:45 AM' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByRole('button', { name: 'Download CSV' })).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
    const [endpoint, body] = post.mock.calls[0] as [string, { students: { entries: unknown[] }[] }];
    expect(endpoint).toBe('/yellow-forms/pre-approvals/paf_da_7/claim-sheet');
    expect(body.students).toHaveLength(3);
    expect(body.students.map(student => student.entries.length)).toEqual([1, 0, 0]);
  });

  it('shows a returned sheet\'s comment and saves it in place', async () => {
    const user = userEvent.setup();
    const returned: ClaimSheet = {
      ...CLAIM_SHEET_FIXTURE,
      status: 'returned',
      status_label: 'Returned to club',
      reviewed_by_name: 'Sharath',
      review_comments: 'Please re-check the 8 AM period for Hariharan.',
      viewer_can_edit: true,
      viewer_can_submit: true,
      viewer_can_review: false,
    };
    const put = vi.spyOn(api, 'put').mockResolvedValue(returned as never);
    renderEditor({ sheet: returned });

    expect(screen.getByText('Sent back by Sharath')).toBeTruthy();
    expect(screen.getByText('Please re-check the 8 AM period for Hariharan.')).toBeTruthy();
    // Seeded from the saved sheet: Meera was left off, Hariharan's 8 AM is ticked.
    expect(screen.getByLabelText(/Include Meera Nair/)).not.toBeChecked();
    const eightAm = screen.getByRole('checkbox', { name: 'Hariharan K, 17 Aug, 8:00 AM' });
    expect(eightAm).toBeChecked();

    await user.click(eightAm);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [endpoint, body] = put.mock.calls[0] as [string, { students: { pre_approval_student_id: string; entries: unknown[] }[] }];
    expect(endpoint).toBe('/yellow-forms/claim-sheets/ccs_da_7');
    expect(body.students.map(student => student.pre_approval_student_id)).toEqual(['pas_affan', 'pas_hari']);
    expect(body.students[1].entries).toEqual([
      { date: '2026-08-17', periods: ['9AM'] },
      { date: '2026-08-18', periods: ['7AM'] },
    ]);
  });

  it('says nothing was saved when the save itself fails', async () => {
    const user = userEvent.setup();
    const returned: ClaimSheet = {
      ...CLAIM_SHEET_FIXTURE,
      status: 'returned',
      status_label: 'Returned to club',
      viewer_can_edit: true,
      viewer_can_submit: true,
      viewer_can_review: false,
    };
    vi.spyOn(api, 'put').mockRejectedValue(new ApiError(0, { detail: 'Cannot reach the server.' }));
    const post = vi.spyOn(api, 'post');
    renderEditor({ sheet: returned });

    await user.click(screen.getByRole('button', { name: 'Submit to Claims Coordinator' }));

    expect(await screen.findByText(/Cannot reach the server/)).toBeTruthy();
    expect(screen.queryByText(/Saved as a draft/)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('asks before throwing away unsaved periods, and not once they are saved', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'post').mockResolvedValueOnce(DRAFT_SHEET as never);
    const { onClose } = renderEditor({ preApproval: APPROVED });
    const editor = screen.getByRole('dialog', { name: 'File claim sheet' });

    await user.click(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 17 Aug, 9:45 AM' }));
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'Discard your changes?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Affan Ahmed A, 17 Aug, 9:45 AM' })).toBeChecked();

    await user.click(within(editor).getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('button', { name: 'Download CSV' });
    // The header's close button, then nothing left to lose.
    await user.click(within(editor).getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.queryByRole('alertdialog', { name: 'Discard your changes?' })).toBeNull();
    expect(onClose).toHaveBeenCalledWith(DRAFT_SHEET);
  });

  it('discards unsaved changes once the user confirms', async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor({ preApproval: APPROVED });

    await fillAttendance(user, 'Affan Ahmed A', '97', '96');
    const [, footerClose] = screen.getAllByRole('button', { name: 'Close' });
    await user.click(footerClose);
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    expect(onClose).toHaveBeenCalledWith(null);
  });
});
