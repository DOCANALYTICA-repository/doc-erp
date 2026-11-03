import type {
  ClaimSheet,
  ClaimSheetEntry,
  ClaimSheetStudent,
  ClaimSheetUpsert,
  PreApprovalStudent,
} from '../../api/types';
import { eventDates } from './dates';

/** What a claim sheet is built from: the event window and the pre-approved list. */
export interface ClaimGridSource {
  event_start_date: string;
  event_end_date: string;
  students: PreApprovalStudent[];
}

/** One pre-approved student on the claim-sheet editor. */
export interface ClaimGridStudent {
  preApprovalStudentId: string;
  registerNumber: string;
  studentName: string;
  className: string;
  /** The role on the pre-approval; a blank `role` falls back to it on the server. */
  preApprovedRole: string;
  included: boolean;
  role: string;
  /** Raw input text, so a half-typed "97." survives a re-render. Parsed on save. */
  attendanceWithClaims: string;
  attendanceWithoutClaims: string;
  /** ISO date -> missed period ids, in vocabulary order. A date with none may be absent. */
  periodsByDate: Record<string, string[]>;
}

export interface ClaimGridModel {
  /** Every event date, in order — the grid's rows per student. */
  dates: string[];
  students: ClaimGridStudent[];
}

export type ClaimGridMode = 'draft' | 'submit';

export type ClaimGridField =
  | 'students'
  | 'periods'
  | 'attendance_with_claims'
  | 'attendance_without_claims'
  | 'role';

export interface ClaimGridIssue {
  /** Null for sheet-level issues, e.g. "no students included". */
  preApprovalStudentId: string | null;
  field: ClaimGridField;
  message: string;
}

/** The shape ClaimSheetGrid renders; a saved ClaimSheetStudent satisfies it. */
export type ClaimSheetGridStudent = Pick<
  ClaimSheetStudent,
  | 'id'
  | 'register_number'
  | 'student_name'
  | 'class_name'
  | 'role'
  | 'attendance_with_claims'
  | 'attendance_without_claims'
> & { entries: Pick<ClaimSheetEntry, 'date' | 'periods'>[] };

export interface ClaimSheetRow {
  key: string;
  /** S.No — counts rows, as the exported sheet does. */
  serial: number;
  student: ClaimSheetGridStudent;
  /** Null for a student who has no dates yet (drafts only). */
  date: string | null;
  periods: string[];
}

/** Mirrors the server's role limit on ClaimSheetStudentIn. */
export const MAX_ROLE_LENGTH = 80;

/** A claim sheet's event window and attached pre-approved list, as a grid source. */
export function claimGridSourceFromSheet(sheet: ClaimSheet): ClaimGridSource {
  return {
    event_start_date: sheet.event_start_date,
    event_end_date: sheet.event_end_date,
    students: sheet.pre_approval.students,
  };
}

function sortPeriods(periods: string[], periodOrder?: string[]): string[] {
  if (!periodOrder || periodOrder.length === 0) return [...periods];
  const rank = (id: string) => {
    const index = periodOrder.indexOf(id);
    return index === -1 ? periodOrder.length : index;
  };
  return [...periods].sort((a, b) => rank(a) - rank(b));
}

/**
 * The editable grid for a pre-approval, seeded from the saved sheet if any.
 *
 * Every pre-approved student gets a row. On a fresh (or still empty) sheet
 * they are all included by default; once a sheet has students, only those are
 * included, so a deliberate exclusion survives a reload. Entries dated outside
 * the event window are dropped — the server would refuse them.
 */
export function buildClaimGrid(
  source: ClaimGridSource,
  sheet?: Pick<ClaimSheet, 'students'> | null,
): ClaimGridModel {
  const dates = eventDates(source.event_start_date, source.event_end_date);
  const inWindow = new Set(dates);
  const saved = new Map(
    (sheet?.students ?? []).map(student => [student.pre_approval_student_id, student]),
  );
  const includeAll = saved.size === 0;

  return {
    dates,
    students: source.students.map(listed => {
      const row = saved.get(listed.id);
      const periodsByDate: Record<string, string[]> = {};
      for (const entry of row?.entries ?? []) {
        if (inWindow.has(entry.date) && entry.periods.length > 0) {
          periodsByDate[entry.date] = [...entry.periods];
        }
      }
      return {
        preApprovalStudentId: listed.id,
        registerNumber: listed.register_number,
        studentName: listed.student_name,
        className: listed.class_name,
        preApprovedRole: listed.role,
        included: includeAll || row !== undefined,
        role: row?.role ?? listed.role,
        attendanceWithClaims: toAttendanceText(row?.attendance_with_claims),
        attendanceWithoutClaims: toAttendanceText(row?.attendance_without_claims),
        periodsByDate,
      };
    }),
  };
}

