import React from 'react';
import { Download } from 'lucide-react';

import { PROGRAMMES } from '../content';
import { SectionIntro } from './SectionIntro';
import { AsyncContent, CardSkeleton, type SectionQuery } from './AsyncContent';
import type { Programme } from '../../../api/types';

interface Props {
  query: SectionQuery<Programme>;
  activeId: string | null;
  onToggle: (id: string) => void;
}

/**
 * The programme catalogue.
 *
 * Two deliberate departures from the design canvas:
 *
 *  1. The canvas dropped the curriculum toggle and showed only name,
 *     description and career tags. The outcomes list is real content the
 *     Content Engine serves and a prospective student wants, so the disclosure
 *     is kept — the career tags simply moved out of it and are now always
 *     visible, which is the canvas's genuine improvement.
 *
 *  2. `brochure_url` has existed on `PublicProgrammeOut` all along and was
 *     never rendered anywhere. It is now a link, shown only when present.
 *
 * `.course-card` is the GSAP reveal hook — see the contract note in
 * `HeroSection`.
 */
export const ProgrammesSection: React.FC<Props> = ({
  query,
  activeId,
  onToggle,
}) => (
  <section
    id="programmes"
    className="courses-section scroll-mt-20 bg-muted px-5 py-20 sm:px-8 lg:px-14"
  >
    <div className="mx-auto max-w-[1180px]">
      <SectionIntro heading={PROGRAMMES.heading} description={PROGRAMMES.description} />

      <AsyncContent
        query={query}
        skeleton={<CardSkeleton count={3} />}
        errorTitle="The programme catalogue didn't load"
        emptyTitle="No programmes published yet"
        emptyDescription="Programmes appear here once they are added in the content editor."
      >
        {items => (
          <div className="flex flex-wrap gap-4.5">
            {items.map(course => {
              const isOpen = activeId === course.id;
              return (
                <article
                  key={course.id}
                  className="course-card flex flex-1 basis-[300px] flex-col gap-3 rounded-lg bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <h3 className="font-heading text-[22px] font-semibold text-primary">
                    {course.name}
                  </h3>
                  {course.description ? (
                    <p className="flex-1 text-sm leading-relaxed text-secondary">
                      {course.description}
                    </p>
                  ) : null}

                  {course.careers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {course.careers.map(career => (
                        <span
                          key={career}
                          className="rounded-full bg-gold-200 px-3 py-1 text-[11px] font-medium text-gold-800"
                        >
                          {career}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {isOpen && course.outcomes.length > 0 ? (
                    <div className="animate-fade-in">
                      <h4 className="text-xs font-semibold text-primary">
                        {PROGRAMMES.outcomesHeading}
                      </h4>
                      <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-secondary">
                        {course.outcomes.map(outcome => (
                          <li key={outcome}>{outcome}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {course.outcomes.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => onToggle(course.id)}
                        aria-expanded={isOpen}
                        className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {isOpen ? PROGRAMMES.collapseCta : PROGRAMMES.expandCta}
                      </button>
                    ) : null}

                    {course.brochure_url ? (
                      <a
                        href={course.brochure_url}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        {PROGRAMMES.brochureCta}
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AsyncContent>
    </div>
  </section>
);
