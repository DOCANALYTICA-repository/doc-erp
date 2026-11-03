/**
 * The pre-approval editor: the event must start after today (both signatures
 * have to land before it begins), and the student list can be built from the
 * club's members, by register-number lookup, or by hand.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError, api } from '../../../services/api';
import type { EligibleStudent, PreApproval } from '../../../api/types';
import { PRE_APPROVAL_FIXTURE } from '../../yellow-forms/testFixtures';
import { addDays, approvalDeadlineFor, formatDate, todayIst } from '../../yellow-forms';
import { PreApprovalEditor } from './PreApprovalEditor';
import { TEST_CLUB_ID, renderInClubWorkspace } from './testHarness';

// Astryx's dialog restores scroll on unmount, which jsdom does not implement.
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Astryx Button runs clickAction in a transition, which a parallel full-suite
// run can hold back past user-event's return and the 1s default wait.
const SLOW = { timeout: 3000 };

const START = addDays(todayIst(), 10);
const END = addDays(todayIst(), 11);

const ELIGIBLE: EligibleStudent[] = [
  {
    student_id: 'std_2411162',
    register_number: '2411162',
    student_name: 'Shiva Prakash',
    class_name_suggestion: '5 BCom AFA',
    default_role: 'DOC Analytica',
  },
  {
    student_id: 'std_2611507',
    register_number: '2611507',
    student_name: 'Affan Ahmed A',
    class_name_suggestion: '1 BCom SF',
    default_role: 'DOC Analytica',
  },
];

const SAVED: PreApproval = {
  ...PRE_APPROVAL_FIXTURE,
  id: 'paf_new',
  status: 'draft',
  status_label: 'Draft',
  viewer_can_edit: true,
  viewer_can_submit: true,
  viewer_can_delete: true,
};

function stubReads() {
  return vi.spyOn(api, 'get').mockImplementation(((endpoint: string) => {
    if (endpoint.includes('/eligible-students')) return Promise.resolve(ELIGIBLE as never);
    if (endpoint.includes('/student-lookup')) {
      const registerNumber = new URLSearchParams(endpoint.split('?')[1]).get('register_number') ?? '';
      return Promise.resolve(
        (registerNumber === '2511234'
          ? {
              found: true,
              student_id: 'std_2511234',
              register_number: registerNumber,
              student_name: 'Hariharan K',
              class_name_suggestion: '2 BCom',
            }
          : { found: false, register_number: registerNumber }) as never,
      );
    }
    return Promise.resolve([] as never);
  }) as typeof api.get);
}

function renderEditor(form: PreApproval | null = null) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  renderInClubWorkspace(
    <PreApprovalEditor clubId={TEST_CLUB_ID} clubName="DOC Analytica" form={form} onClose={onClose} onSaved={onSaved} />,
  );
  return { onSaved, onClose };
}

async function fillEvent(user: ReturnType<typeof userEvent.setup>, start = START, end = END) {
  await user.type(screen.getByLabelText(/event name/i), 'Acumen — Business Challenge');
  await user.type(screen.getByLabelText(/event starts/i), start);
  await user.type(screen.getByLabelText(/event ends/i), end);
}

describe('PreApprovalEditor', () => {
  it('refuses an event that does not start after today, and writes nothing', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi.spyOn(api, 'post');
    renderEditor();

    await fillEvent(user, todayIst(), todayIst());
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText(/The event must start after today/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the approval deadline, the day before the event', async () => {
    const user = userEvent.setup();
    stubReads();
    renderEditor();

    await user.type(screen.getByLabelText(/event starts/i), START);

    expect(
      await screen.findByText(
        `Needs Faculty Coordinator and Associate HOD approval by ${formatDate(approvalDeadlineFor(START))}`,
      ),
    ).toBeTruthy();
  });

  it('will not submit a pre-approval with no students', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi.spyOn(api, 'post');
    renderEditor();

    await fillEvent(user);
    await user.click(screen.getByRole('button', { name: 'Save & submit for approval' }));

    expect(await screen.findByText('Add at least one student before submitting for approval.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('adds a student by register number, or by name when they have no account', async () => {
    const user = userEvent.setup();
    stubReads();
    renderEditor();

    const lookup = screen.getByLabelText('Add by register number');
    await user.type(lookup, '2511234');
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('Added Hariharan K.', {}, SLOW)).toBeTruthy();
    expect(screen.getByLabelText('Student 1 name')).toHaveValue('Hariharan K');
    expect(screen.getByLabelText('Student 1 class')).toHaveValue('2 BCom');
    expect(screen.getByLabelText('Student 1 role')).toHaveValue('DOC Analytica');

    await user.type(lookup, '2599999{Enter}');
    expect(await screen.findByText(/No student account has register number/, {}, SLOW)).toBeTruthy();
    await user.type(screen.getByLabelText('Student name'), 'Guest Student');
    await user.click(screen.getByRole('button', { name: 'Add student' }));

    expect(await screen.findByText('Added Guest Student.', {}, SLOW)).toBeTruthy();
    expect(screen.getByLabelText('Student 2 register number')).toHaveValue('2599999');
    expect(screen.getByLabelText('Student 2 name')).toHaveValue('Guest Student');
    // Manual entries have no class on file, so it must be typed in.
    expect(screen.getByLabelText('Student 2 class')).toHaveValue('');
  });

  it('adds club members, then saves and submits the list', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(SAVED as never)
      .mockResolvedValueOnce({ ...SAVED, status: 'faculty_coordinator_review', pending_with: 'Dr. Reynal (Faculty Coordinator)' } as never);
    const { onSaved } = renderEditor();

    await fillEvent(user);
    await user.click(screen.getByRole('button', { name: 'Add club members' }));
    await user.click(await screen.findByRole('checkbox', { name: /Affan Ahmed A/ }, SLOW));
    await user.click(screen.getByRole('checkbox', { name: /Shiva Prakash/ }));
    await user.click(screen.getByRole('button', { name: 'Add 2 students' }));
    const role = await screen.findByLabelText('Student 2 role', {}, SLOW);
    await user.clear(role);
    await user.type(role, 'Event lead');

    await user.click(screen.getByRole('button', { name: 'Save & submit for approval' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled(), SLOW);
    expect(post.mock.calls[0]).toEqual([
      `/yellow-forms/clubs/${TEST_CLUB_ID}/pre-approvals`,
      {
        event_name: 'Acumen — Business Challenge',
        event_description: null,
        venue: null,
        event_start_date: START,
        event_end_date: END,
        students: [
          { register_number: '2411162', student_name: 'Shiva Prakash', class_name: '5 BCom AFA', role: 'DOC Analytica' },
          { register_number: '2611507', student_name: 'Affan Ahmed A', class_name: '1 BCom SF', role: 'Event lead' },
        ],
      },
    ]);
    expect(post.mock.calls[1]).toEqual(['/yellow-forms/pre-approvals/paf_new/submit', {}]);
  });

  it('asks for a class when a row has none', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi.spyOn(api, 'post');
    renderEditor();

    await fillEvent(user);
    await user.type(screen.getByLabelText('Add by register number'), '2599999{Enter}');
    await user.type(await screen.findByLabelText('Student name'), 'Guest Student{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Enter the class, e.g. 1 BCom SF.')).toBeTruthy();
    expect(screen.getByLabelText('Student 1 class')).toHaveAttribute('aria-invalid', 'true');
    expect(post).not.toHaveBeenCalled();
  });

  it('edits a returned form in place, showing why it came back', async () => {
    const user = userEvent.setup();
    stubReads();
    const returned: PreApproval = {
      ...SAVED,
      id: 'paf_da_4',
      status: 'returned',
      status_label: 'Returned to club',
      event_start_date: START,
      event_end_date: START,
      venue: null,
      review_comments: 'Add the venue and the faculty member accompanying the students.',
      last_reviewed_by_name: 'Dr. Anusha Iyer',
    };
    const put = vi.spyOn(api, 'put').mockResolvedValue(returned as never);
    renderEditor(returned);

    const notice = screen.getByText('Sent back by Dr. Anusha Iyer').parentElement as HTMLElement;
    expect(within(notice).getByText(returned.review_comments as string)).toBeTruthy();
    expect(screen.getByLabelText('Student 1 name')).toHaveValue('Affan Ahmed A');

    await user.type(screen.getByLabelText(/venue/i), 'Seminar Hall 2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const [endpoint, body] = put.mock.calls[0] as [string, { venue: string; students: unknown[] }];
    expect(endpoint).toBe('/yellow-forms/pre-approvals/paf_da_4');
    expect(body.venue).toBe('Seminar Hall 2');
    expect(body.students).toHaveLength(3);
  });

  it('says nothing was saved when the save itself fails', async () => {
    const user = userEvent.setup();
    stubReads();
    const returned: PreApproval = {
      ...SAVED,
      id: 'paf_da_4',
      status: 'returned',
      status_label: 'Returned to club',
      event_start_date: START,
      event_end_date: END,
    };
    vi.spyOn(api, 'put').mockRejectedValue(
      new ApiError(400, { detail: 'Only a draft or returned pre-approval can be changed.' }),
    );
    const post = vi.spyOn(api, 'post');
    renderEditor(returned);

    await user.click(screen.getByRole('button', { name: 'Save & submit for approval' }));

    expect(await screen.findByText('Only a draft or returned pre-approval can be changed.', {}, SLOW)).toBeTruthy();
    expect(screen.queryByText(/Saved as a draft/)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps the draft it saved when only the submit fails, and says so', async () => {
    const user = userEvent.setup();
    stubReads();
    vi.spyOn(api, 'post')
      .mockResolvedValueOnce(SAVED as never)
      .mockRejectedValueOnce(new ApiError(400, { detail: 'This club has no Faculty Coordinator assigned.' }));
    const { onClose } = renderEditor();

    await fillEvent(user);
    await user.type(screen.getByLabelText('Add by register number'), '2511234{Enter}');
    await screen.findByText('Added Hariharan K.', {}, SLOW);
    await user.click(screen.getByRole('button', { name: 'Save & submit for approval' }));

    expect(
      await screen.findByText('Saved as a draft, but not submitted: This club has no Faculty Coordinator assigned.', {}, SLOW),
    ).toBeTruthy();
    // What was typed is on the server now, so closing has nothing to discard.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledWith(SAVED);
  });

  it('asks before discarding what was typed, whether by Escape or Cancel', async () => {
    const user = userEvent.setup();
    stubReads();
    const { onClose } = renderEditor();

    await user.type(screen.getByLabelText(/event name/i), 'Sheets & Stats Workshop');
    await user.keyboard('{Escape}');
    const confirm = within(await screen.findByRole('alertdialog', { name: 'Discard your changes?' }));
    await user.click(confirm.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/event name/i)).toHaveValue('Sheets & Stats Workshop');

    await user.click(within(screen.getByRole('dialog', { name: 'New pre-approval' })).getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledWith(null);
  });

  it('closes straight away when nothing was changed', async () => {
    const user = userEvent.setup();
    stubReads();
    const { onClose } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledWith(null);
  });

  it('asks for the date in plain words when a date is cleared', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi.spyOn(api, 'post');
    renderEditor();

    await fillEvent(user);
    await user.clear(screen.getByLabelText(/event starts/i));
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Pick the date the event starts.')).toBeTruthy();
    expect(screen.queryByText(/expected string/)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('commits a typed date on Enter and leaves the other fields alone', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi.spyOn(api, 'post');
    renderEditor();

    await user.type(screen.getByLabelText(/event name/i), 'Sheets & Stats Workshop');
    await user.type(screen.getByLabelText(/venue/i), 'Seminar Hall 2');
    await user.type(screen.getByLabelText(/event starts/i), `${START}{Enter}`);
    await user.type(screen.getByLabelText(/event ends/i), `${END}{Enter}`);

    expect(screen.getByLabelText(/event name/i)).toHaveValue('Sheets & Stats Workshop');
    expect(screen.getByLabelText(/venue/i)).toHaveValue('Seminar Hall 2');
    expect(screen.getByLabelText(/event starts/i)).not.toHaveValue('');
    expect(screen.getByLabelText(/event ends/i)).not.toHaveValue('');
    expect(screen.getByLabelText(/event starts/i)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText(/event ends/i)).toHaveAttribute('aria-expanded', 'false');
    expect(post).not.toHaveBeenCalled();
  });

  it('treats a register number typed in another case as the same student', async () => {
    const user = userEvent.setup();
    stubReads();
    const post = vi.spyOn(api, 'post');
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add club members' }));
    await user.click(await screen.findByRole('checkbox', { name: /Affan Ahmed A/ }, SLOW));
    await user.click(screen.getByRole('button', { name: 'Add 1 student' }));
    await screen.findByLabelText('Student 1 register number', {}, SLOW);

    const lookup = screen.getByLabelText('Add by register number');
    await user.type(lookup, '21com5a001{Enter}');
    expect(await screen.findByText(/No student account has register number/, {}, SLOW)).toBeTruthy();
    await user.type(screen.getByLabelText('Student name'), 'Rahul Sharma{Enter}');
    await user.type(screen.getByLabelText('Student 2 class'), '3 BCom');
    const secondRow = screen.getByLabelText('Student 2 register number');
    await user.clear(secondRow);
    await user.type(secondRow, '21com5a001');
    await user.clear(lookup);
    await user.type(lookup, '21COM5A001{Enter}');
    expect(await screen.findByText('21COM5A001 is already on the list.')).toBeTruthy();

    const firstRow = screen.getByLabelText('Student 1 register number');
    await user.clear(firstRow);
    await user.type(firstRow, '21COM5A001');
    await fillEvent(user);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Register number 21COM5A001 is already on the list.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});
