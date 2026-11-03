import { describe, it, expect, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ClaimSheet, PreApproval, YellowFormBundle } from '../../../api/types';
import type { UserState } from '../../../context/useStore';
import { ApiError } from '../../../services/api';
import { addDays, formatDate, todayIst } from '../../yellow-forms';
import { CLAIM_SHEET_FIXTURE, PRE_APPROVAL_FIXTURE } from '../../yellow-forms/testFixtures';
import { ClaimsDashboard } from '../ClaimsDashboard';
import { PEOPLE, renderScreen, resetScreen, type Responder } from '../yellow-forms/testHarness';

afterEach(resetScreen);

const TODAY = todayIst();
const EMPTY: YellowFormBundle = { pre_approvals: [], claim_sheets: [] };

const AT_AHOD: PreApproval = {
  ...PRE_APPROVAL_FIXTURE,
  id: 'paf_da_3',
  reference_number: 'PAF-2026-000703',
  event_name: 'Analytics Bootcamp',
  status: 'associate_hod_review',
  status_label: 'With Associate HOD',
  event_start_date: addDays(TODAY, 2),
  event_end_date: addDays(TODAY, 2),
  approval_deadline: addDays(TODAY, 1),
  event_completed: false,
  associate_hod_approved_by: null,
  associate_hod_approved_by_name: null,
  associate_hod_approved_at: null,
  pending_with: 'Dr. Anusha Iyer (Associate HOD)',
  claim_sheet_id: null,
  claim_sheet_status: null,
  claim_sheet_reference: null,
  viewer_can_review: true,
};

const APPROVED_SHEET: ClaimSheet = {
  ...CLAIM_SHEET_FIXTURE,
  id: 'ccs_da_8',
  reference_number: 'YF-2026-000802',
  event_name: 'Hackathon Mentoring',
  status: 'approved',
  status_label: 'Approved — forwarded to attendance office',
  reviewed_by: 'fac_sharath',
  reviewed_by_name: 'Sharath',
  reviewed_at: '2026-08-10',
  viewer_can_review: false,
};

function responder(routes: Record<string, unknown>): Responder {
  return endpoint => routes[endpoint.split('?')[0]];
}

function mount(path: string, user: UserState, routes: Record<string, unknown>) {
  return renderScreen(<ClaimsDashboard />, {
    path,
    routePath: '/app/claims/:tab',
    user,
    respond: responder(routes),
  });
}

function location(): string {
  return screen.getByTestId('location').textContent ?? '';
}

