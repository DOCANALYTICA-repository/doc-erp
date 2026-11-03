import React from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A multi-step form.
 *
 * ── Why a wizard at all ─────────────────────────────────────────────────────
 *
 * The claim form asks for a category, a date range, which classes were missed,
 * a reason and a certificate. As one page that is five unrelated decisions
 * competing for attention, and the "which classes" question is unanswerable
 * until the dates are known — the timetable is filtered by them. A student who
 * filled it top to bottom hit a class list that changed under them.
 *
 * Splitting it means each screen asks one question, and a later step can rely
 * on an earlier answer.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 *
 * The step list is a `<ol>` with `aria-current="step"` on the active item, not
 * a row of decorative dots — a screen-reader user needs to know they are on
 * step 3 of 5 and which ones are done. Completed steps are clickable so an
 * answer can be revised; future steps are not, because the wizard cannot know
 * whether the intervening data is valid yet.
 *
 * ── Submission ──────────────────────────────────────────────────────────────
 *
 * The wizard renders no form of its own. The CALLER wraps it in
 * `<form onSubmit={...}>`; the final step's button is a real `type="submit"`
 * and every earlier one is `type="button"`. That is what makes Enter advance
 * mid-wizard instead of submitting an incomplete claim.
 */

export interface WizardStep {
  id: string;
  /** Short label for the step list. */
  label: string;
  /** The question this step asks, as its heading. */
  heading: string;
  description?: string;
}

export const Wizard: React.FC<{
  steps: WizardStep[];
  /** Index into `steps`. Controlled — the caller owns progression. */
  current: number;
  onStepChange: (index: number) => void;
  /**
   * Whether the current step is complete enough to leave.
   *
   * Kept as a prop rather than derived internally so the caller can validate
   * with whatever it already uses — a zod schema, a field count, anything.
   */
  canAdvance: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  children: React.ReactNode;
}> = ({
  steps,
  current,
  onStepChange,
  canAdvance,
  isSubmitting,
  submitLabel = 'Submit',
  children,
}) => {
  const isFirst = current === 0;
  const isLast = current === steps.length - 1;
  const step = steps[current];

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Progress">
        {steps.map((s, index) => {
          const isDone = index < current;
          const isCurrent = index === current;

          return (
            <li key={s.id} className="flex items-center gap-2">
              <button
                type="button"
                // Only backwards. Jumping forward would skip validation the
                // later steps depend on.
                onClick={() => (isDone ? onStepChange(index) : undefined)}
                disabled={!isDone}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  isDone ? 'bg-muted text-primary hover:bg-sand-300' : '',
                  isCurrent ? 'bg-accent text-on-accent' : '',
                  !isDone && !isCurrent ? 'text-secondary' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'grid h-5 w-5 place-items-center rounded-full text-xs tabular-nums',
                    isDone ? 'bg-success text-on-success' : '',
                    isCurrent ? 'bg-on-accent/15' : 'bg-muted',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {isDone ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                {s.label}
              </button>
              {index < steps.length - 1 ? (
                <span className="text-sand-400" aria-hidden="true">
                  <ChevronRight className="h-4 w-4" />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div>
        <h2 className="font-heading text-2xl font-semibold text-primary">{step.heading}</h2>
        {step.description ? (
          <p className="mt-1.5 text-sm text-secondary">{step.description}</p>
        ) : null}
      </div>

      {children}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={() => onStepChange(current - 1)}
          disabled={isFirst || isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-secondary transition-colors hover:bg-muted disabled:invisible focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        {/*
          * One button that either advances or submits, never both visible at
          * once. Showing "Continue" and "Submit" side by side on the last step
          * is how people submit a form they meant to keep editing.
          */}
        <button
          // `submit` only on the last step. On every other step it is a plain
          // button, so Enter inside a field advances rather than submitting a
          // half-filled claim — which is exactly what a single `type="submit"`
          // in a multi-step form would do.
          type={isLast ? 'submit' : 'button'}
          onClick={isLast ? undefined : () => onStepChange(current + 1)}
          disabled={!canAdvance || isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-gold-600 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isLast ? (isSubmitting ? 'Submitting…' : submitLabel) : 'Continue'}
          {!isLast ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
};
