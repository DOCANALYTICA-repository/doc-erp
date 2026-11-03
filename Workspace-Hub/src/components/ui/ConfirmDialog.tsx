import React from 'react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';

import { FormError } from './form/FormError';

/**
 * "Are you sure?" — the design canvas's `confirm` overlay.
 *
 * ── When to use it, and when not to ─────────────────────────────────────────
 *
 * For an action that **destroys something or cannot be undone**, and that has
 * no other guard. It is deliberately NOT on every write:
 *
 *  - Approve / Send back / Reject on a claim or plan already require a typed
 *    reason, or move a workflow one reversible step. Adding a dialog would put
 *    two clicks between a reviewer and every item in a queue of twenty, which
 *    is how people learn to click through dialogs without reading them.
 *  - Deleting a hierarchy level, by contrast, is one hover-revealed icon away
 *    from permanent, with nothing in between.
 *
 * A confirmation used everywhere confirms nothing.
 *
 * ── The optional note ───────────────────────────────────────────────────────
 *
 * The canvas includes "Note for the record (optional)". Pass `noteLabel` to
 * show it and the note arrives as the `onConfirm` argument. Omit it and the
 * dialog is title + body + buttons.
 *
 * ── Behaviour ───────────────────────────────────────────────────────────────
 *
 * Built on Astryx `Dialog` with `purpose="required"`, which disables Escape
 * and backdrop dismissal: for a destructive action, "I clicked outside it"
 * must not be indistinguishable from "I decided not to". Cancel is the only
 * way out, and it is focused first — so Enter on an unread dialog cancels
 * rather than confirms.
 */
/** Ties the dialog's accessible name to its own heading. */
const HEADING_ID = 'confirm-dialog-title';

export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  body: string;
  /** The confirming button's label. Name the action — never "OK". */
  confirmLabel: string;
  /** Show the optional note field, with this label. */
  noteLabel?: string;
  /** `true` while the action is running. */
  isBusy?: boolean;
  /** Shown inside the dialog when the action fails, so the dialog stays put. */
  error?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}> = ({
  isOpen,
  title,
  body,
  confirmLabel,
  noteLabel,
  isBusy,
  error,
  onConfirm,
  onCancel,
}) => {
  const [note, setNote] = React.useState('');

  // Clear the note whenever the dialog opens, so a previous decision's text
  // cannot be attached to this one.
  React.useEffect(() => {
    if (isOpen) setNote('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen
      onOpenChange={next => {
        if (!next && !isBusy) onCancel();
      }}
      purpose="required"
      width={440}
      /*
       * The `<dialog>` carries `role="dialog" aria-modal="true"` and, without
       * this, no name — so it is announced as a bare "dialog". This one asks
       * for confirmation of something irreversible, which is precisely when
       * the name needs to be unambiguous. Points at the h2 below rather than
       * duplicating its text, so the two cannot drift.
       */
      aria-labelledby={HEADING_ID}
    >
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 id={HEADING_ID} className="font-heading text-lg font-semibold text-primary">
            {title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">{body}</p>
        </div>

        {noteLabel ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-secondary" htmlFor="confirm-note">
              {noteLabel}
            </label>
            <textarea
              id="confirm-note"
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-primary"
            />
          </div>
        ) : null}

        <FormError message={error} />

        <div className="flex flex-wrap justify-end gap-2">
          {/*
            * Cancel first in the DOM so it takes focus on open. On a
            * destructive dialog the safe option should be the one a stray
            * Enter hits.
            */}
          <Button
            label="Cancel"
            variant="secondary"
            size="sm"
            isDisabled={isBusy}
            clickAction={onCancel}
          />
          <Button
            label={confirmLabel}
            variant="destructive"
            size="sm"
            isDisabled={isBusy}
            clickAction={() => onConfirm(note)}
          />
        </div>
      </div>
    </Dialog>
  );
};