describe('the reviewer view', () => {
  it('lists the pre-approvals awaiting the Associate HOD, with the deadline', async () => {
    mount('/app/claims/yellow_forms', PEOPLE.associateHod, {
      '/yellow-forms/queue': { pre_approvals: [AT_AHOD], claim_sheets: [] },
      '/yellow-forms/reviewed': EMPTY,
    });

    expect(await screen.findByRole('heading', { name: 'Pre-approvals awaiting you' })).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Pre-approvals awaiting your approval' });
    expect(within(table).getByText('Analytics Bootcamp')).toBeTruthy();
    expect(within(table).getByText('PAF-2026-000703')).toBeTruthy();
    expect(within(table).getByText(formatDate(AT_AHOD.approval_deadline))).toBeTruthy();
    expect(within(table).getByText('Tomorrow')).toBeTruthy();
    expect(within(table).getByText('With Associate HOD')).toBeTruthy();
    // The Associate HOD never reviews claim sheets, so no always-empty queue for them.
    expect(screen.queryByRole('heading', { name: 'Claim sheets awaiting you' })).toBeNull();
  });

  it('opens a pre-approval to decide on it, and closes once decided', async () => {
    const user = userEvent.setup();
    const { post } = mount('/app/claims/yellow_forms', PEOPLE.associateHod, {
      '/yellow-forms/queue': { pre_approvals: [AT_AHOD], claim_sheets: [] },
      '/yellow-forms/reviewed': EMPTY,
      '/yellow-forms/pre-approvals/paf_da_3': AT_AHOD,
    });
    post.mockResolvedValue({ ...AT_AHOD, status: 'approved', status_label: 'Pre-approved' } as never);

    await user.click(await screen.findByRole('button', { name: /Analytics Bootcamp/ }));

    const drawer = await screen.findByRole('dialog', { name: 'Analytics Bootcamp' });
    await waitFor(() => expect(location()).toBe('/app/claims/yellow_forms?open=paf_da_3'));
    expect(within(drawer).getByText('Waiting on Dr. Anusha Iyer (Associate HOD).')).toBeTruthy();
    expect(within(drawer).getByRole('table', { name: 'Pre-approved students' })).toBeTruthy();

    await user.click(within(drawer).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/yellow-forms/pre-approvals/paf_da_3/review', {
        action: 'approve',
        comments: null,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(location()).toBe('/app/claims/yellow_forms');
  });

  it('lists claim sheets awaiting the Claims Coordinator, and what they already decided', async () => {
    mount('/app/claims/yellow_forms', PEOPLE.claimsCoordinator, {
      '/yellow-forms/queue': { pre_approvals: [], claim_sheets: [CLAIM_SHEET_FIXTURE] },
      '/yellow-forms/reviewed': { pre_approvals: [], claim_sheets: [APPROVED_SHEET] },
    });

    const waiting = await screen.findByRole('table', { name: 'Claim sheets awaiting your review' });
    expect(within(waiting).getByText('Excel Masterclass')).toBeTruthy();
    expect(within(waiting).getByText('YF-2026-000801')).toBeTruthy();
    expect(within(waiting).getByText('19 Aug 2026')).toBeTruthy();

    const decided = screen.getByRole('table', { name: 'Yellow forms you have already decided' });
    expect(within(decided).getByText('Hackathon Mentoring')).toBeTruthy();
    expect(within(decided).getByText('Approved — forwarded to attendance office')).toBeTruthy();

    expect(screen.queryByRole('heading', { name: 'Pre-approvals awaiting you' })).toBeNull();
  });

  it('opens a claim sheet from a deep link with the attached list, the sheet and the CSV', async () => {
    mount('/app/claims/yellow_forms?open=ccs_da_7', PEOPLE.claimsCoordinator, {
      '/yellow-forms/queue': EMPTY,
      '/yellow-forms/reviewed': EMPTY,
      '/yellow-forms/claim-sheets/ccs_da_7': CLAIM_SHEET_FIXTURE,
    });

    const drawer = await screen.findByRole('dialog', { name: 'Excel Masterclass' });
    expect(await within(drawer).findByText('Attached pre-approved list (3)')).toBeTruthy();
    expect(within(drawer).getByRole('table', { name: 'Claim sheet YF-2026-000801' })).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Download CSV' })).toBeTruthy();
    expect(within(drawer).getByRole('button', { name: 'Approve and forward' })).toBeTruthy();
  });

  it('says so when a deep-linked form cannot be opened', async () => {
    mount('/app/claims/yellow_forms?open=paf_da_1', PEOPLE.associateHod, {
      '/yellow-forms/queue': EMPTY,
      '/yellow-forms/reviewed': EMPTY,
      '/yellow-forms/pre-approvals/paf_da_1': new ApiError(403, {
        detail: 'You do not have access to this pre-approval',
      }),
    });

    expect(await screen.findByText("This yellow form didn't load")).toBeTruthy();
    expect(screen.getByText('You do not have access to this pre-approval')).toBeTruthy();
  });

  it('shows no decision panel on a form the server says this viewer cannot review', async () => {
    mount('/app/claims/yellow_forms?open=paf_da_3', PEOPLE.associateHod, {
      '/yellow-forms/queue': EMPTY,
      '/yellow-forms/reviewed': EMPTY,
      '/yellow-forms/pre-approvals/paf_da_3': { ...AT_AHOD, viewer_can_review: false },
    });

    const drawer = await screen.findByRole('dialog', { name: 'Analytics Bootcamp' });
    await within(drawer).findByText('Approval trail');
    expect(within(drawer).queryByRole('button', { name: 'Approve' })).toBeNull();
  });
});

describe('the claims review queue', () => {
  it('tells a Faculty Coordinator with no claims that a yellow form is waiting on him', async () => {
    const user = userEvent.setup();
    mount('/app/claims/review_queue', PEOPLE.facultyCoordinator, {
      '/yellow-forms/queue': { pre_approvals: [{ ...AT_AHOD, status: 'faculty_coordinator_review' }], claim_sheets: [] },
    });

    expect(await screen.findByText('No claims awaiting your review')).toBeTruthy();
    expect(screen.getByText('1 yellow form is waiting on you.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open Yellow Forms' }));
    await waitFor(() => expect(location()).toBe('/app/claims/yellow_forms'));
  });

  it('stays quiet about yellow forms for a reviewer who does not handle them', async () => {
    const { get } = mount('/app/claims/review_queue', PEOPLE.faculty, {});

    expect(await screen.findByText('Nothing awaiting your review')).toBeTruthy();
    expect(get.mock.calls.map(([endpoint]) => endpoint)).not.toContain('/yellow-forms/queue');
  });
});

