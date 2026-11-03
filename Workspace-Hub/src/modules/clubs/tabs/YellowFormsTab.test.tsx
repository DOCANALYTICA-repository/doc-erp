/**
 * The club's Yellow Forms tab: who may start a pre-approval, what the lists
 * say about each form, and the `?open=` deep link the action queue and
 * notifications point at.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { api } from '../../../services/api';
import type { ClaimSheet, PreApproval } from '../../../api/types';
import { CLAIM_SHEET_FIXTURE, PRE_APPROVAL_FIXTURE } from '../../yellow-forms/testFixtures';
import {
  TEST_CLUB_ID,
  currentLocation,
  renderInClubWorkspace,
  stubGet,
} from '../yellow-forms/testHarness';
import { YellowFormsTab } from './YellowFormsTab';

// Astryx's dialog restores scroll on unmount, which jsdom does not implement.
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const NO_FLAGS = {
  viewer_can_edit: false,
  viewer_can_submit: false,
  viewer_can_delete: false,
  viewer_can_review: false,
  viewer_can_file_claim_sheet: false,
};

const DRAFT: PreApproval = {
  ...PRE_APPROVAL_FIXTURE,
  ...NO_FLAGS,
  id: 'paf_da_1',
  reference_number: 'PAF-2026-000701',
  event_name: 'Intellect — Industry Panel',
  event_start_date: '2026-10-18',
  event_end_date: '2026-10-18',
  status: 'draft',
  status_label: 'Draft',
  submitted_at: null,
  faculty_coordinator_approved_by: null,
  faculty_coordinator_approved_by_name: null,
  faculty_coordinator_approved_at: null,
  associate_hod_approved_by: null,
  associate_hod_approved_by_name: null,
  associate_hod_approved_at: null,
  approval_deadline: '2026-10-17',
  event_completed: false,
  claim_sheet_id: null,
  claim_sheet_status: null,
  claim_sheet_reference: null,
  viewer_can_edit: true,
  viewer_can_submit: true,
  viewer_can_delete: true,
};

const EXPIRED: PreApproval = {
  ...DRAFT,
  ...NO_FLAGS,
  id: 'paf_da_10',
  reference_number: 'PAF-2026-000710',
  event_name: 'Startup Pitch Day',
  status: 'faculty_coordinator_review',
  status_label: 'With Faculty Coordinator',
  is_expired: true,
};

const WITH_SHEET: PreApproval = { ...PRE_APPROVAL_FIXTURE, ...NO_FLAGS };

const READY_TO_FILE: PreApproval = {
  ...PRE_APPROVAL_FIXTURE,
  ...NO_FLAGS,
  id: 'paf_da_6',
  reference_number: 'PAF-2026-000706',
  event_name: 'DOC Analytica Orientation',
  claim_sheet_id: null,
  claim_sheet_status: null,
  claim_sheet_reference: null,
  viewer_can_file_claim_sheet: true,
};

const SHEET: ClaimSheet = { ...CLAIM_SHEET_FIXTURE, viewer_can_review: false };

function stubClub(preApprovals: PreApproval[] = [DRAFT, EXPIRED, WITH_SHEET, READY_TO_FILE]) {
  return stubGet({
    [`/clubs/${TEST_CLUB_ID}/pre-approvals`]: preApprovals,
    [`/clubs/${TEST_CLUB_ID}/claim-sheets`]: [SHEET],
  });
}

function rowOf(eventName: string) {
  const row = screen.getByRole('link', { name: new RegExp(eventName) }).closest('tr');
  if (!row) throw new Error(`no row for ${eventName}`);
  return within(row);
}

describe('the club Yellow Forms tab', () => {
  it('offers "New pre-approval" to people who can file yellow forms', async () => {
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />, { canFileYellowForms: true });

    expect(await screen.findByRole('button', { name: 'New pre-approval' })).toBeTruthy();
  });

  it('hides "New pre-approval" from people who cannot file', async () => {
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />, { canFileYellowForms: false });

    // Wait for the list, so the button's absence is not just an unfinished render.
    await screen.findByRole('link', { name: /Intellect/ });
    expect(screen.queryByRole('button', { name: 'New pre-approval' })).toBeNull();
  });

  it('explains the three steps of the flow', async () => {
    stubClub([]);
    renderInClubWorkspace(<YellowFormsTab />);

    const steps = within(screen.getByRole('list', { name: 'How yellow forms work' }));
    expect(steps.getByText('Pre-approval')).toBeTruthy();
    expect(steps.getByText('Run the event')).toBeTruthy();
    expect(steps.getByText('Claim sheet')).toBeTruthy();
    expect(await screen.findByText('No pre-approvals yet')).toBeTruthy();
  });

  it('lists each pre-approval with its status and what comes next', async () => {
    const upcoming: PreApproval = {
      ...READY_TO_FILE,
      id: 'paf_da_5',
      event_name: 'Data Storytelling Workshop',
      event_start_date: '2026-10-02',
      event_end_date: '2026-10-02',
      event_completed: false,
      viewer_can_file_claim_sheet: false,
    };
    stubClub([DRAFT, EXPIRED, WITH_SHEET, READY_TO_FILE, upcoming]);
    renderInClubWorkspace(<YellowFormsTab />);

    await screen.findByRole('link', { name: /Intellect/ });

    const draft = rowOf('Intellect');
    expect(draft.getByText('Draft')).toBeTruthy();
    expect(draft.getByText('Approve by 17 Oct 2026')).toBeTruthy();

    const expired = rowOf('Startup Pitch Day');
    expect(expired.getAllByText('Expired')).toHaveLength(2);

    const withSheet = rowOf('Excel Masterclass');
    expect(withSheet.getByText('Pre-approved')).toBeTruthy();
    expect(withSheet.getByText('Claim sheet: With Claims Coordinator')).toBeTruthy();

    expect(rowOf('DOC Analytica Orientation').getByText('Claim sheet: not filed yet')).toBeTruthy();
    // Filing opens on the end date itself, not the day after.
    expect(rowOf('Data Storytelling Workshop').getByText('Claim sheet from 2 Oct 2026')).toBeTruthy();
  });

  it('lists the claim sheets below', async () => {
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />);

    const row = within(
      (await screen.findByRole('link', { name: 'YF-2026-000801' })).closest('tr') as HTMLElement,
    );
    expect(row.getByText('With Claims Coordinator')).toBeTruthy();
    expect(row.getByText('19 Aug 2026')).toBeTruthy();
    expect(row.getByText('3')).toBeTruthy();
  });

  it('opens ?open=<pre-approval> in a drawer with only the actions its flags allow', async () => {
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_1`,
    });

    const drawer = within(await screen.findByRole('dialog', { name: 'Pre-approval' }));
    expect(drawer.getByText('PAF-2026-000701')).toBeTruthy();
    expect(drawer.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(drawer.getByRole('button', { name: 'Submit for approval' })).toBeTruthy();
    expect(drawer.getByRole('button', { name: 'Delete draft' })).toBeTruthy();
    expect(drawer.queryByRole('button', { name: 'File claim sheet' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Open claim sheet' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('explains why a draft cannot be submitted when the club has no Faculty Coordinator', async () => {
    const reason =
      'This club has no Faculty Coordinator assigned — ask the department to assign one before requesting pre-approval.';
    stubClub([{ ...DRAFT, viewer_can_submit: false, submit_blocked_reason: reason }]);
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_1`,
    });

    const drawer = within(await screen.findByRole('dialog', { name: 'Pre-approval' }));
    expect(drawer.getByText(reason)).toBeTruthy();
    expect(drawer.queryByRole('button', { name: 'Submit for approval' })).toBeNull();
    expect(drawer.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('offers to file the claim sheet once the event is over', async () => {
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_6`,
    });

    const drawer = within(await screen.findByRole('dialog', { name: 'Pre-approval' }));
    expect(drawer.getByRole('button', { name: 'File claim sheet' })).toBeTruthy();
    expect(drawer.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(drawer.queryByRole('button', { name: 'Submit for approval' })).toBeNull();
  });

  it('keeps a reviewer\'s half-typed reason through a stray backdrop click', async () => {
    const user = userEvent.setup();
    const awaiting: PreApproval = {
      ...DRAFT,
      ...NO_FLAGS,
      id: 'paf_da_2',
      status: 'faculty_coordinator_review',
      status_label: 'With Faculty Coordinator',
      viewer_can_review: true,
    };
    stubGet({
      [`/clubs/${TEST_CLUB_ID}/pre-approvals`]: [awaiting],
      [`/clubs/${TEST_CLUB_ID}/claim-sheets`]: [{ ...SHEET, viewer_can_review: true }],
    });
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_2`,
    });

    for (const [name, next] of [['Pre-approval', 'ccs_da_7'], ['Claim sheet', null]] as const) {
      const dialog = await screen.findByRole('dialog', { name });
      await user.type(within(dialog).getByLabelText(/Reason/), 'Add the venue.');
      // The <dialog> itself is the click target only when the backdrop is clicked.
      fireEvent.click(dialog);
      expect(screen.getByRole('dialog', { name })).toBe(dialog);
      expect(within(dialog).getByLabelText(/Reason/)).toHaveValue('Add the venue.');
      if (next) {
        await user.click(within(dialog).getByRole('button', { name: /close/i }));
        await user.click(screen.getByRole('link', { name: 'YF-2026-000801' }));
      }
    }
  });

  it('closes a read-only drawer on a backdrop click', async () => {
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_7`,
    });

    fireEvent.click(await screen.findByRole('dialog', { name: 'Pre-approval' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pre-approval' })).toBeNull());
    expect(currentLocation()).toBe(`/app/clubs/yellow-forms?club=${TEST_CLUB_ID}`);
  });

  it('opens a row in the drawer, and closing it drops ?open= but keeps ?club=', async () => {
    const user = userEvent.setup();
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />);

    await user.click(await screen.findByRole('link', { name: /Excel Masterclass/ }));
    const drawer = within(await screen.findByRole('dialog', { name: 'Pre-approval' }));
    expect(currentLocation()).toContain('open=paf_da_7');

    await user.click(drawer.getByRole('button', { name: 'Open claim sheet' }));
    expect(await screen.findByRole('dialog', { name: 'Claim sheet' })).toBeTruthy();
    expect(currentLocation()).toContain('open=ccs_da_7');

    await user.click(within(screen.getByRole('dialog', { name: 'Claim sheet' })).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Claim sheet' })).toBeNull());
    expect(currentLocation()).toBe(`/app/clubs/yellow-forms?club=${TEST_CLUB_ID}`);
  });

  it('goes back to the form when its editor is cancelled', async () => {
    const user = userEvent.setup();
    stubClub();
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_1`,
    });

    await user.click(
      within(await screen.findByRole('dialog', { name: 'Pre-approval' })).getByRole('button', { name: 'Edit' }),
    );
    const editor = within(await screen.findByRole('dialog', { name: 'Edit pre-approval' }));
    expect(currentLocation()).not.toContain('open=');

    await user.click(editor.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('dialog', { name: 'Pre-approval' })).toBeTruthy();
    expect(currentLocation()).toBe(`/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_da_1`);
  });

  it('will not submit a claim sheet that has nobody on it', async () => {
    const user = userEvent.setup();
    const empty: ClaimSheet = {
      ...SHEET,
      status: 'draft',
      status_label: 'Draft',
      submitted_at: null,
      students: [],
      student_count: 0,
      row_count: 0,
      viewer_can_edit: true,
      viewer_can_submit: true,
      viewer_can_delete: true,
    };
    stubGet({
      [`/clubs/${TEST_CLUB_ID}/pre-approvals`]: [WITH_SHEET],
      [`/clubs/${TEST_CLUB_ID}/claim-sheets`]: [empty],
    });
    const post = vi.spyOn(api, 'post');
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=ccs_da_7`,
    });

    const drawer = within(await screen.findByRole('dialog', { name: 'Claim sheet' }));
    await user.click(drawer.getByRole('button', { name: 'Submit to Claims Coordinator' }));

    expect(
      await screen.findByText(
        'Add at least one student before submitting the claim sheet. Edit the claim sheet to fix it.',
      ),
    ).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('fetches a deep-linked form the list does not hold', async () => {
    const other = { ...DRAFT, id: 'paf_elsewhere', reference_number: 'PAF-2026-000999' };
    const get = stubGet({
      [`/clubs/${TEST_CLUB_ID}/pre-approvals`]: [DRAFT],
      [`/clubs/${TEST_CLUB_ID}/claim-sheets`]: [],
      '/pre-approvals/paf_elsewhere': other,
    });
    renderInClubWorkspace(<YellowFormsTab />, {
      path: `/app/clubs/yellow-forms?club=${TEST_CLUB_ID}&open=paf_elsewhere`,
    });

    const drawer = within(await screen.findByRole('dialog', { name: 'Pre-approval' }));
    expect(drawer.getByText('PAF-2026-000999')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/yellow-forms/pre-approvals/paf_elsewhere');
  });
});