export function toAttendanceText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export type AttendanceParse =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'not_a_number' | 'out_of_range' | 'too_precise' };

/** Blank is `null` (allowed on a draft); anything else must be 0–100 with at most 2 decimals. */
export function parseAttendance(text: string): AttendanceParse {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  // Plain decimals only: Number() would also accept "0x10" and "1e2".
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return { ok: false, reason: 'not_a_number' };
  const value = Number(trimmed);
  if (value < 0 || value > 100) return { ok: false, reason: 'out_of_range' };
  if (Math.abs(Math.round(value * 100) / 100 - value) > 1e-9) {
    return { ok: false, reason: 'too_precise' };
  }
  return { ok: true, value };
}

export function updateGridStudent(
  model: ClaimGridModel,
  preApprovalStudentId: string,
  patch: Partial<
    Pick<ClaimGridStudent, 'included' | 'role' | 'attendanceWithClaims' | 'attendanceWithoutClaims'>
  >,
): ClaimGridModel {
  return {
    ...model,
    students: model.students.map(student =>
      student.preApprovalStudentId === preApprovalStudentId ? { ...student, ...patch } : student,
    ),
  };
}

export function setStudentIncluded(
  model: ClaimGridModel,
  preApprovalStudentId: string,
  included: boolean,
): ClaimGridModel {
  return updateGridStudent(model, preApprovalStudentId, { included });
}

/** Tick or untick one period for one student on one date, keeping vocabulary order. */
export function togglePeriod(
  model: ClaimGridModel,
  preApprovalStudentId: string,
  date: string,
  periodId: string,
  periodOrder?: string[],
): ClaimGridModel {
  return {
    ...model,
    students: model.students.map(student => {
      if (student.preApprovalStudentId !== preApprovalStudentId) return student;
      const current = student.periodsByDate[date] ?? [];
      const next = current.includes(periodId)
        ? current.filter(id => id !== periodId)
        : sortPeriods([...current, periodId], periodOrder);
      return { ...student, periodsByDate: { ...student.periodsByDate, [date]: next } };
    }),
  };
}

/** The dates a student has at least one period ticked on, in order. */
export function datesWithPeriods(student: ClaimGridStudent, dates: string[]): string[] {
  return dates.filter(date => (student.periodsByDate[date] ?? []).length > 0);
}

/**
 * The PUT/POST body for a grid: included students only, and only the dates
 * that have at least one period ticked. Unparseable attendance is sent as null
 * — run validateClaimGrid first so that never happens silently.
 */
export function toClaimSheetUpsert(model: ClaimGridModel, periodOrder?: string[]): ClaimSheetUpsert {
  return {
    students: model.students
      .filter(student => student.included)
      .map(student => {
        const withClaims = parseAttendance(student.attendanceWithClaims);
        const withoutClaims = parseAttendance(student.attendanceWithoutClaims);
        const role = student.role.trim();
        return {
          pre_approval_student_id: student.preApprovalStudentId,
          attendance_with_claims: withClaims.ok ? withClaims.value : null,
          attendance_without_claims: withoutClaims.ok ? withoutClaims.value : null,
          role: role === '' ? null : role,
          entries: datesWithPeriods(student, model.dates).map(date => ({
            date,
            periods: sortPeriods(student.periodsByDate[date], periodOrder),
          })),
        };
      }),
  };
}

function who(student: ClaimGridStudent): string {
  return `${student.studentName} (${student.registerNumber})`;
}

const ATTENDANCE_LABEL: Record<'attendance_with_claims' | 'attendance_without_claims', string> = {
  attendance_with_claims: 'attendance with claims',
  attendance_without_claims: 'attendance without claims',
};

/**
 * The server's claim-sheet rules, checked before a request is made.
 *
 * Both modes: attendance, when given, is 0–100 with at most 2 decimals, and
 * without-claims never exceeds with-claims; roles fit the limit. Submit also
 * needs at least one included student, and for every included student at
 * least one ticked period and both attendance figures. Excluded students are
 * not checked. Messages match the server's wording.
 */
