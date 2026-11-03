import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useToast } from '@astryxdesign/core/Toast';

import { useEligibleStudents } from '../../../api/hooks';
import type { StudentLookup } from '../../../api/types';
import { describeError } from '../../../services/errors';
import { yellowFormApi } from '../../yellow-forms';
import { CHECKBOX_CLASS, cellInputClass } from './inputs';
import {
  isListed,
  normaliseRegisterNumber,
  rowFromEligible,
  rowFromLookup,
  type StudentRow,
} from './preApprovalForm';

type ListedRows = Pick<StudentRow, 'student_id' | 'register_number'>[];

/** "Add club members": tick active members of the club, then add them in one go. */
export const ClubMemberPicker: React.FC<{
  clubId: string;
  listed: ListedRows;
  onAdd: (rows: StudentRow[]) => void;
  onClose: () => void;
}> = ({ clubId, listed, onAdd, onClose }) => {
  const { data, isLoading, isError, error, refetch } = useEligibleStudents(clubId);
  const [filter, setFilter] = React.useState('');
  const [selected, setSelected] = React.useState<string[]>([]);

  const members = data ?? [];
  const query = filter.trim().toLowerCase();
  const shown = members.filter(
    member =>
      !query ||
      member.student_name.toLowerCase().includes(query) ||
      member.register_number.toLowerCase().includes(query),
  );

  const toggle = (studentId: string, isChecked: boolean) =>
    setSelected(prev => (isChecked ? [...prev, studentId] : prev.filter(id => id !== studentId)));

  const add = () => {
    onAdd(members.filter(member => selected.includes(member.student_id)).map(rowFromEligible));
    setSelected([]);
    onClose();
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-primary">Add club members</p>
        <input
          type="search"
          aria-label="Filter club members"
          placeholder="Filter by name or register number"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className={cellInputClass(false, 'w-64 max-w-full')}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-secondary" role="status">Loading club members…</p>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-error">Club members didn&apos;t load: {describeError(error)}</p>
          <Button label="Try again" variant="secondary" size="sm" clickAction={() => void refetch()} />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-secondary">The club has no active members to add.</p>
      ) : (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
          {shown.map(member => {
            const isAlreadyListed = isListed(listed, member);
            return (
              <li key={member.student_id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className={CHECKBOX_CLASS}
                    checked={isAlreadyListed || selected.includes(member.student_id)}
                    disabled={isAlreadyListed}
                    onChange={e => toggle(member.student_id, e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-primary">{member.student_name}</span>
                    <span className="block text-xs text-secondary">
                      {[member.register_number || 'No register number on file', member.class_name_suggestion]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {isAlreadyListed ? <span className="text-xs text-secondary">On the list</span> : null}
                </label>
              </li>
            );
          })}
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-secondary">No members match &ldquo;{filter}&rdquo;.</li>
          ) : null}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button label="Close" variant="ghost" size="sm" clickAction={onClose} />
        <Button
          label={
            selected.length === 0
              ? 'Add students'
              : `Add ${selected.length} ${selected.length === 1 ? 'student' : 'students'}`
          }
          variant="secondary"
          size="sm"
          isDisabled={selected.length === 0}
          clickAction={add}
        />
      </div>
    </div>
  );
};

/**
 * "Add by register number": finds the student's portal account and fills in
 * their name and class. Students without an account can still be added by
 * typing their name.
 */
export const AddByRegisterNumber: React.FC<{
  clubId: string;
  defaultRole: string;
  listed: ListedRows;
  onAdd: (row: StudentRow) => void;
}> = ({ clubId, defaultRole, listed, onAdd }) => {
  const showToast = useToast();
  const inputId = React.useId();
  const nameId = React.useId();
  const [value, setValue] = React.useState('');
  const [isBusy, setIsBusy] = React.useState(false);
  const [notFound, setNotFound] = React.useState<StudentLookup | null>(null);
  const [manualName, setManualName] = React.useState('');
  const [message, setMessage] = React.useState('');

  const lookUp = async () => {
    const registerNumber = normaliseRegisterNumber(value);
    setNotFound(null);
    setMessage('');
    if (!registerNumber) return;
    if (isListed(listed, { register_number: registerNumber })) {
      setMessage(`${registerNumber} is already on the list.`);
      return;
    }
    setIsBusy(true);
    try {
      const result = await yellowFormApi.lookupStudent(clubId, registerNumber);
      if (result.found) {
        onAdd(rowFromLookup(result, defaultRole));
        setValue('');
        setMessage(`Added ${result.student_name ?? registerNumber}.`);
      } else {
        setNotFound(result);
        setManualName('');
      }
    } catch (e) {
      showToast({ body: describeError(e), type: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  const addManually = () => {
    const name = manualName.trim();
    if (!notFound || !name) return;
    onAdd(rowFromLookup(notFound, defaultRole, name));
    setMessage(`Added ${name}.`);
    setNotFound(null);
    setManualName('');
    setValue('');
  };

  // These inputs sit inside the editor's <form>; Enter must not save the draft.
  const onEnter = (run: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-secondary">
        Add by register number
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          value={value}
          maxLength={20}
          autoComplete="off"
          onChange={e => setValue(e.target.value)}
          onKeyDown={onEnter(() => void lookUp())}
          className={cellInputClass(false, 'w-44')}
        />
        <Button
          label="Look up"
          variant="secondary"
          size="sm"
          isLoading={isBusy}
          isDisabled={isBusy || !value.trim()}
          clickAction={lookUp}
        />
      </div>

      {notFound ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <p className="text-sm text-primary">
            No student account has register number{' '}
            <span className="font-medium">{notFound.register_number}</span>. Enter their name to add
            them anyway.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={nameId} className="text-xs font-medium text-secondary">
                Student name
              </label>
              <input
                id={nameId}
                value={manualName}
                maxLength={120}
                autoComplete="off"
                onChange={e => setManualName(e.target.value)}
                onKeyDown={onEnter(addManually)}
                className={cellInputClass(false, 'w-64 max-w-full')}
              />
            </div>
            <Button
              label="Add student"
              variant="secondary"
              size="sm"
              isDisabled={!manualName.trim()}
              clickAction={addManually}
            />
          </div>
        </div>
      ) : null}

      <p aria-live="polite" className="min-h-4 text-xs text-secondary">
        {message}
      </p>
    </div>
  );
};
