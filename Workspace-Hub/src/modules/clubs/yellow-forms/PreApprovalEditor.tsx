import React from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { Trash2, UserPlus } from 'lucide-react';

import { useYellowFormInvalidator } from '../../../api/hooks';
import type { PreApproval } from '../../../api/types';
import { describeError } from '../../../services/errors';
import { applyServerFieldErrors, useZodForm } from '../../../lib/forms';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Drawer } from '../../../components/ui/Drawer';
import { DateField, TextAreaField, TextField } from '../../../components/ui/form/fields';
import { FormError } from '../../../components/ui/form/FormError';
import { rootServerError } from '../../../components/ui/form/fieldStatus';
import {
  Notice,
  SectionLabel,
  addDays,
  approvalDeadlineFor,
  formatDate,
  isValidIsoDate,
  todayIst,
  yellowFormApi,
} from '../../yellow-forms';
import { cellInputClass } from './inputs';
import {
  preApprovalFormDefaults,
  preApprovalFormSchema,
  toPreApprovalBody,
  type PreApprovalFormOutput,
} from './preApprovalForm';
import { AddByRegisterNumber, ClubMemberPicker } from './StudentPickers';

const FORM_ID = 'club-pre-approval-form';

type Intent = 'draft' | 'submit';

const STUDENT_COLUMNS = [
  { key: 'register_number', label: 'Register number', noun: 'register number', width: 'w-32' },
  { key: 'student_name', label: 'Student name', noun: 'name', width: 'w-48' },
  { key: 'class_name', label: 'Class', noun: 'class', width: 'w-32' },
  { key: 'role', label: 'Role', noun: 'role', width: 'w-40' },
] as const;

/**
 * Create or edit a pre-approval: the event, and the students expected to miss
 * class for it. Saving keeps it as a draft; "Save & submit" also sends it to
 * the club's Faculty Coordinator, then the Associate HOD — both of whom have
 * to sign before the event starts.
 */
