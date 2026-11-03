import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { DateInput } from '@astryxdesign/core/DateInput';

import { toFieldStatus } from './fieldStatus';

/**
 * Form controls bound to react-hook-form.
 *
 * These are thin on purpose. Astryx's inputs already render a real `<label>`
 * with `htmlFor`, take a `status={{type, message}}` that sets `aria-invalid`
 * and wires `aria-describedby`, and mark required fields. All that was missing
 * was the wiring — so each of these is a `<Controller>` plus one call to
 * `toFieldStatus`.
 *
 * What they replace: 33 hand-built controls across 21 files, each a
 * `<div className="flex flex-col gap-1.5">` wrapping a bare `<label>` and a
 * raw `<input>` with its own copy of the border/padding classes, and no error
 * display at all.
 *
 * There is deliberately no `SwitchField`. The only boolean control in the app
 * is on the notification preferences screen, and those save the moment they
 * are flipped rather than on a submit — so binding them to react-hook-form
 * would imply unsaved state where there is none. That screen uses Astryx
 * `Switch` directly. Add a `SwitchField` when a form genuinely needs a boolean
 * on submit; an unused wrapper is the dead code this layer exists to remove.
 *
 * ── Why `Controller` rather than `register` ─────────────────────────────────
 *
 * `register` needs a DOM `ref` and native `onChange` events. Astryx's inputs
 * are controlled components with `(value) => void` callbacks and no forwarded
 * input ref, so `Controller` is the correct integration. It also means the
 * value types stay honest — `NumberInput` really does hand back a `number`.
 *
 * ── A constraint worth knowing before you reach for these ───────────────────
 *
 * Astryx input props extend `React.HTMLAttributes`, NOT
 * `React.InputHTMLAttributes`. So they accept no `name` and no `autoComplete`,
 * and there is no escape hatch to pass them through.
 *
 * That is fine for in-app forms. It is NOT fine for a credential form: a
 * browser's password manager keys on `name` and `autoComplete`
 * ("username" / "current-password") to decide whether to offer to fill and
 * save. `LoginPage` therefore keeps native `<input>` elements bound with rhf's
 * `register`, which works perfectly on native inputs — see the comment there.
 * Do not "tidy" it onto `TextField`.
 */

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: string;
  description?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  placeholder,
  type = 'text',
}: BaseProps<T> & {
  type?: 'text' | 'email' | 'password';
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextInput
          type={type}
          label={label}
          description={description}
          isRequired={isRequired}
          isDisabled={isDisabled}
          placeholder={placeholder}
          value={field.value ?? ''}
          onChange={value => field.onChange(value)}
          onBlur={field.onBlur}
          status={toFieldStatus(fieldState.error)}
        />
      )}
    />
  );
}

export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  placeholder,
  rows = 3,
  maxLength,
}: BaseProps<T> & { rows?: number; maxLength?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextArea
          label={label}
          description={description}
          isRequired={isRequired}
          isDisabled={isDisabled}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          value={field.value ?? ''}
          onChange={value => field.onChange(value)}
          onBlur={field.onBlur}
          status={toFieldStatus(fieldState.error)}
        />
      )}
    />
  );
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  placeholder,
  min,
  max,
}: BaseProps<T> & { min?: number; max?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberInput
          label={label}
          description={description}
          isRequired={isRequired}
          isDisabled={isDisabled}
          placeholder={placeholder}
          min={min}
          max={max}
          // `?? undefined`, not `?? 0`: an empty numeric field is not the
          // number zero, and defaulting to 0 would make "how much?" answer
          // itself — a budget request would silently submit as ₹0.
          value={field.value ?? undefined}
          onChange={value => field.onChange(value)}
          status={toFieldStatus(fieldState.error)}
        />
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
  placeholder,
  options,
}: BaseProps<T> & { options: { value: string; label: string }[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Selector
          label={label}
          description={description}
          isRequired={isRequired}
          isDisabled={isDisabled}
          placeholder={placeholder}
          options={options}
          value={field.value ?? ''}
          onChange={value => field.onChange(value)}
          status={toFieldStatus(fieldState.error)}
        />
      )}
    />
  );
}

// Astryx commits a typed date on Enter but leaves its calendar open, covering the fields above it.
function closeCalendarOnEnter(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
  if (e.target.getAttribute('aria-expanded') !== 'true') return;
  e.currentTarget.querySelector<HTMLButtonElement>('button[aria-label="Close calendar"]')?.click();
}

export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  isRequired,
  isDisabled,
}: Omit<BaseProps<T>, 'placeholder'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="contents" onKeyDown={closeCalendarOnEnter}>
          <DateInput
            label={label}
            description={description}
            isRequired={isRequired}
            isDisabled={isDisabled}
            value={field.value ?? undefined}
            // A cleared DateInput reports undefined; the date schemas expect '', so their own message shows.
            onChange={value => field.onChange(value ?? '')}
            status={toFieldStatus(fieldState.error)}
          />
        </div>
      )}
    />
  );
}
