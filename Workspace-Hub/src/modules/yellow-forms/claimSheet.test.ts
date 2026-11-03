import { describe, it, expect } from 'vitest';

import {
  buildClaimGrid,
  claimGridSourceFromSheet,
  claimGridSummary,
  claimSheetRows,
  issuesFor,
  parseAttendance,
  previewStudentsFromGrid,
  setStudentIncluded,
  toClaimSheetUpsert,
  togglePeriod,
  updateGridStudent,
  validateClaimGrid,
  type ClaimGridModel,
} from './claimSheet';
import { CLAIM_SHEET_FIXTURE, PERIOD_ORDER, PRE_APPROVAL_FIXTURE } from './testFixtures';

function freshGrid(): ClaimGridModel {
  return buildClaimGrid(PRE_APPROVAL_FIXTURE, null);
}

/** A grid where every included student is complete and valid for submit. */
function completeGrid(): ClaimGridModel {
  let model = freshGrid();
  for (const student of model.students) {
    model = togglePeriod(model, student.preApprovalStudentId, '2026-08-17', '9_45AM', PERIOD_ORDER);
    model = updateGridStudent(model, student.preApprovalStudentId, {
      attendanceWithClaims: '97.78',
      attendanceWithoutClaims: '95',
    });
  }
  return model;
}

describe('buildClaimGrid', () => {
  it('gives every pre-approved student a row, all included, on a new sheet', () => {
    const model = freshGrid();
    expect(model.dates).toEqual(['2026-08-17', '2026-08-18']);
    expect(model.students.map(s => s.preApprovalStudentId)).toEqual(['pas_affan', 'pas_hari', 'pas_meera']);
    expect(model.students.every(s => s.included)).toBe(true);
    expect(model.students[2].role).toBe('Volunteer');
    expect(model.students[0].attendanceWithClaims).toBe('');
    expect(model.students[0].periodsByDate).toEqual({});
  });

  it('seeds from a saved sheet and keeps a deliberate exclusion', () => {
    const model = buildClaimGrid(PRE_APPROVAL_FIXTURE, CLAIM_SHEET_FIXTURE);
    const [affan, hari, meera] = model.students;

    expect(affan.included).toBe(true);
    expect(affan.periodsByDate).toEqual({ '2026-08-17': ['9_45AM'] });
    expect(affan.attendanceWithClaims).toBe('97.78');

    expect(hari.role).toBe('Event lead');
    expect(hari.periodsByDate).toEqual({ '2026-08-17': ['8AM', '9AM'], '2026-08-18': ['7AM'] });
    expect(hari.attendanceWithoutClaims).toBe('88');

    // Not on the saved sheet: excluded, not silently re-added.
    expect(meera.included).toBe(false);
  });

  it('includes everyone when the saved sheet has no students yet', () => {
    const model = buildClaimGrid(PRE_APPROVAL_FIXTURE, { students: [] });
    expect(model.students.every(s => s.included)).toBe(true);
  });

  it('drops saved entries dated outside the event', () => {
    const sheet = {
      students: [{
        ...CLAIM_SHEET_FIXTURE.students[0],
        entries: [{ id: 'x', date: '2026-08-20', periods: ['7AM'] }],
      }],
    };
    expect(buildClaimGrid(PRE_APPROVAL_FIXTURE, sheet).students[0].periodsByDate).toEqual({});
  });

  it('builds from a claim sheet alone, via its attached pre-approved list', () => {
    const model = buildClaimGrid(claimGridSourceFromSheet(CLAIM_SHEET_FIXTURE), CLAIM_SHEET_FIXTURE);
    expect(model.students).toHaveLength(3);
    expect(model.dates).toEqual(['2026-08-17', '2026-08-18']);
  });
});

