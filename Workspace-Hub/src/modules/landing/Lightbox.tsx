import React from 'react';

import { GALLERY } from './content';
import type { GalleryImage } from '../../api/types';

/**
 * Full-size view of a gallery image.
 *
 * The accessible name prefers `caption` over `title`, because a caption
 * describes the photograph and a title is often just a filename-ish label.
 *
 * Dismissal: Escape (handled by the effect in `Home.tsx`), a backdrop click,
 * and an explicit Close button. There is deliberately more than one way out —
 * a modal dismissable only by clicking its backdrop is a trap for keyboard
 * users.
 */
export const Lightbox: React.FC<{ image: GalleryImage; onClose: () => void }> = ({
  image,
  onClose,
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={image.caption ?? image.title}
    onClick={onClose}
    className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-sand-900/95 p-4"
  >
    <img
      src={image.url}
      decoding="async"
      alt={image.title}
      className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-lg"
    />
    <p className="mt-4 text-sm text-sand-200">{image.caption ?? image.title}</p>
    <button
      type="button"
      onClick={onClose}
      className="absolute right-4 top-4 rounded-full bg-sand-100/10 px-4 py-2 text-sm text-sand-100 hover:bg-sand-100/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {GALLERY.closeLabel}
    </button>
  </div>
);
