import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';

import type { PreApproval } from '../../api/types';
import { PreApprovalDetail } from './PreApprovalDetail';
import { renderWithClient } from './renderWithClient';
import { PRE_APPROVAL_FIXTURE } from './testFixtures';

const AT_FC: PreApproval = {
  ...PRE_APPROVAL_FIXTURE,
  status: 'faculty_coordinator_review',
  status_label: 'With Faculty Coordinator',
  event_start_date: '2026-10-07',
  event_end_date: '2026-10-08',
  approval_deadline: '2026-10-06',
  event_completed: false,
  faculty_coordinator_approved_by: null,
  faculty_coordinator_approved_by_name: null,
  faculty_coordinator_approved_at: null,
  associate_hod_approved_by: null,
  associate_hod_approved_by_name: null,
  associate_hod_approved_at: null,
  pending_with: 'Dr. Reynal (Faculty Coordinator)',
  claim_sheet_id: null,
  claim_sheet_status: null,
  claim_sheet_reference: null,
};

describe('PreApprovalDetail', () => {
  it('gives the approval deadline and who it is waiting on', () => {
    renderWithClient(<PreApprovalDetail form={AT_FC} />);

    expect(
      screen.getByText('Needs Faculty Coordinator and Associate HOD approval by 6 Oct 2026'),
    ).toBeTruthy();
    expect(screen.getByText('Waiting on Dr. Reynal (Faculty Coordinator).')).toBeTruthy();
    expect(screen.getByText('7 – 8 Oct 2026')).toBeTruthy();

    const progress = screen.getByRole('list', { name: 'Pre-approval progress' });
    expect(within(progress).getByRole('img', { name: 'In progress' })).toBeTruthy();
  });

  it('lists the students with their class and role', () => {
    renderWithClient(<PreApprovalDetail form={AT_FC} />);
    const table = screen.getByRole('table', { name: 'Pre-approved students' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Affan Ahmed A')).toBeTruthy();
    expect(within(table).getByText('5 BCom AFA')).toBeTruthy();
    expect(within(table).getByText('Volunteer')).toBeTruthy();
  });

  it('says an expired form can no longer be approved, instead of a deadline', () => {
    renderWithClient(<PreApprovalDetail form={{ ...AT_FC, is_expired: true, pending_with: null }} />);
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(/can no longer be submitted or approved/i)).toBeTruthy();
    expect(screen.queryByText(/Needs Faculty Coordinator and Associate HOD approval/)).toBeNull();
  });

  it('shows who sent it back, from which stage, and why', () => {
    renderWithClient(
      <PreApprovalDetail
        form={{
          ...AT_FC,
          status: 'returned',
          status_label: 'Returned to club',
          pending_with: null,
          last_reviewed_by_name: 'Dr. Anusha Iyer',
          last_reviewed_stage: 'associate_hod_review',
          review_comments: 'Add the venue and the faculty member accompanying the students.',
        }}
      />,
    );
    expect(screen.getByText('Sent back by Dr. Anusha Iyer at the Associate HOD stage')).toBeTruthy();
    expect(
      screen.getByText('Add the venue and the faculty member accompanying the students.'),
    ).toBeTruthy();
    expect(screen.getByText(/Resubmitting sends it to the Faculty Coordinator again/)).toBeTruthy();
  });

  it('records both signatures once approved, and points at the claim sheet', () => {
    renderWithClient(<PreApprovalDetail form={PRE_APPROVAL_FIXTURE} />);
    expect(screen.getByText('Approved by Dr. Reynal on 11 Aug 2026')).toBeTruthy();
    expect(screen.getByText('Approved by Dr. Anusha Iyer on 12 Aug 2026')).toBeTruthy();
    expect(screen.getByText('Claim sheet YF-2026-000801')).toBeTruthy();
    expect(screen.getByText('With Claims Coordinator')).toBeTruthy();
  });
});