describe('grid updates', () => {
  it('toggles periods in vocabulary order, and off again', () => {
    let model = freshGrid();
    model = togglePeriod(model, 'pas_affan', '2026-08-17', '10_45AM', PERIOD_ORDER);
    model = togglePeriod(model, 'pas_affan', '2026-08-17', '7AM', PERIOD_ORDER);
    expect(model.students[0].periodsByDate['2026-08-17']).toEqual(['7AM', '10_45AM']);

    model = togglePeriod(model, 'pas_affan', '2026-08-17', '7AM', PERIOD_ORDER);
    expect(model.students[0].periodsByDate['2026-08-17']).toEqual(['10_45AM']);
    // Other students are untouched.
    expect(model.students[1].periodsByDate).toEqual({});
  });

  it('does not mutate the model it was given', () => {
    const model = freshGrid();
    togglePeriod(model, 'pas_affan', '2026-08-17', '7AM', PERIOD_ORDER);
    setStudentIncluded(model, 'pas_affan', false);
    expect(model.students[0].periodsByDate).toEqual({});
    expect(model.students[0].included).toBe(true);
  });
});

describe('toClaimSheetUpsert', () => {
  it('sends included students only, and only dates with a period ticked', () => {
    let model = completeGrid();
    model = setStudentIncluded(model, 'pas_meera', false);
    model = togglePeriod(model, 'pas_hari', '2026-08-18', '8AM', PERIOD_ORDER);
    model = togglePeriod(model, 'pas_hari', '2026-08-18', '7AM', PERIOD_ORDER);
    // Ticked then unticked: an empty date must not be sent.
    model = togglePeriod(model, 'pas_affan', '2026-08-18', '7AM', PERIOD_ORDER);
    model = togglePeriod(model, 'pas_affan', '2026-08-18', '7AM', PERIOD_ORDER);

    const payload = toClaimSheetUpsert(model, PERIOD_ORDER);

    expect(payload.students.map(s => s.pre_approval_student_id)).toEqual(['pas_affan', 'pas_hari']);
    expect(payload.students[0]).toEqual({
      pre_approval_student_id: 'pas_affan',
      attendance_with_claims: 97.78,
      attendance_without_claims: 95,
      role: 'DOC Analytica',
      entries: [{ date: '2026-08-17', periods: ['9_45AM'] }],
    });
    expect(payload.students[1].entries).toEqual([
      { date: '2026-08-17', periods: ['9_45AM'] },
      { date: '2026-08-18', periods: ['7AM', '8AM'] },
    ]);
  });

  it('sends blank attendance and a blank role as null', () => {
    let model = freshGrid();
    model = updateGridStudent(model, 'pas_affan', { role: '   ' });
    const [affan] = toClaimSheetUpsert(model).students;
    expect(affan.attendance_with_claims).toBeNull();
    expect(affan.attendance_without_claims).toBeNull();
    expect(affan.role).toBeNull();
    expect(affan.entries).toEqual([]);
  });
});

describe('parseAttendance', () => {
  it('accepts blank, integers and up to two decimals within 0–100', () => {
    expect(parseAttendance('')).toEqual({ ok: true, value: null });
    expect(parseAttendance(' 97.78 ')).toEqual({ ok: true, value: 97.78 });
    expect(parseAttendance('0')).toEqual({ ok: true, value: 0 });
    expect(parseAttendance('100')).toEqual({ ok: true, value: 100 });
  });

  it('refuses anything else, and says why', () => {
    expect(parseAttendance('abc')).toEqual({ ok: false, reason: 'not_a_number' });
    expect(parseAttendance('0x10')).toEqual({ ok: false, reason: 'not_a_number' });
    expect(parseAttendance('9 7')).toEqual({ ok: false, reason: 'not_a_number' });
    expect(parseAttendance('100.01')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseAttendance('-1')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseAttendance('97.785')).toEqual({ ok: false, reason: 'too_precise' });
  });
});