export function validateClaimGrid(model: ClaimGridModel, mode: ClaimGridMode): ClaimGridIssue[] {
  const issues: ClaimGridIssue[] = [];
  const included = model.students.filter(student => student.included);

  if (mode === 'submit' && included.length === 0) {
    issues.push({
      preApprovalStudentId: null,
      field: 'students',
      message: 'Add at least one student before submitting the claim sheet.',
    });
  }

  for (const student of included) {
    const id = student.preApprovalStudentId;
    const parsed = {
      attendance_with_claims: parseAttendance(student.attendanceWithClaims),
      attendance_without_claims: parseAttendance(student.attendanceWithoutClaims),
    } as const;

    for (const field of ['attendance_with_claims', 'attendance_without_claims'] as const) {
      const result = parsed[field];
      const label = ATTENDANCE_LABEL[field];
      if (!result.ok) {
        const message =
          result.reason === 'not_a_number'
            ? `${who(student)}: ${label} must be a number.`
            : result.reason === 'out_of_range'
              ? `${who(student)}: ${label} must be between 0 and 100.`
              : `${who(student)}: ${label} can have at most 2 decimal places.`;
        issues.push({ preApprovalStudentId: id, field, message });
      } else if (mode === 'submit' && result.value === null) {
        issues.push({ preApprovalStudentId: id, field, message: `${who(student)}: enter ${label}.` });
      }
    }

    const withClaims = parsed.attendance_with_claims;
    const withoutClaims = parsed.attendance_without_claims;
    if (
      withClaims.ok && withoutClaims.ok &&
      withClaims.value !== null && withoutClaims.value !== null &&
      withoutClaims.value > withClaims.value
    ) {
      issues.push({
        preApprovalStudentId: id,
        field: 'attendance_without_claims',
        message:
          `${who(student)}: attendance without claims (${withoutClaims.value}) cannot be higher ` +
          `than attendance with claims (${withClaims.value}).`,
      });
    }

    if (student.role.trim().length > MAX_ROLE_LENGTH) {
      issues.push({
        preApprovalStudentId: id,
        field: 'role',
        message: `${who(student)}: role can be at most ${MAX_ROLE_LENGTH} characters.`,
      });
    }

    if (mode === 'submit' && datesWithPeriods(student, model.dates).length === 0) {
      issues.push({
        preApprovalStudentId: id,
        field: 'periods',
        message: `${who(student)}: tick at least one period they missed, or exclude them from the sheet.`,
      });
    }
  }

  return issues;
}

/** The issues for one student, optionally narrowed to one field. */
export function issuesFor(
  issues: ClaimGridIssue[],
  preApprovalStudentId: string | null,
  field?: ClaimGridField,
): ClaimGridIssue[] {
  return issues.filter(
    issue =>
      issue.preApprovalStudentId === preApprovalStudentId &&
      (field === undefined || issue.field === field),
  );
}

/** How big the sheet will be: included students and (student, date) rows. */
export function claimGridSummary(model: ClaimGridModel): { studentCount: number; rowCount: number } {
  const included = model.students.filter(student => student.included);
  return {
    studentCount: included.length,
    rowCount: included.reduce(
      (total, student) => total + datesWithPeriods(student, model.dates).length,
      0,
    ),
  };
}

/** The grid as ClaimSheetGrid renders it, for a "preview as exported" view of unsaved edits. */
export function previewStudentsFromGrid(
  model: ClaimGridModel,
  periodOrder?: string[],
): ClaimSheetGridStudent[] {
  const payload = toClaimSheetUpsert(model, periodOrder);
  const byId = new Map(model.students.map(student => [student.preApprovalStudentId, student]));
  return payload.students.map(row => {
    const student = byId.get(row.pre_approval_student_id)!;
    return {
      id: row.pre_approval_student_id,
      register_number: student.registerNumber,
      student_name: student.studentName,
      class_name: student.className,
      role: row.role ?? student.preApprovedRole,
      attendance_with_claims: row.attendance_with_claims ?? null,
      attendance_without_claims: row.attendance_without_claims ?? null,
      entries: row.entries,
    };
  });
}

/**
 * One row per (student, date), in the order the export writes them. A student
 * with no dates still gets one row, so a draft never hides anyone.
 */
export function claimSheetRows(students: ClaimSheetGridStudent[]): ClaimSheetRow[] {
  const rows: ClaimSheetRow[] = [];
  for (const student of students) {
    const entries = [...student.entries].sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length === 0) {
      rows.push({ key: `${student.id}:none`, serial: rows.length + 1, student, date: null, periods: [] });
      continue;
    }
    for (const entry of entries) {
      rows.push({
        key: `${student.id}:${entry.date}`,
        serial: rows.length + 1,
        student,
        date: entry.date,
        periods: entry.periods,
      });
    }
  }
  return rows;
}
