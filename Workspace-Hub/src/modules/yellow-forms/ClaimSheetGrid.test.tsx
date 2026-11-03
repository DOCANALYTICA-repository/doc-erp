import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';

import { ClaimSheetGrid } from './ClaimSheetGrid';
import { ClaimSheetDetail } from './ClaimSheetDetail';
import { renderWithClient } from './renderWithClient';
import { CLAIM_SHEET_FIXTURE, WORKFLOW_FIXTURE } from './testFixtures';

afterEach(() => vi.restoreAllMocks());

const TEMPLATE_HEADER = [
  'S.No', 'Register Number', 'Student Name', 'Class', 'Date',
  'Period 7AM', 'Period 8AM', 'Period 9AM', 'Period 9_45AM', 'Period 10_45AM',
  'Attendance With Claims', 'Attendance Without Claims', 'Role',
];

function cellsOf(row: HTMLElement) {
  return within(row).getAllByRole('cell');
}

describe('ClaimSheetGrid', () => {
  it('uses the department template\'s columns, in order', () => {
    renderWithClient(<ClaimSheetGrid students={CLAIM_SHEET_FIXTURE.students} />);
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent);
    expect(headers).toEqual(TEMPLATE_HEADER);
  });

  it('renders the reference row exactly as the template does', () => {
    renderWithClient(<ClaimSheetGrid students={CLAIM_SHEET_FIXTURE.students} />);
    const [, firstRow] = screen.getAllByRole('row');
    const cells = cellsOf(firstRow);

    expect(cells.map(cell => cell.textContent)).toEqual([
      '1', '2611507', 'Affan Ahmed A', '1 BCom SF', '17/08/2026',
      '', '', '', '', '',
      '97.78', '97.78', 'DOC Analytica',
    ]);
    // Only the 9:45 period is marked, and it is announced, not just drawn.
    expect(within(cells[8]).getByRole('img', { name: 'Missed 9:45 AM' })).toBeTruthy();
    for (const index of [5, 6, 7, 9]) {
      expect(within(cells[index]).queryByRole('img')).toBeNull();
    }
  });

  it('writes one row per student per date, numbered across the sheet', () => {
    renderWithClient(<ClaimSheetGrid students={CLAIM_SHEET_FIXTURE.students} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows.map(row => cellsOf(row)[0].textContent)).toEqual(['1', '2', '3']);
    expect(rows.map(row => cellsOf(row)[4].textContent)).toEqual(['17/08/2026', '17/08/2026', '18/08/2026']);
    // Hariharan's first date misses 8 AM and 9 AM; his overridden role is shown.
    const hariFirst = cellsOf(rows[1]);
    expect(within(hariFirst[6]).getByRole('img', { name: 'Missed 8:00 AM' })).toBeTruthy();
    expect(within(hariFirst[7]).getByRole('img', { name: 'Missed 9:00 AM' })).toBeTruthy();
    expect(hariFirst[12].textContent).toBe('Event lead');
    expect(hariFirst[11].textContent).toBe('88.00');
  });

  it('keeps a student with no dates visible, and marks missing attendance', () => {
    renderWithClient(
      <ClaimSheetGrid
        students={[{ ...CLAIM_SHEET_FIXTURE.students[0], entries: [], attendance_with_claims: null }]}
      />,
    );
    const cells = cellsOf(screen.getAllByRole('row')[1]);
    expect(cells[4].textContent).toBe('No dates');
    expect(cells[10].textContent).toBe('—');
  });

  it('takes its period columns from a prop when given one', () => {
    renderWithClient(
      <ClaimSheetGrid students={CLAIM_SHEET_FIXTURE.students} periods={WORKFLOW_FIXTURE.periods.slice(3)} />,
    );
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent);
    expect(headers).toContain('Period 9_45AM');
    expect(headers).not.toContain('Period 7AM');
  });

  it('lets its long headers wrap, so all 13 columns fit a review drawer', () => {
    renderWithClient(<ClaimSheetGrid students={CLAIM_SHEET_FIXTURE.students} />);
    // A max-content table pushed attendance and role off the drawer's right edge.
    expect(screen.getByRole('table').className).not.toContain('min-w-max');
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header.className).not.toContain('whitespace-nowrap');
    }
  });

  it('says so when the sheet has no students', () => {
    renderWithClient(<ClaimSheetGrid students={[]} />);
    expect(screen.getByText(/no students on this claim sheet yet/i)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('ClaimSheetDetail', () => {
  it('shows the sheet, its stage and the attached pre-approved list', () => {
    renderWithClient(<ClaimSheetDetail sheet={CLAIM_SHEET_FIXTURE} />);

    expect(screen.getByRole('heading', { name: 'Excel Masterclass' })).toBeTruthy();
    expect(screen.getByText(/pre-approved by Dr\. Reynal \(Faculty Coordinator\) on 11 Aug 2026 and Dr\. Anusha Iyer \(Associate HOD\) on 12 Aug 2026/i)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Students pre-approved for this event' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Claim sheet YF-2026-000801' })).toBeTruthy();

    const progress = screen.getByRole('list', { name: 'Claim sheet progress' });
    expect(within(progress).getByRole('img', { name: 'In progress' })).toBeTruthy();
    expect(within(progress).getByText('Claims Coordinator')).toBeTruthy();
  });

  it('shows a listed student only their own attendance, and says why', () => {
    const [affan, hari] = CLAIM_SHEET_FIXTURE.students;
    renderWithClient(
      <ClaimSheetDetail
        sheet={{
          ...CLAIM_SHEET_FIXTURE,
          students: [affan, { ...hari, attendance_with_claims: null, attendance_without_claims: null }],
          attendance_redacted: true,
          viewer_can_export: false,
        }}
      />,
    );
    expect(screen.getByText(/Attendance is shown only for you/)).toBeTruthy();
    const rows = within(screen.getByRole('table', { name: 'Claim sheet YF-2026-000801' })).getAllByRole('row');
    expect(cellsOf(rows[1]).slice(10, 12).map(cell => cell.textContent)).toEqual(['97.78', '97.78']);
    for (const row of rows.slice(2)) {
      expect(cellsOf(row).slice(10, 12).map(cell => cell.textContent)).toEqual(['—', '—']);
    }
  });

  it('puts the Claims Coordinator\'s reason up front on a returned sheet', () => {
    renderWithClient(
      <ClaimSheetDetail
        sheet={{
          ...CLAIM_SHEET_FIXTURE,
          status: 'returned',
          status_label: 'Returned to club',
          reviewed_by_name: 'Sharath',
          review_comments: 'Please re-check the 8 AM period for Hariharan.',
          late_submission_flag: true,
        }}
      />,
    );
    expect(screen.getByText('Sent back by Sharath')).toBeTruthy();
    expect(screen.getByText('Please re-check the 8 AM period for Hariharan.')).toBeTruthy();
    expect(screen.getByText('Filed late')).toBeTruthy();
  });
});