export const PreApprovalEditor: React.FC<{
  clubId: string;
  clubName: string;
  /** Null for a new pre-approval. */
  form: PreApproval | null;
  /** With the stored form, if there is one: a save can land even when the submit after it fails. */
  onClose: (saved: PreApproval | null) => void;
  onSaved: (form: PreApproval) => void;
}> = ({ clubId, clubName, form: existing, onClose, onSaved }) => {
  const showToast = useToast();
  const invalidate = useYellowFormInvalidator();
  const [saved, setSaved] = React.useState<PreApproval | null>(existing);
  const [busy, setBusy] = React.useState<Intent | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [isPickingMembers, setIsPickingMembers] = React.useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = React.useState(false);

  const form = useZodForm(preApprovalFormSchema, { defaultValues: preApprovalFormDefaults(existing) });
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
  } = form;
  // Escape (even one meant for a date picker), the close button and Cancel all land here.
  const close = () => (isDirty ? setIsConfirmingDiscard(true) : onClose(saved));
  const students = useFieldArray({ control, name: 'students' });

  const start = watch('event_start_date');
  const listedRows = watch('students');
  const tomorrow = addDays(todayIst(), 1);

  const save = async (values: PreApprovalFormOutput, intent: Intent) => {
    setListError(null);
    if (intent === 'submit' && values.students.length === 0) {
      setListError('Add at least one student before submitting for approval.');
      return;
    }
    setBusy(intent);
    form.clearErrors('root.server');
    const body = toPreApprovalBody(values);
    let stored = saved;
    try {
      stored = stored
        ? await yellowFormApi.updatePreApproval(stored.id, body)
        : await yellowFormApi.createPreApproval(clubId, body);
      setSaved(stored);
      const result = intent === 'submit' ? await yellowFormApi.submitPreApproval(stored.id) : stored;
      invalidate();
      showToast({
        body:
          intent === 'submit'
            ? `Submitted for approval.${result.pending_with ? ` Waiting on ${result.pending_with}.` : ''}`
            : existing
              ? 'Changes saved.'
              : 'Pre-approval saved as a draft.',
        type: 'info',
      });
      onSaved(result);
    } catch (e) {
      const wrote = stored !== saved;
      if (wrote) {
        invalidate();
        form.reset(form.getValues());
      }
      if (!applyServerFieldErrors(form, e)) {
        const message = describeError(e);
        showToast({
          body: wrote && intent === 'submit' ? `Saved as a draft, but not submitted: ${message}` : message,
          type: 'error',
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const run = (intent: Intent) => handleSubmit(values => save(values, intent));

  const canSubmit = existing ? existing.viewer_can_submit : true;
  const rowErrors = errors.students;

  return (
    <>
      <Drawer
        isOpen
        onClose={close}
        purpose="form"
        width={780}
        title={existing ? 'Edit pre-approval' : 'New pre-approval'}
        subtitle={
          existing
            ? `${existing.reference_number} · ${existing.status_label}`
            : 'Needs the Faculty Coordinator and the Associate HOD to approve it before the event starts.'
        }
        actions={
          <>
            <Button label="Cancel" variant="secondary" isDisabled={busy !== null} clickAction={close} />
            <Button
              label="Save draft"
              variant="secondary"
              isDisabled={busy !== null}
              isLoading={busy === 'draft'}
              clickAction={() => run('draft')()}
            />
            {canSubmit ? (
              <Button
                label="Save & submit for approval"
                variant="primary"
                isDisabled={busy !== null}
                isLoading={busy === 'submit'}
                clickAction={() => run('submit')()}
              />
            ) : null}
          </>
        }
      >
        <form id={FORM_ID} className="flex flex-col gap-6 text-sm" onSubmit={run('draft')} noValidate>
          {existing?.submit_blocked_reason ? (
            <Notice tone="warning" title="Can't be submitted yet">
              {existing.submit_blocked_reason}
            </Notice>
          ) : null}

          {existing?.status === 'returned' && existing.review_comments ? (
            <Notice
              tone="warning"
              title={`Sent back by ${existing.last_reviewed_by_name ?? 'the reviewer'}`}
            >
              <p className="whitespace-pre-line">{existing.review_comments}</p>
              <p className="mt-1 text-xs text-secondary">
                Resubmitting sends it to the Faculty Coordinator again.
              </p>
            </Notice>
          ) : null}

          <section className="flex flex-col gap-4" aria-labelledby={`${FORM_ID}-event`}>
            <SectionLabel id={`${FORM_ID}-event`}>Event</SectionLabel>
            <TextField control={control} name="event_name" label="Event name" isRequired />
            <TextAreaField
              control={control}
              name="event_description"
              label="Description"
              rows={3}
              maxLength={2000}
            />
            <TextField control={control} name="venue" label="Venue" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateField
                control={control}
                name="event_start_date"
                label="Event starts"
                description={`The earliest start is ${formatDate(tomorrow)}.`}
                isRequired
              />
              <DateField control={control} name="event_end_date" label="Event ends" isRequired />
            </div>
            {isValidIsoDate(start) && start > todayIst() ? (
              <Notice
                tone="info"
                title={`Needs Faculty Coordinator and Associate HOD approval by ${formatDate(approvalDeadlineFor(start))}`}
              >
                Both approvals close when the event starts on {formatDate(start)}.
              </Notice>
            ) : null}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby={`${FORM_ID}-students`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel id={`${FORM_ID}-students`}>Students ({students.fields.length})</SectionLabel>
              {!isPickingMembers ? (
                <Button
                  label="Add club members"
                  variant="secondary"
                  size="sm"
                  icon={<UserPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                  clickAction={() => setIsPickingMembers(true)}
                />
              ) : null}
            </div>
            <p className="text-xs text-secondary">
              Everyone expected to miss class for the event. Only these students can go on the claim sheet
              afterwards.
            </p>

            {isPickingMembers ? (
              <ClubMemberPicker
                clubId={clubId}
                listed={listedRows}
                onAdd={rows => {
                  students.append(rows);
                  setListError(null);
                }}
                onClose={() => setIsPickingMembers(false)}
              />
            ) : null}

            <AddByRegisterNumber
              clubId={clubId}
              defaultRole={clubName}
              listed={listedRows}
              onAdd={row => {
                students.append(row);
                setListError(null);
              }}
            />

            <FormError message={listError ?? undefined} />

            {students.fields.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-secondary">
                No students yet. Add club members, or add a student by register number.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full min-w-max text-left text-xs">
                  <caption className="sr-only">Students on this pre-approval</caption>
                  <thead className="border-b border-border bg-muted text-secondary">
                    <tr>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                        S.No
                      </th>
                      {STUDENT_COLUMNS.map(column => (
                        <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                          {column.label}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-primary">
                    {students.fields.map((field, index) => {
                      const name = listedRows[index]?.student_name?.trim();
                      return (
                        <tr key={field.id}>
                          <td className="px-3 py-2 text-right align-top tabular-nums text-secondary">
                            <span className="inline-block pt-1.5">{index + 1}</span>
                          </td>
                          {STUDENT_COLUMNS.map(column => {
                            const message = rowErrors?.[index]?.[column.key]?.message;
                            const errorId = `${field.id}-${column.key}-error`;
                            return (
                              <td key={column.key} className="px-3 py-2 align-top">
                                <input
                                  {...register(`students.${index}.${column.key}`)}
                                  aria-label={`Student ${index + 1} ${column.noun}`}
                                  aria-invalid={message ? true : undefined}
                                  aria-describedby={message ? errorId : undefined}
                                  autoComplete="off"
                                  className={cellInputClass(Boolean(message), column.width)}
                                />
                                {message ? (
                                  <p id={errorId} className="mt-1 max-w-48 text-xs text-error">
                                    {message}
                                  </p>
                                ) : null}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 align-top">
                            <Button
                              label={`Remove student ${index + 1}${name ? ` (${name})` : ''}`}
                              variant="ghost"
                              size="sm"
                              isIconOnly
                              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                              clickAction={() => students.remove(index)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <FormError message={rootServerError(errors)} />
        </form>
      </Drawer>

      <ConfirmDialog
        isOpen={isConfirmingDiscard}
        title="Discard your changes?"
        body="What you have entered in this pre-approval has not been saved."
        confirmLabel="Discard changes"
        onConfirm={() => {
          setIsConfirmingDiscard(false);
          onClose(saved);
        }}
        onCancel={() => setIsConfirmingDiscard(false)}
      />
    </>
  );
};
