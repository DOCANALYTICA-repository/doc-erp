import React from 'react';
import { Eye } from 'lucide-react';

import { GALLERY } from '../content';
import { SectionIntro } from './SectionIntro';
import { AsyncContent, type SectionQuery } from './AsyncContent';
import type { GalleryImage } from '../../../api/types';

interface Props {
  query: SectionQuery<GalleryImage>;
  onOpen: (image: GalleryImage) => void;
}

/**
 * The photo gallery.
 *
 * KEPT DELIBERATELY. The design canvas removed this section and its nav entry
 * altogether, but it is a working feature with a public endpoint
 * (`GET /content/gallery`) and an admin editor behind it, so removing it would
 * have been a silent functionality loss dressed up as a redesign.
 *
 * Each tile is a real `<button>`, not a clickable `<div>` — the latter cannot
 * be reached by keyboard and is announced as nothing.
 *
 * `img.caption` was typed on `PublicGalleryImageOut` and never rendered. It is
 * now a `<figcaption>`, and the lightbox prefers it over the bare title for
 * its accessible name.
 */
export const GallerySection: React.FC<Props> = ({
  query,
  onOpen,
}) => (
  <section id="gallery" className="scroll-mt-20 bg-muted px-5 py-20 sm:px-8 lg:px-14">
    <div className="mx-auto max-w-[1180px]">
      <SectionIntro heading={GALLERY.heading} description={GALLERY.description} />

      <AsyncContent
        query={query}
        skeleton={
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-sand-300" />
            ))}
          </div>
        }
        errorTitle="The gallery didn't load"
        emptyTitle="No photographs yet"
        emptyDescription="Images added in the content editor appear here."
      >
        {items => (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {items.map(img => (
              <figure key={img.id} className="m-0">
                <button
                  type="button"
                  onClick={() => onOpen(img)}
                  aria-label={GALLERY.viewLabel(img.title)}
                  className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-border bg-sand-300 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <img
                    src={img.url}
                    loading="lazy"
                    decoding="async"
                    alt={img.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-sand-900/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Eye className="h-6 w-6 text-sand-100" aria-hidden="true" />
                  </span>
                </button>
                {img.caption ? (
                  <figcaption className="mt-2 text-[11px] text-secondary">
                    {img.caption}
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        )}
      </AsyncContent>
    </div>
  </section>
);
