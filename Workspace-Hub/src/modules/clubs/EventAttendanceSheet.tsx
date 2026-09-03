import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { api } from '../../services/api';
import { describeError } from '../../services/errors';
import { clubKeys } from '../../lib/queryKeys';
import { PageLoader } from '../../components/ui/PageLoader';
import { ErrorState } from '../../components/ui/ErrorState';
import type { ClubEvent, EventAttendance } from '../../api/types';
import { useClubWorkspace } from './ClubWorkspaceContext';

/**
 * The attendance register for one event.
 *
 * Event attendance capture had no UI at all, and TWO shipped analytics
 * features read the data it produces — the attendance-rate gauge and the
 * attendance report. Both were reporting on a table that only the seed script
 * ever wrote to.
 */
export const EventAttendanceSheet: React.FC<{ event: ClubEvent; onClose: () => void }> = ({
  event, onClose,
}) => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const attendanceKey = clubKeys.resource(clubId, `events/${event.id}/attendance`);
  const { data: existing, isLoading, isError, error, refetch } = useQuery({
    queryKey: attendanceKey,
    queryFn: () => api.get<EventAttendance[]>(`/clubs/${clubId}/events/${event.id}/attendance`),
  });

  const activeMembers = React.useMemo(
    () => bootstrap.members.filter(m => m.status === 'active'),
    [bootstrap.members],
  );

  const [marks, setMarks] = React.useState<Record<string, 'present' | 'absent'>>({});
  const [isSaving, setIsSaving] = React.useState(false);

  // Seed the register from what is already recorded, defaulting to present —
  // for most events most members turned up, and the exceptions are what the
  // person filling this in is actually there to record.
  React.useEffect(() => {
    if (!existing) return;
    const recorded = new Map(existing.map(r => [r.student_id, r.attended as 'present' | 'absent']));
    setMarks(
      Object.fromEntries(activeMembers.map(m => [m.student_id, recorded.get(m.student_id) ?? 'present'])),
    );
  }, [existing, activeMembers]);

  const save = async () => {
    setIsSaving(true);
    try {
      const result = await api.post<{ created: number; updated: number; total: number }>(
        `/clubs/${clubId}/events/${event.id}/attendance`,
        activeMembers.map(m => ({ student_id: m.student_id, attended: marks[m.student_id] ?? 'present' })),
      );
      showToast({
        body: `Attendance saved for ${result.total} member${result.total === 1 ? '' : 's'}.`,
        type: 'info',
      });
      queryClient.invalidateQueries({ queryKey: attendanceKey });
      queryClient.invalidateQueries({ queryKey: clubKeys.detail(clubId) });
      refreshShell();
      onClose();
    } catch (e) {
      showToast({ body: `Could not save attendance: ${describeError(e)}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <PageLoader label="Loading the register..." />;
  if (isError) {
    return <ErrorState title="Attendance didn't load" error={error} onRetry={() => void refetch()} />;
  }

  const presentCount = activeMembers.filter(m => (marks[m.student_id] ?? 'present') === 'present').length;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-slate-600">
          Attendance register — {presentCount} of {activeMembers.length} present
        </h4>
        <div className="flex gap-2">
          <Button
            label="All present"
            variant="ghost"
            size="sm"
            clickAction={() =>
              setMarks(Object.fromEntries(activeMembers.map(m => [m.student_id, 'present' as const])))
            }
          />
          <Button
            label="All absent"
            variant="ghost"
            size="sm"
            clickAction={() =>
              setMarks(Object.fromEntries(activeMembers.map(m => [m.student_id, 'absent' as const])))
            }
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-slate-100">
        {activeMembers.map(m => {
          const value = marks[m.student_id] ?? 'present';
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-slate-800">{m.student_name ?? m.student_id}</span>
              <fieldset className="flex gap-1" aria-label={`Attendance for ${m.student_name ?? m.student_id}`}>
                {(['present', 'absent'] as const).map(option => (
                  <label
                    key={option}
                    className={`cursor-pointer rounded-lg px-3 py-1 text-sm font-medium ${
                      value === option
                        ? option === 'present'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`attendance-${event.id}-${m.student_id}`}
                      checked={value === option}
                      onChange={() => setMarks(prev => ({ ...prev, [m.student_id]: option }))}
                    />
                    {option === 'present' ? 'Present' : 'Absent'}
                  </label>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex gap-2">
        <Button
          label={isSaving ? 'Saving…' : 'Save attendance'}
          variant="primary"
          size="sm"
          isDisabled={isSaving || activeMembers.length === 0}
          clickAction={save}
        />
        <Button label="Cancel" variant="ghost" size="sm" clickAction={onClose} />
      </div>
    </div>
  );
};
