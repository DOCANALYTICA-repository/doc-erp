import React from 'react';

import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

/**
 * A side panel for looking at one record without leaving the list.
 *
 * ── Why this instead of a route ─────────────────────────────────────────────
 *
 * Reviewing a queue means opening an item, deciding, and moving to the next
 * one. Navigating away and back for each loses the list's scroll position, its
 * pagination page and any filter — so a reviewer working through twenty claims
 * paid that cost twenty times.
 *
 * ── Built on Astryx `Dialog`, deliberately ──────────────────────────────────
 *
 * The obvious implementation is a `fixed inset-y-0 right-0` panel. That is
 * exactly what `NotificationTray` was, and it declared
 * `role="dialog" aria-modal="true"` while honouring neither: no backdrop, so
 * the page behind stayed clickable while a screen reader was told it was
 * inert; and no focus trap, so Tab walked straight out of the "modal" and
 * never came back.
 *
 * `Dialog` supplies the backdrop, the focus trap, focus-on-open, focus restore
 * on close and Escape. Pinning it to the right edge with `position` makes it
 * read as a drawer while keeping all of that.
 *
 * `purpose` defaults to `'info'` (backdrop click dismisses). Pass `'form'`
 * when the drawer contains inputs, so a stray click cannot discard typing.
 */
export const Drawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Status chip or badge, shown in the header before the close button. */
  headerContent?: React.ReactNode;
  /** Action buttons, pinned below the content. */
  actions?: React.ReactNode;
  /** `'form'` when the drawer contains inputs — see above. */
  purpose?: 'info' | 'form';
  width?: number;
  children: React.ReactNode;
}> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerContent,
  actions,
  purpose = 'info',
  width = 480,
  children,
}) => {
  if (!isOpen) return null;

  const handleOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    <Dialog
      isOpen
      onOpenChange={handleOpenChange}
      purpose={purpose}
      width={width}
      maxHeight="calc(100dvh - 32px)"
      // Flush to the right edge, top-aligned under the app's 4rem top nav.
      position={{ top: 16, right: 16 }}
      /*
       * Names the dialog element itself.
       *
       * Astryx's own strategy is to focus `DialogHeader`'s h2 on open, so the
       * title is announced at that moment — but the `<dialog>` carries
       * `role="dialog" aria-modal="true"` with no name of its own, so anyone
       * who arrives at it afterwards (rotor, landmark navigation, or simply
       * tabbing back to the container) is told "dialog" and nothing else.
       * `aria-label` costs nothing and does not disturb the focus behaviour.
       */
      aria-label={title}
    >
      <DialogHeader
        title={title}
        subtitle={subtitle}
        onOpenChange={handleOpenChange}
        endContent={headerContent}
      />

      <div className="overflow-y-auto px-6 py-5">{children}</div>

      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          {actions}
        </div>
      ) : null}
    </Dialog>
  );
};
