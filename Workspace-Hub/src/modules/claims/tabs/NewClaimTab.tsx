import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DateRangeInput } from '@astryxdesign/core/DateRangeInput';
import { useToast } from '@astryxdesign/core/Toast';
import { FileText, HeartPulse, Trophy } from 'lucide-react';

import { api } from '../../../services/api';
import { describeError } from '../../../services/errors';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Card } from '../../../components/ui/Card';
import { Wizard, type WizardStep } from '../../../components/ui/Wizard';
import { FormError } from '../../../components/ui/form/FormError';
import type { IsoDate } from '../../../lib/date';
import { useStore } from '../../../context/useStore';
import { useClaimsWorkspace } from '../ClaimsContext';
import { CO_CURRICULAR_CAPABILITY } from '../tabs';

type DateRange = { start: IsoDate; end: IsoDate };
type Category = 'medical' | 'co_curricular';

// getDay() order, so DAY_NAMES[d.getDay()] indexes directly.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
// Display order: the academic week starts on Monday.
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * The five questions, in the only order they can be asked.
 *
 * Step 3 depends on step 2: the timetable is filtered to the days inside the
 * chosen date range, so "which classes did you miss" is literally unanswerable
 * before the dates are known. On the old single page the class list changed
 * under anyone who filled the form top to bottom.
 */
const STEPS: WizardStep[] = [
  {
    id: 'category',
    label: 'Type',
    heading: 'What kind of absence was this?',
    description: 'This decides what evidence the reviewers will expect.',
  },
  {
    id: 'dates',
    label: 'Dates',
    heading: 'Which dates were you away?',
    description: 'The classes you missed are worked out from these.',
  },
  {
    id: 'classes',
    label: 'Classes',
    heading: 'Which classes did you miss?',
    description: 'Only sessions timetabled inside those dates are listed.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    heading: 'Why were you away, and what proves it?',
  },
  {
    id: 'review',
    label: 'Review',
    heading: 'Check it over, then submit',
    description: 'It goes to your Class Teacher first, then subject faculty, then the Course Coordinator.',
  },
];

const CATEGORY_LABEL: Record<Category, string> = {
  medical: 'Medical',
  co_curricular: 'Co-curricular',
};

const CO_CURRICULAR_COMING_SOON =
  "Individual yellow forms are coming in a future release. For now, co-curricular claims are filed by your club — ask your club's leadership to add you to their pre-approval.";

