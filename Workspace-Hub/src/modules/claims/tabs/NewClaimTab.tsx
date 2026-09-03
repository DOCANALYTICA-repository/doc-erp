import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import { useToast } from '@astryxdesign/core/Toast';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import type { IsoDate } from '../../../lib/date';
import { useClaimsWorkspace } from '../ClaimsContext';

type DateRange = { start: IsoDate; end: IsoDate };

// getDay() order, so DAY_NAMES[d.getDay()] indexes directly.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
// Display order: the academic week starts on Monday.
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const NewClaimTab: React.FC = () => {
  const { timetable, academicContext, invalidate } = useClaimsWorkspace();
  const showToast = useToast();
  const navigate = useNavigate();

  const [category, setCategory] = React.useState<'medical' | 'co_curricular'>('medical');
  const [dateRange, setDateRange] = React.useState<DateRange | null>(null);
  const [reason, setReason] = React.useState('');
  const [selectedHours, setSelectedHours] = React.useState<string[]>([]);
  const [certificate, setCertificate] = React.useState<File | null>(null);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Soft duplicate check as the student picks dates — warns, never blocks.
  React.useEffect(() => {
    if (!dateRange) { setDuplicateWarning(null); return; }
    const timer = setTimeout(() => {
      const dr = `${dateRange.start} to ${dateRange.end}`;
      api.get<{ has_potential_duplicate: boolean; message: string }>(
        `/claims/duplicate-check?date_range=${encodeURIComponent(dr)}`,
      )
        .then(res => setDuplicateWarning(res.has_potential_duplicate ? res.message : null))
        .catch(() => setDuplicateWarning(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [dateRange]);

  /**
   * Timetable slots that actually fall inside the selected date range,
   * grouped by day.
   *
   * The picker used to map the flat list and ignore day_of_week entirely, so
   * the same subject appeared once per weekday it is taught with nothing to
   * tell the instances apart.
   */
  const visibleTimetable = React.useMemo(() => {
    const daysInRange = new Set<string>();
    if (dateRange?.start && dateRange?.end) {
      const end = new Date(dateRange.end);
      for (
        let d = new Date(dateRange.start);
        d <= end && daysInRange.size < 7;
        d.setDate(d.getDate() + 1)
      ) {
        daysInRange.add(DAY_NAMES[d.getDay()]);
      }
    }

    const grouped = new Map<string, typeof timetable>();
    for (const slot of timetable) {
      if (daysInRange.size > 0 && !daysInRange.has(slot.day_of_week)) continue;
      const bucket = grouped.get(slot.day_of_week) ?? [];
      bucket.push(slot);
      grouped.set(slot.day_of_week, bucket);
    }

    return DAY_ORDER.filter(d => grouped.has(d)).map(d => [d, grouped.get(d)!] as const);
  }, [timetable, dateRange]);

  const submit = async () => {
    if (!dateRange) {
      showToast({ body: 'Choose the dates you were absent.', type: 'error' });
      return;
    }
    if (selectedHours.length === 0) {
      showToast({ body: 'Select at least one missed class.', type: 'error' });
      return;
    }
    if (!reason.trim()) {
      showToast({ body: 'Explain why you missed these sessions.', type: 'error' });
      return;
    }
    if (category === 'medical' && !certificate) {
      showToast({ body: 'A medical certificate is required for this category.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const missedClasses = selectedHours.flatMap(hourId => {
        const slot = timetable.find(t => t.id === hourId);
        if (!slot) return [];
        return [{
          subject: slot.subject,
          date: dateRange.start,
          hour: slot.hour,
          subject_faculty_id: slot.faculty_id,
        }];
      });

      const claim = await api.post<{ id: string }>('/claims', {
        category,
        academic_year: '2025-2026',
        semester: academicContext.semester,
        programme: academicContext.programme,
        section: academicContext.section,
        date_range: `${dateRange.start} to ${dateRange.end}`,
        reason,
        missed_classes: missedClasses,
      });

      if (certificate) {
        const fd = new FormData();
        fd.append('file', certificate);
        fd.append('document_type', category === 'medical' ? 'medical_certificate' : 'pre_approval_form');
        await api.upload(`/claims/${claim.id}/documents`, fd);
      }

      setCertificate(null); setDateRange(null); setReason(''); setSelectedHours([]);
      showToast({ body: 'Claim submitted for initial review.', type: 'info' });
      invalidate();
      navigate('/app/claims/my_claims');
    } catch (err) {
      showToast({ body: `Could not submit the claim: ${describeError(err)}`, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="New attendance claim"
        description="Goes to your Class Teacher, then subject faculty, then the Course Coordinator."
      />

      <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-600" htmlFor="claim-category">Category</label>
            <select
              id="claim-category"
              value={category}
              onChange={e => setCategory(e.target.value as 'medical' | 'co_curricular')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
            >
              <option value="medical">Medical (certificate required)</option>
              <option value="co_curricular">Co-curricular (pre-approval required)</option>
            </select>
          </div>
          <DateRangeInput
            label="Dates absent"
            value={dateRange}
            onChange={setDateRange}
            status={duplicateWarning ? { type: 'warning', message: duplicateWarning } : undefined}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-slate-600">
            Missed sessions — select all that apply
          </legend>
          {visibleTimetable.length === 0 ? (
            <p className="text-sm text-slate-500">
              {dateRange
                ? 'No timetabled classes fall in the selected dates.'
                : 'Pick a date range above to see the classes you missed.'}
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-4">
              {visibleTimetable.map(([day, slots]) => (
                <div key={day}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">{day}</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {slots.map(slot => (
                      <label
                        key={slot.id}
                        className="flex cursor-pointer select-none items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={selectedHours.includes(slot.id)}
                          onChange={e =>
                            setSelectedHours(prev =>
                              e.target.checked ? [...prev, slot.id] : prev.filter(id => id !== slot.id),
                            )
                          }
                          className="mt-0.5"
                        />
                        <span className="text-sm">
                          <span className="block font-medium text-slate-900">{slot.subject}</span>
                          <span className="mt-0.5 block text-slate-500">{slot.hour}</span>
                          {/* BLK-04: this field did not exist on the API for
                              months, so the row named a subject and an hour and
                              nothing about whose class it was. */}
                          <span className="block text-slate-500">{slot.faculty_name || 'Faculty TBC'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-600" htmlFor="claim-reason">
            Explanation
          </label>
          <textarea
            id="claim-reason"
            rows={4}
            required
            placeholder="Explain why you missed these academic sessions…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-600" htmlFor="claim-certificate">
            Supporting document{category === 'medical' ? ' (required)' : ' (optional)'}
          </label>
          <input
            id="claim-certificate"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={e => setCertificate(e.target.files?.[0] ?? null)}
            required={category === 'medical'}
            className="text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
          <p className="text-xs text-slate-400">PDF, JPEG or PNG, up to 10 MB.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          label={isSubmitting ? 'Submitting…' : 'Submit to Class Teacher'}
          variant="primary"
          isDisabled={isSubmitting}
          clickAction={submit}
        />
      </div>
    </div>
  );
};
