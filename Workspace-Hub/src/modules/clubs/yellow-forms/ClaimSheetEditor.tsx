import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';
import { ExternalLink } from 'lucide-react';

import { useYellowFormInvalidator, useYellowFormWorkflow } from '../../../api/hooks';
import type { ClaimSheet, ClaimSheetPeriod, PreApproval } from '../../../api/types';
import { describeError } from '../../../services/errors';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Drawer } from '../../../components/ui/Drawer';
import {
  ClaimSheetGrid,
  ExportCsvButton,
  MAX_ROLE_LENGTH,
  MetaList,
  Notice,
  SectionLabel,
  buildClaimGrid,
  claimGridSourceFromSheet,
  claimGridSummary,
  formatDate,
  formatDateRange,
  formatWeekday,
  issuesFor,
  previewStudentsFromGrid,
  setStudentIncluded,
  toClaimSheetUpsert,
  togglePeriod,
  updateGridStudent,
  validateClaimGrid,
  yellowFormApi,
  type ClaimGridField,
  type ClaimGridIssue,
  type ClaimGridMode,
  type ClaimGridModel,
  type ClaimGridSource,
} from '../../yellow-forms';
import { CHECKBOX_CLASS, cellInputClass } from './inputs';

export type ClaimSheetEditorProps = {
  /** With the stored sheet, if a save has landed. */
  onClose: (saved: ClaimSheet | null) => void;
  /** After the sheet is submitted to the Claims Coordinator. */
  onSubmitted: (sheet: ClaimSheet) => void;
} & (
  | { preApproval: PreApproval; sheet?: undefined }
  | { sheet: ClaimSheet; preApproval?: undefined }
);

interface SheetSummary {
  clubId: string;
  clubName: string;
  preApprovalId: string;
  preApprovalReference: string;
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  signatures: string[];
}

function signedBy(name: string | null | undefined, role: string, at: string | null | undefined): string | null {
  if (!name) return null;
  return `${name} (${role})${at ? ` on ${formatDate(at)}` : ''}`;
}

function summarise(props: ClaimSheetEditorProps): { summary: SheetSummary; source: ClaimGridSource } {
  if (props.sheet) {
    const { sheet } = props;
    return {
      source: claimGridSourceFromSheet(sheet),
      summary: {
        clubId: sheet.club_id,
        clubName: sheet.club_name,
        preApprovalId: sheet.pre_approval_id,
        preApprovalReference: sheet.pre_approval_reference,
        eventName: sheet.event_name,
        eventStartDate: sheet.event_start_date,
        eventEndDate: sheet.event_end_date,
        signatures: [
          signedBy(
            sheet.pre_approval.faculty_coordinator_approved_by_name,
            'Faculty Coordinator',
            sheet.pre_approval.faculty_coordinator_approved_at,
          ),
          signedBy(
            sheet.pre_approval.associate_hod_approved_by_name,
            'Associate HOD',
            sheet.pre_approval.associate_hod_approved_at,
          ),
        ].filter((line): line is string => line !== null),
      },
    };
  }
  const form = props.preApproval;
  return {
    source: {
      event_start_date: form.event_start_date,
      event_end_date: form.event_end_date,
      students: form.students,
    },
    summary: {
      clubId: form.club_id,
      clubName: form.club_name,
      preApprovalId: form.id,
      preApprovalReference: form.reference_number,
      eventName: form.event_name,
      eventStartDate: form.event_start_date,
      eventEndDate: form.event_end_date,
      signatures: [
        signedBy(form.faculty_coordinator_approved_by_name, 'Faculty Coordinator', form.faculty_coordinator_approved_at),
        signedBy(form.associate_hod_approved_by_name, 'Associate HOD', form.associate_hod_approved_at),
      ].filter((line): line is string => line !== null),
    },
  };
}

/** "2026-08-17" -> "17 Aug", for the grid's dense date cells and labels. */
function shortDate(iso: string): string {
  return formatDate(iso).split(' ').slice(0, 2).join(' ');
}

const TH = 'whitespace-nowrap px-3 py-2 font-semibold';
const TD = 'px-3 py-2 align-middle';