describe('validateClaimGrid', () => {
  it('passes a complete sheet for submit', () => {
    expect(validateClaimGrid(completeGrid(), 'submit')).toEqual([]);
  });

  it('lets a draft be saved half-finished', () => {
    expect(validateClaimGrid(freshGrid(), 'draft')).toEqual([]);
  });

  it('refuses attendance without claims above attendance with claims, in either mode', () => {
    const model = updateGridStudent(completeGrid(), 'pas_hari', {
      attendanceWithClaims: '80',
      attendanceWithoutClaims: '85.5',
    });
    for (const mode of ['draft', 'submit'] as const) {
      const issues = validateClaimGrid(model, mode);
      expect(issues).toEqual([{
        preApprovalStudentId: 'pas_hari',
        field: 'attendance_without_claims',
        message:
          'Hariharan K (2511234): attendance without claims (85.5) cannot be higher than ' +
          'attendance with claims (80).',
      }]);
    }
  });

  it('refuses out-of-range and over-precise attendance', () => {
    const model = updateGridStudent(freshGrid(), 'pas_affan', {
      attendanceWithClaims: '101',
      attendanceWithoutClaims: '12.345',
    });
    const issues = issuesFor(validateClaimGrid(model, 'draft'), 'pas_affan');
    expect(issues.map(i => i.message)).toEqual([
      'Affan Ahmed A (2611507): attendance with claims must be between 0 and 100.',
      'Affan Ahmed A (2611507): attendance without claims can have at most 2 decimal places.',
    ]);
  });

  it('needs at least one period for every included student at submit', () => {
    let model = completeGrid();
    model = togglePeriod(model, 'pas_meera', '2026-08-17', '9_45AM', PERIOD_ORDER);
    const issues = validateClaimGrid(model, 'submit');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ preApprovalStudentId: 'pas_meera', field: 'periods' });
    expect(issues[0].message).toMatch(/tick at least one period/i);

    // Excluding the student instead is also a fix.
    expect(validateClaimGrid(setStudentIncluded(model, 'pas_meera', false), 'submit')).toEqual([]);
  });

  it('needs both attendance figures at submit', () => {
    const model = updateGridStudent(completeGrid(), 'pas_affan', { attendanceWithoutClaims: '' });
    const issues = validateClaimGrid(model, 'submit');
    expect(issues).toEqual([{
      preApprovalStudentId: 'pas_affan',
      field: 'attendance_without_claims',
      message: 'Affan Ahmed A (2611507): enter attendance without claims.',
    }]);
  });

  it('needs at least one included student at submit', () => {
    let model = completeGrid();
    for (const id of ['pas_affan', 'pas_hari', 'pas_meera']) model = setStudentIncluded(model, id, false);
    expect(validateClaimGrid(model, 'submit')).toEqual([{
      preApprovalStudentId: null,
      field: 'students',
      message: 'Add at least one student before submitting the claim sheet.',
    }]);
  });

  it('does not check excluded students', () => {
    let model = updateGridStudent(completeGrid(), 'pas_meera', { attendanceWithClaims: 'lots' });
    model = setStudentIncluded(model, 'pas_meera', false);
    expect(validateClaimGrid(model, 'submit')).toEqual([]);
  });

  it('refuses an over-long role', () => {
    const model = updateGridStudent(freshGrid(), 'pas_affan', { role: 'x'.repeat(81) });
    expect(issuesFor(validateClaimGrid(model, 'draft'), 'pas_affan', 'role')).toHaveLength(1);
  });
});

describe('sheet rows and summaries', () => {
  it('lays a saved sheet out one row per student per date, numbered like the export', () => {
    const rows = claimSheetRows(CLAIM_SHEET_FIXTURE.students);
    expect(rows.map(r => [r.serial, r.student.register_number, r.date, r.periods])).toEqual([
      [1, '2611507', '2026-08-17', ['9_45AM']],
      [2, '2511234', '2026-08-17', ['8AM', '9AM']],
      [3, '2511234', '2026-08-18', ['7AM']],
    ]);
  });

  it('still shows a student who has no dates yet', () => {
    const rows = claimSheetRows([{ ...CLAIM_SHEET_FIXTURE.students[0], entries: [] }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBeNull();
  });

  it('summarises and previews unsaved edits', () => {
    let model = completeGrid();
    model = setStudentIncluded(model, 'pas_meera', false);
    model = togglePeriod(model, 'pas_hari', '2026-08-18', '7AM', PERIOD_ORDER);
    expect(claimGridSummary(model)).toEqual({ studentCount: 2, rowCount: 3 });

    const preview = previewStudentsFromGrid(model, PERIOD_ORDER);
    expect(preview.map(s => s.student_name)).toEqual(['Affan Ahmed A', 'Hariharan K']);
    expect(claimSheetRows(preview)).toHaveLength(3);
  });
});