describe('the student view', () => {
  const LISTED: PreApproval = {
    ...AT_AHOD,
    id: 'paf_da_2',
    event_name: 'Acumen — Business Challenge',
    status: 'faculty_coordinator_review',
    status_label: 'With Faculty Coordinator',
    faculty_coordinator_approved_by: null,
    faculty_coordinator_approved_by_name: null,
    faculty_coordinator_approved_at: null,
    pending_with: 'Dr. Reynal (Faculty Coordinator)',
    viewer_can_review: false,
  };
  const SHEET_AS_STUDENT: ClaimSheet = { ...CLAIM_SHEET_FIXTURE, viewer_can_review: false, viewer_can_export: false };

  it('lists the forms the student is on, read-only, and explains that clubs file them', async () => {
    mount('/app/claims/yellow_forms', PEOPLE.student, {
      '/yellow-forms/mine': { pre_approvals: [LISTED], claim_sheets: [SHEET_AS_STUDENT] },
    });

    expect(await screen.findByText('Clubs file yellow forms')).toBeTruthy();
    const forms = await screen.findByRole('table', { name: 'Pre-approvals that list you' });
    expect(within(forms).getByText('Acumen — Business Challenge')).toBeTruthy();
    expect(within(forms).getByText('With Faculty Coordinator')).toBeTruthy();
    expect(within(forms).getByRole('list', { name: 'Pre-approval progress' })).toBeTruthy();

    const sheets = screen.getByRole('table', { name: 'Claim sheets that list you' });
    expect(within(sheets).getByText('YF-2026-000801')).toBeTruthy();
    expect(within(sheets).getByRole('list', { name: 'Claim sheet progress' })).toBeTruthy();
  });

  it('opens a claim sheet without review or export controls', async () => {
    const user = userEvent.setup();
    mount('/app/claims/yellow_forms', PEOPLE.student, {
      '/yellow-forms/mine': { pre_approvals: [], claim_sheets: [SHEET_AS_STUDENT] },
      '/yellow-forms/claim-sheets/ccs_da_7': SHEET_AS_STUDENT,
    });

    await user.click(await screen.findByRole('button', { name: /Excel Masterclass/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Excel Masterclass' });
    expect(within(drawer).getByRole('table', { name: 'Claim sheet YF-2026-000801' })).toBeTruthy();
    expect(within(drawer).queryByText('Your decision')).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });

  it('sends a club filer to the club workspace to act on a form', async () => {
    const user = userEvent.setup();
    const due: PreApproval = {
      ...PRE_APPROVAL_FIXTURE,
      id: 'paf_da_6',
      event_name: 'DOC Analytica Orientation',
      claim_sheet_id: null,
      claim_sheet_status: null,
      claim_sheet_reference: null,
      viewer_can_file_claim_sheet: true,
    };
    mount('/app/claims/yellow_forms?open=paf_da_6', PEOPLE.student, {
      '/yellow-forms/mine': EMPTY,
      '/yellow-forms/pre-approvals/paf_da_6': due,
    });

    const drawer = await screen.findByRole('dialog', { name: 'DOC Analytica Orientation' });
    await user.click(within(drawer).getByRole('button', { name: 'Open in club workspace' }));
    await waitFor(() =>
      expect(location()).toBe('/app/clubs/yellow-forms?club=club_doc_analytica&open=paf_da_6'),
    );
  });

  it('points a club leader who followed a notification at the club workspace', async () => {
    mount('/app/claims/yellow_forms', PEOPLE.student, {
      '/yellow-forms/mine': EMPTY,
      '/clubs/my-memberships': [
        { id: 'club_doc_analytica', name: 'DOC Analytica', category: 'Academic', relationship: 'member' },
      ],
    });

    const link = await screen.findByRole('link', { name: 'DOC Analytica' });
    expect(link).toHaveAttribute('href', '/app/clubs/yellow-forms?club=club_doc_analytica');
    // A filer is told to file the claim sheet; this page must not say there is nothing to file.
    expect(screen.queryByText(/nothing for you to file/)).toBeNull();
  });

  it('says plainly when the student is on no forms yet', async () => {
    mount('/app/claims/yellow_forms', PEOPLE.student, { '/yellow-forms/mine': EMPTY });
    expect(await screen.findByText("You're not on any yellow forms yet")).toBeTruthy();
  });
});
