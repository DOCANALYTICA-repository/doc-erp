import React from 'react';
import { Clock } from 'lucide-react';

import type { PendingApproval } from '../../../api/types';

/**
 * Who has yet to sign.
 *
 * "Under review" answered which desk a claim was on and never which person,
 * and at the subject-faculty stage that is the only question worth asking:
 * the claim waits on every subject faculty member independently, so the same
 * three words covered "one signature outstanding" and "four".
 */
export const PendingApprovals: React.FC<{
  pending: PendingApproval[];
  /** `inline` is the compact form used inside a table cell. */
  variant?: 'inline' | 'block';
}> = ({ pending, variant = 'block' }) => {
  if (pending.length === 0) {
    return <span className="text-sm text-secondary">—</span>;
  }

  // A co-taught hour needs one signature from either teacher, hence "or".
  const describe = (p: PendingApproval) =>
    p.faculty_name
      ? [p.faculty_name, p.co_faculty_name].filter(Boolean).join(' or ')
      : `${p.role} (unassigned)`;

  if (variant === 'inline') {
    return (
      <span className="flex items-center gap-1.5 text-secondary">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{pending.map(describe).join(', ')}</span>
      </span>
    );
  }

  return (
    <ul className="mt-1.5 flex flex-col gap-1.5">
      {pending.map((p, i) => (
        <li key={`${p.faculty_id ?? p.role}-${p.subject ?? i}`} className="text-sm text-primary">
          <span className="font-medium">{describe(p)}</span>
          <span className="text-secondary">
            {' · '}
            {/* At the subject-faculty stage the hour is what identifies the
                signature; at the others the role is all there is to say. */}
            {p.subject
              ? `${p.subject}${p.course_code ? ` (${p.course_code})` : ''}`
              : p.role}
          </span>
        </li>
      ))}
    </ul>
  );
};
