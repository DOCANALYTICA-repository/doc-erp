import React from 'react';
import { Check } from 'lucide-react';

import { useYellowFormWorkflow } from '../../api/hooks';
import type { ClaimSheetPeriod } from '../../api/types';
import { claimSheetRows, type ClaimSheetGridStudent } from './claimSheet';
import { formatAttendance, formatDmy } from './dates';
import { CELL, CompactTable } from './parts';

export interface ClaimSheetGridProps {
  /** A saved sheet's `students`, or `previewStudentsFromGrid(model)` for unsaved edits. */
  students: ClaimSheetGridStudent[];
  /** The period columns. Defaults to the server's vocabulary from GET /yellow-forms/workflow. */
  periods?: ClaimSheetPeriod[];
  caption?: string;
}

/**
 * The claim sheet, read-only, in the department template's column layout:
 * S.No, Register Number, Student Name, Class, Date, one column per period,
 * Attendance With Claims, Attendance Without Claims, Role — one row per
 * student per date, exactly as the CSV export writes it.
 */
export const ClaimSheetGrid: React.FC<ClaimSheetGridProps> = ({
  students,
  periods,
  caption = 'Claim sheet',
}) => {
  const { data: workflow } = useYellowFormWorkflow();
  const columns = periods ?? workflow?.periods;

  if (students.length === 0) {
    return <p className="text-sm text-secondary">No students on this claim sheet yet.</p>;
  }

  if (!columns) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-7 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  const rows = claimSheetRows(students);

  return (
    <CompactTable
      caption={caption}
      wrapHeaders
      headers={[
        { key: 'serial', label: 'S.No', align: 'right' },
        { key: 'register', label: 'Register Number' },
        { key: 'name', label: 'Student Name' },
        { key: 'class', label: 'Class' },
        { key: 'date', label: 'Date' },
        ...columns.map(period => ({
          key: `period-${period.id}`,
          label: period.column,
          title: period.label,
          align: 'center' as const,
        })),
        { key: 'with', label: 'Attendance With Claims', align: 'right' },
        { key: 'without', label: 'Attendance Without Claims', align: 'right' },
        { key: 'role', label: 'Role' },
      ]}
    >
      {rows.map(row => (
        <tr key={row.key}>
          <td className={`${CELL} text-right tabular-nums text-secondary`}>{row.serial}</td>
          <td className={`${CELL} whitespace-nowrap tabular-nums`}>{row.student.register_number}</td>
          <td className={`${CELL} whitespace-nowrap font-medium`}>{row.student.student_name}</td>
          <td className={`${CELL} whitespace-nowrap`}>{row.student.class_name}</td>
          <td className={`${CELL} whitespace-nowrap tabular-nums`}>
            {row.date ? formatDmy(row.date) : <span className="text-secondary">No dates</span>}
          </td>
          {columns.map(period => (
            <td key={period.id} className={`${CELL} text-center`}>
              {row.periods.includes(period.id) ? (
                <Check
                  className="inline h-4 w-4 text-success"
                  role="img"
                  aria-label={`Missed ${period.label}`}
                />
              ) : null}
            </td>
          ))}
          <td className={`${CELL} text-right tabular-nums`}>
            {formatAttendance(row.student.attendance_with_claims) || <span className="text-secondary">—</span>}
          </td>
          <td className={`${CELL} text-right tabular-nums`}>
            {formatAttendance(row.student.attendance_without_claims) || <span className="text-secondary">—</span>}
          </td>
          <td className={`${CELL} whitespace-nowrap`}>{row.student.role}</td>
        </tr>
      ))}
    </CompactTable>
  );
};
