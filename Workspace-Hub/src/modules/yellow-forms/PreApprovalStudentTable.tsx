import React from 'react';

import type { PreApprovalStudent } from '../../api/types';
import { CELL, CompactTable } from './parts';

/** The students on a pre-approval: S.No, Register Number, Student Name, Class, Role. */
export const PreApprovalStudentTable: React.FC<{
  students: PreApprovalStudent[];
  caption?: string;
}> = ({ students, caption = 'Pre-approved students' }) => {
  if (students.length === 0) {
    return <p className="text-sm text-secondary">No students listed yet.</p>;
  }

  return (
    <CompactTable
      caption={caption}
      headers={[
        { key: 'serial', label: 'S.No', align: 'right' },
        { key: 'register', label: 'Register Number' },
        { key: 'name', label: 'Student Name' },
        { key: 'class', label: 'Class' },
        { key: 'role', label: 'Role' },
      ]}
    >
      {students.map((student, index) => (
        <tr key={student.id}>
          <td className={`${CELL} text-right tabular-nums text-secondary`}>{index + 1}</td>
          <td className={`${CELL} whitespace-nowrap tabular-nums`}>{student.register_number}</td>
          <td className={`${CELL} font-medium`}>{student.student_name}</td>
          <td className={`${CELL} whitespace-nowrap`}>{student.class_name}</td>
          <td className={CELL}>{student.role}</td>
        </tr>
      ))}
    </CompactTable>
  );
};
