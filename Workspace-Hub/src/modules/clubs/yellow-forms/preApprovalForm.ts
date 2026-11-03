import { z } from 'zod';

import type {
  EligibleStudent,
  PreApproval,
  PreApprovalCreate,
  StudentLookup,
} from '../../../api/types';
import { MAX_EVENT_DAYS, daysBetween, isValidIsoDate, todayIst } from '../../yellow-forms';

/** Limits mirror backend/app/schemas/yellow_form.py, so a save never fails on length. */
const studentRowSchema = z.object({
  /** Only used to tell which club members are already listed; the server links by register number. */
  student_id: z.string().nullable(),
  // Upper-cased like the server, so 21com5a001 and 21COM5A001 are one student.
  register_number: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Enter the register number.')
    .max(20, 'A register number is at most 20 characters.'),
  student_name: z
    .string()
    .trim()
    .min(1, "Enter the student's name.")
    .max(120, 'A name is at most 120 characters.'),
  class_name: z
    .string()
    .trim()
    .min(1, 'Enter the class, e.g. 1 BCom SF.')
    .max(60, 'A class is at most 60 characters.'),
  role: z
    .string()
    .trim()
    .min(1, 'Enter a role, e.g. the club name.')
    .max(80, 'A role is at most 80 characters.'),
});

export const preApprovalFormSchema = z
  .object({
    event_name: z
      .string()
      .trim()
      .min(1, 'Name the event.')
      .max(150, 'An event name is at most 150 characters.'),
    event_description: z.string().trim().max(2000, 'Keep the description under 2,000 characters.'),
    venue: z.string().trim().max(150, 'A venue is at most 150 characters.'),
    event_start_date: z
      .string()
      .min(1, 'Pick the date the event starts.')
      .refine(
        value => !isValidIsoDate(value) || value > todayIst(),
        'The event must start after today — pre-approval has to be granted before it begins.',
      ),
    event_end_date: z.string().min(1, 'Pick the date the event ends.'),
    students: z.array(studentRowSchema),
  })
  .superRefine((values, ctx) => {
    const { event_start_date: start, event_end_date: end } = values;
    if (isValidIsoDate(start) && isValidIsoDate(end)) {
      const span = daysBetween(start, end);
      if (span < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['event_end_date'],
          message: 'The event cannot end before it starts.',
        });
      } else if (span > MAX_EVENT_DAYS) {
        ctx.addIssue({
          code: 'custom',
          path: ['event_end_date'],
          message: `A pre-approval can cover at most ${MAX_EVENT_DAYS} days — split longer events into separate forms.`,
        });
      }
    }

    const seen = new Set<string>();
    values.students.forEach((student, index) => {
      const registerNumber = student.register_number;
      if (!registerNumber) return;
      if (seen.has(registerNumber)) {
        ctx.addIssue({
          code: 'custom',
          path: ['students', index, 'register_number'],
          message: `Register number ${registerNumber} is already on the list.`,
        });
      }
      seen.add(registerNumber);
    });
  });

export type PreApprovalFormValues = z.input<typeof preApprovalFormSchema>;
export type PreApprovalFormOutput = z.output<typeof preApprovalFormSchema>;
export type StudentRow = PreApprovalFormValues['students'][number];

export function preApprovalFormDefaults(form: PreApproval | null): PreApprovalFormValues {
  return {
    event_name: form?.event_name ?? '',
    event_description: form?.event_description ?? '',
    venue: form?.venue ?? '',
    event_start_date: form?.event_start_date ?? '',
    event_end_date: form?.event_end_date ?? '',
    students: (form?.students ?? []).map(student => ({
      student_id: student.student_id ?? null,
      register_number: student.register_number,
      student_name: student.student_name,
      class_name: student.class_name,
      role: student.role,
    })),
  };
}

/** The POST/PUT body. Blank optional text goes as null; `students` replaces the list. */
export function toPreApprovalBody(values: PreApprovalFormOutput): PreApprovalCreate {
  return {
    event_name: values.event_name,
    event_description: values.event_description || null,
    venue: values.venue || null,
    event_start_date: values.event_start_date,
    event_end_date: values.event_end_date,
    students: values.students.map(student => ({
      register_number: student.register_number,
      student_name: student.student_name,
      class_name: student.class_name,
      role: student.role,
    })),
  };
}

export function rowFromEligible(student: EligibleStudent): StudentRow {
  return {
    student_id: student.student_id,
    register_number: student.register_number,
    student_name: student.student_name,
    class_name: student.class_name_suggestion,
    role: student.default_role,
  };
}

export function rowFromLookup(lookup: StudentLookup, role: string, manualName = ''): StudentRow {
  return {
    student_id: lookup.found ? (lookup.student_id ?? null) : null,
    register_number: lookup.register_number,
    student_name: lookup.found ? (lookup.student_name ?? '') : manualName.trim(),
    class_name: lookup.found ? (lookup.class_name_suggestion ?? '') : '',
    role,
  };
}

/** A register number as the server stores it: trimmed and upper-cased. */
export function normaliseRegisterNumber(value: string): string {
  return value.trim().toUpperCase();
}

/** Whether a club member is already on the list, by account or by register number. */
export function isListed(
  rows: Pick<StudentRow, 'student_id' | 'register_number'>[],
  candidate: { student_id?: string | null; register_number: string },
): boolean {
  const registerNumber = normaliseRegisterNumber(candidate.register_number);
  return rows.some(
    row =>
      (candidate.student_id && row.student_id === candidate.student_id) ||
      (registerNumber !== '' && normaliseRegisterNumber(row.register_number) === registerNumber),
  );
}