const ClaimGridTable: React.FC<{
  model: ClaimGridModel;
  periods: ClaimSheetPeriod[];
  issues: ClaimGridIssue[];
  isDisabled: boolean;
  onChange: (update: (model: ClaimGridModel) => ClaimGridModel) => void;
}> = ({ model, periods, issues, isDisabled, onChange }) => {
  const periodOrder = periods.map(period => period.id);
  const span = Math.max(model.dates.length, 1);

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-max text-left text-xs">
        <caption className="sr-only">
          Claim sheet: the periods each pre-approved student missed, and their attendance
        </caption>
        <thead className="border-b border-border bg-muted text-secondary">
          <tr>
            <th scope="col" className={TH}>Include</th>
            <th scope="col" className={TH}>Student</th>
            <th scope="col" className={TH}>Date</th>
            {periods.map(period => (
              <th key={period.id} scope="col" title={period.column} className={`${TH} text-center`}>
                {period.label}
              </th>
            ))}
            <th scope="col" className={`${TH} text-right`}>With claims (%)</th>
            <th scope="col" className={`${TH} text-right`}>Without claims (%)</th>
            <th scope="col" className={TH}>Role</th>
          </tr>
        </thead>
        {model.students.map(student => {
          const id = student.preApprovalStudentId;
          const own = issuesFor(issues, id);
          const hasIssue = (field: ClaimGridField) => own.some(issue => issue.field === field);
          const isOff = isDisabled || !student.included;
          const who = student.studentName;

          return (
            <tbody
              key={id}
              className={`border-b border-border last:border-b-0 ${student.included ? 'text-primary' : 'bg-muted/40 text-secondary'}`}
            >
              {model.dates.map((date, index) => (
                <tr key={date} className={index > 0 ? 'border-t border-border/60' : ''}>
                  {index === 0 ? (
                    <>
                      <td rowSpan={span} className={`${TD} align-top`}>
                        <input
                          type="checkbox"
                          className={`${CHECKBOX_CLASS} mt-0.5`}
                          checked={student.included}
                          disabled={isDisabled}
                          aria-label={`Include ${who} (${student.registerNumber}) on the claim sheet`}
                          onChange={e => onChange(m => setStudentIncluded(m, id, e.target.checked))}
                        />
                      </td>
                      <td rowSpan={span} className={`${TD} align-top`}>
                        <p className="whitespace-nowrap font-medium">{who}</p>
                        <p className="whitespace-nowrap text-secondary">
                          {student.registerNumber} · {student.className}
                        </p>
                        {!student.included ? <p className="text-secondary">Left off the sheet</p> : null}
                        {hasIssue('periods') ? (
                          <p className="mt-1 max-w-56 text-error">Tick at least one period, or leave them off.</p>
                        ) : null}
                      </td>
                    </>
                  ) : null}
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    {formatWeekday(date)} {shortDate(date)}
                  </td>
                  {periods.map(period => (
                    <td key={period.id} className={`${TD} text-center`}>
                      <input
                        type="checkbox"
                        className={CHECKBOX_CLASS}
                        checked={(student.periodsByDate[date] ?? []).includes(period.id)}
                        disabled={isOff}
                        aria-label={`${who}, ${shortDate(date)}, ${period.label}`}
                        onChange={() => onChange(m => togglePeriod(m, id, date, period.id, periodOrder))}
                      />
                    </td>
                  ))}
                  {index === 0 ? (
                    <>
                      <td rowSpan={span} className={`${TD} align-top text-right`}>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={student.attendanceWithClaims}
                          disabled={isOff}
                          aria-label={`${who}, attendance with claims (%)`}
                          aria-invalid={hasIssue('attendance_with_claims') || undefined}
                          onChange={e =>
                            onChange(m => updateGridStudent(m, id, { attendanceWithClaims: e.target.value }))
                          }
                          className={cellInputClass(hasIssue('attendance_with_claims'), 'w-20 text-right tabular-nums')}
                        />
                      </td>
                      <td rowSpan={span} className={`${TD} align-top text-right`}>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={student.attendanceWithoutClaims}
                          disabled={isOff}
                          aria-label={`${who}, attendance without claims (%)`}
                          aria-invalid={hasIssue('attendance_without_claims') || undefined}
                          onChange={e =>
                            onChange(m => updateGridStudent(m, id, { attendanceWithoutClaims: e.target.value }))
                          }
                          className={cellInputClass(hasIssue('attendance_without_claims'), 'w-20 text-right tabular-nums')}
                        />
                      </td>
                      <td rowSpan={span} className={`${TD} align-top`}>
                        <input
                          type="text"
                          autoComplete="off"
                          maxLength={MAX_ROLE_LENGTH}
                          value={student.role}
                          disabled={isOff}
                          placeholder={student.preApprovedRole}
                          aria-label={`${who}, role`}
                          aria-invalid={hasIssue('role') || undefined}
                          onChange={e => onChange(m => updateGridStudent(m, id, { role: e.target.value }))}
                          className={cellInputClass(hasIssue('role'), 'w-36')}
                        />
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
};

/**
 * The claim sheet, filled in after the event: which periods each pre-approved
 * student missed on each day, and their attendance with and without claims.
 * Only students on the approved pre-approval can appear; anyone who did not
 * end up missing class is left off. Checked here with the server's own rules
 * before anything is sent.
 */
export const ClaimSheetEditor: React.FC<ClaimSheetEditorProps> = props => {
  const { onClose, onSubmitted } = props;
  const showToast = useToast();
  const invalidate = useYellowFormInvalidator();
  const { data: workflow } = useYellowFormWorkflow();
  const periods = workflow?.periods;

  const [{ summary, source }] = React.useState(() => summarise(props));
  const [model, setModel] = React.useState(() => buildClaimGrid(source, props.sheet));
  // The grid as last loaded or saved; any edit replaces the model object.
  const [savedModel, setSavedModel] = React.useState(model);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = React.useState(false);
  const [saved, setSaved] = React.useState<ClaimSheet | null>(props.sheet ?? null);
  const [attempt, setAttempt] = React.useState<ClaimGridMode | null>(null);
  const [busy, setBusy] = React.useState<ClaimGridMode | null>(null);
  const [blockedCount, setBlockedCount] = React.useState(0);
  const issuesRef = React.useRef<HTMLDivElement>(null);

  const issues = attempt ? validateClaimGrid(model, attempt) : [];
  const { studentCount, rowCount } = claimGridSummary(model);
  const periodOrder = periods?.map(period => period.id);

  React.useEffect(() => {
    if (blockedCount > 0) issuesRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [blockedCount]);

  const canSave = saved ? saved.viewer_can_edit : props.preApproval?.viewer_can_file_claim_sheet ?? false;
  const canSubmit = saved ? saved.viewer_can_submit : props.preApproval?.viewer_can_file_claim_sheet ?? false;

  const persist = async (mode: ClaimGridMode) => {
    setAttempt(mode);
    if (validateClaimGrid(model, mode).length > 0) {
      setBlockedCount(count => count + 1);
      return;
    }
    setBusy(mode);
    const body = toClaimSheetUpsert(model, periodOrder);
    let stored = saved;
    try {
      stored = stored
        ? await yellowFormApi.updateClaimSheet(stored.id, body)
        : await yellowFormApi.createClaimSheet(summary.preApprovalId, body);
      setSaved(stored);
      if (mode === 'submit') {
        const submitted = await yellowFormApi.submitClaimSheet(stored.id);
        invalidate();
        showToast({ body: 'Claim sheet submitted to the Claims Coordinator.', type: 'info' });
        onSubmitted(submitted);
        return;
      }
      invalidate();
      setSavedModel(model);
      setAttempt(null);
      showToast({ body: 'Claim sheet saved as a draft.', type: 'info' });
    } catch (e) {
      const wrote = stored !== saved;
      if (wrote) {
        invalidate();
        setSavedModel(model);
      }
      const message = describeError(e);
      showToast({
        body: wrote && mode === 'submit' ? `Saved as a draft, but not submitted: ${message}` : message,
        type: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const returned = saved?.status === 'returned' && saved.review_comments ? saved : null;
  // Escape, the close button and Close all land here; ticked periods and typed attendance must not vanish.
  const close = () => (model !== savedModel ? setIsConfirmingDiscard(true) : onClose(saved));

  return (
    <>
      <Drawer
        isOpen
        onClose={close}
        purpose="form"
        width={1040}
        title={saved ? `Claim sheet ${saved.reference_number}` : 'File claim sheet'}
        subtitle={`${summary.eventName} · ${formatDateRange(summary.eventStartDate, summary.eventEndDate)}`}
        actions={
          <>
            <Button label="Close" variant="secondary" isDisabled={busy !== null} clickAction={close} />
            {saved ? <ExportCsvButton sheet={saved} size="md" /> : null}
            {canSave ? (
              <Button
                label="Save draft"
                variant="secondary"
                isDisabled={busy !== null || !periods}
                isLoading={busy === 'draft'}
                clickAction={() => persist('draft')}
              />
            ) : null}
            {canSubmit ? (
              <Button
                label="Submit to Claims Coordinator"
                variant="primary"
                isDisabled={busy !== null || !periods}
                isLoading={busy === 'submit'}
                clickAction={() => persist('submit')}
              />
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-5 text-sm">
          {returned ? (
            <Notice
              tone="warning"
              title={`Sent back by ${returned.reviewed_by_name ?? 'the Claims Coordinator'}`}
            >
              <p className="whitespace-pre-line">{returned.review_comments}</p>
              <p className="mt-1 text-xs text-secondary">Make the changes, then submit the sheet again.</p>
            </Notice>
          ) : null}

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-xs text-secondary">{summary.clubName}</p>
              <h3 className="font-heading text-base font-semibold text-primary">{summary.eventName}</h3>
            </div>
            <MetaList
              items={[
                { label: 'Event dates', value: formatDateRange(summary.eventStartDate, summary.eventEndDate) },
                {
                  label: 'Pre-approval',
                  value: (
                    <Link
                      to={`/app/clubs/yellow-forms?club=${encodeURIComponent(summary.clubId)}&open=${encodeURIComponent(summary.preApprovalId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {summary.preApprovalReference}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </Link>
                  ),
                },
                {
                  label: 'Pre-approved by',
                  value: summary.signatures.length > 0 ? summary.signatures.join(' and ') : '—',
                },
              ]}
            />
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="claim-sheet-grid-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel id="claim-sheet-grid-heading">Students and periods missed</SectionLabel>
              <p className="text-xs text-secondary" aria-live="polite">
                {studentCount} {studentCount === 1 ? 'student' : 'students'} · {rowCount}{' '}
                {rowCount === 1 ? 'row' : 'rows'} on the sheet
              </p>
            </div>
            <p className="text-xs leading-relaxed text-secondary">
              Every student from the approved pre-approval is listed. Tick the periods each one missed on
              each day, and enter their current attendance with and without claims applied. Untick
              &ldquo;Include&rdquo; for anyone who did not miss class.
            </p>

            {issues.length > 0 ? (
              <div ref={issuesRef} role="alert">
                <Notice
                  tone="error"
                  title={attempt === 'submit' ? 'Fix these before submitting' : 'Fix these before saving'}
                >
                  <ul className="list-disc pl-5">
                    {issues.map(issue => (
                      <li key={`${issue.preApprovalStudentId ?? 'sheet'}:${issue.field}:${issue.message}`}>
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </Notice>
              </div>
            ) : null}

            {periods ? (
              <ClaimGridTable
                model={model}
                periods={periods}
                issues={issues}
                isDisabled={busy !== null || !canSave}
                onChange={update => setModel(update)}
              />
            ) : (
              <div className="flex flex-col gap-2" role="status" aria-label="Loading the claim sheet">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-md bg-muted" aria-hidden="true" />
                ))}
              </div>
            )}
          </section>

          {periods && studentCount > 0 ? (
            <details className="group rounded-md border border-border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Preview as it will be exported
              </summary>
              <div className="mt-3">
                <ClaimSheetGrid
                  students={previewStudentsFromGrid(model, periodOrder)}
                  periods={periods}
                  caption="Preview of the claim sheet as exported"
                />
              </div>
            </details>
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        isOpen={isConfirmingDiscard}
        title="Discard your changes?"
        body="The periods and attendance you have entered on this claim sheet have not been saved."
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