export const NewClaimTab: React.FC = () => {
  const { timetable, academicContext, invalidate } = useClaimsWorkspace();
  const showToast = useToast();
  const navigate = useNavigate();
  const coCurricularLive = useStore(s => s.isEnabled(CO_CURRICULAR_CAPABILITY));
  const comingSoonId = React.useId();

  const [step, setStep] = React.useState(0);
  const [category, setCategory] = React.useState<Category>('medical');
  const [dateRange, setDateRange] = React.useState<DateRange | null>(null);
  const [reason, setReason] = React.useState('');
  const [selectedHours, setSelectedHours] = React.useState<string[]>([]);
  const [certificate, setCertificate] = React.useState<File | null>(null);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

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

  /**
   * Whether the CURRENT step is answered.
   *
   * These are the same four rules the old form enforced with imperative
   * toasts — "Choose the dates you were absent.", "Select at least one missed
   * class.", and so on — except each is now checked on the step that asks the
   * question, so a missing answer stops you one screen later rather than after
   * you have filled in everything and pressed Submit.
   */
  const canAdvance = (() => {
    switch (STEPS[step].id) {
      case 'category':
        return true; // always has a value; medical is the default
      case 'dates':
        return dateRange !== null;
      case 'classes':
        return selectedHours.length > 0;
      case 'evidence':
        // A medical claim without a certificate is refused by the server, so
        // there is no point letting it through.
        return reason.trim().length > 0 && (category !== 'medical' || certificate !== null);
      default:
        return true;
    }
  })();

  const selectedSlots = selectedHours.flatMap(id => {
    const slot = timetable.find(t => t.id === id);
    return slot ? [slot] : [];
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateRange) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const missedClasses = selectedSlots.map(slot => ({
        subject: slot.subject,
        course_code: slot.course_code,
        date: dateRange.start,
        hour: slot.hour,
        subject_faculty_id: slot.faculty_id,
      }));

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

      showToast({ body: 'Claim submitted for initial review.', type: 'info' });
      invalidate();
      navigate('/app/claims/my_claims');
    } catch (err) {
      // Shown in the form rather than as a toast: the student is looking at the
      // review step and needs to be able to go back and fix something, which a
      // toast that has already faded cannot tell them.
      setSubmitError(describeError(err));
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

      {/* The form wraps the wizard; only the final step's button submits. */}
      <form onSubmit={submit} noValidate>
        <Card>
          <Wizard
            steps={STEPS}
            current={step}
            onStepChange={setStep}
            canAdvance={canAdvance}
            isSubmitting={isSubmitting}
            submitLabel="Submit to Class Teacher"
          >
            <div className="min-h-[13rem]">
              {STEPS[step].id === 'category' ? (
                <div
                  role="radiogroup"
                  aria-label="Absence category"
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {/*
                    * Two large targets instead of a <select>. There are exactly
                    * two options and the choice changes what the next steps
                    * require, so it is worth the space — and each card can say
                    * what it implies rather than hiding that in a parenthesis.
                    */}
                  {(
                    [
                      {
                        value: 'medical' as Category,
                        icon: HeartPulse,
                        title: 'Medical',
                        detail: 'Illness or injury. A medical certificate is required.',
                        isAvailable: true,
                      },
                      {
                        value: 'co_curricular' as Category,
                        icon: Trophy,
                        title: 'Co-curricular',
                        detail: coCurricularLive
                          ? 'Representing the department or university. Pre-approval expected.'
                          : CO_CURRICULAR_COMING_SOON,
                        isAvailable: coCurricularLive,
                      },
                    ] as const
                  ).map(option => {
                    const isSelected = category === option.value;
                    const Icon = option.icon;
                    // aria-disabled, not `disabled`: it stays keyboard-reachable so the explanation can be read.
                    if (!option.isAvailable) {
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={false}
                          aria-disabled="true"
                          aria-describedby={comingSoonId}
                          className={[
                            'flex cursor-not-allowed flex-col items-start gap-2 rounded-md border border-dashed border-border bg-muted p-5 text-left',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                          ].join(' ')}
                        >
                          <Icon className="h-5 w-5 text-sand-400" aria-hidden="true" />
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-heading text-lg font-semibold text-secondary">
                              {option.title}
                            </span>
                            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-secondary">
                              Coming soon
                            </span>
                          </span>
                          <span id={comingSoonId} className="text-sm text-secondary">
                            {option.detail}
                          </span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setCategory(option.value)}
                        className={[
                          'flex flex-col items-start gap-2 rounded-md border p-5 text-left transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                          isSelected
                            ? 'border-accent bg-accent-muted'
                            : 'border-border bg-card hover:bg-muted',
                        ].join(' ')}
                      >
                        <Icon
                          className={`h-5 w-5 ${isSelected ? 'text-accent' : 'text-secondary'}`}
                          aria-hidden="true"
                        />
                        <span className="font-heading text-lg font-semibold text-primary">
                          {option.title}
                        </span>
                        <span className="text-sm text-secondary">{option.detail}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {STEPS[step].id === 'dates' ? (
                <div className="max-w-md">
                  <DateRangeInput
                    label="Dates absent"
                    value={dateRange}
                    onChange={setDateRange}
                    // A soft warning, never a block: a genuine second absence
                    // in an overlapping window is legitimate.
                    status={
                      duplicateWarning ? { type: 'warning', message: duplicateWarning } : undefined
                    }
                  />
                </div>
              ) : null}

              {STEPS[step].id === 'classes' ? (
                <fieldset>
                  <legend className="sr-only">Missed sessions</legend>
                  {visibleTimetable.length === 0 ? (
                    <p className="text-sm text-secondary">
                      No timetabled classes fall in the selected dates. Go back and check the
                      dates, or contact your Class Teacher.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {visibleTimetable.map(([day, slots]) => (
                        <div key={day}>
                          <h3 className="mb-2 text-sm font-semibold text-primary">{day}</h3>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {slots.map(slot => {
                              const isSelected = selectedHours.includes(slot.id);
                              return (
                                <label
                                  key={slot.id}
                                  className={[
                                    'flex cursor-pointer select-none items-start gap-3 rounded-md border p-3 transition-colors',
                                    isSelected
                                      ? 'border-accent bg-accent-muted'
                                      : 'border-border bg-card hover:bg-muted',
                                  ].join(' ')}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={e =>
                                      setSelectedHours(prev =>
                                        e.target.checked
                                          ? [...prev, slot.id]
                                          : prev.filter(id => id !== slot.id),
                                      )
                                    }
                                    className="mt-0.5 accent-accent"
                                  />
                                  <span className="text-sm">
                                    <span className="block font-medium text-primary">
                                      {slot.subject}
                                      {slot.course_code ? (
                                        <span className="ml-1.5 font-normal text-secondary">
                                          {slot.course_code}
                                        </span>
                                      ) : null}
                                    </span>
                                    <span className="mt-0.5 block text-secondary">{slot.hour}</span>
                                    {/* BLK-04: this field did not exist on the
                                        API for months, so the row named a
                                        subject and an hour and nothing about
                                        whose class it was. */}
                                    <span className="block text-secondary">
                                      {[slot.faculty_name, slot.co_faculty_name].filter(Boolean).join(' / ') ||
                                        'Faculty TBC'}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </fieldset>
              ) : null}

              {STEPS[step].id === 'evidence' ? (
                <div className="flex max-w-xl flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-secondary" htmlFor="claim-reason">
                      Reason
                    </label>
                    <textarea
                      id="claim-reason"
                      rows={4}
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Recovering from viral fever and advised absolute bed rest."
                      className="rounded-md border border-border bg-card px-3 py-2 text-sm text-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label
                      className="text-sm font-medium text-secondary"
                      htmlFor="claim-certificate"
                    >
                      {category === 'medical'
                        ? 'Medical certificate (required)'
                        : 'Pre-approval form (optional)'}
                    </label>
                    <input
                      id="claim-certificate"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={e => setCertificate(e.target.files?.[0] ?? null)}
                      className="rounded-md border border-border bg-card px-3 py-2 text-sm text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-accent"
                    />
                    <p className="text-xs text-secondary">PDF, JPEG or PNG, up to 10 MB.</p>
                  </div>

                  {category === 'medical' && !certificate ? (
                    <p className="text-sm text-secondary">
                      A medical claim cannot be submitted without a certificate — the reviewers
                      will refuse it.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {STEPS[step].id === 'review' ? (
                <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Category
                    </dt>
                    <dd className="mt-1 text-sm text-primary">{CATEGORY_LABEL[category]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Dates
                    </dt>
                    <dd className="mt-1 text-sm text-primary">
                      {dateRange ? `${dateRange.start} to ${dateRange.end}` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Hours claimed
                    </dt>
                    <dd className="mt-1 text-sm tabular-nums text-primary">
                      {selectedSlots.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Evidence
                    </dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm text-primary">
                      {certificate ? (
                        <>
                          <FileText className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                          {certificate.name}
                        </>
                      ) : (
                        'None attached'
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Classes
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {selectedSlots.map(slot => (
                        <span
                          key={slot.id}
                          className="rounded-full bg-muted px-3 py-1 text-xs text-primary"
                        >
                          {slot.subject} · {slot.hour}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">
                      Reason
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-primary">{reason}</dd>
                  </div>
                </dl>
              ) : null}
            </div>

            <FormError message={submitError ?? undefined} />
          </Wizard>
        </Card>
      </form>
    </div>
  );
};
