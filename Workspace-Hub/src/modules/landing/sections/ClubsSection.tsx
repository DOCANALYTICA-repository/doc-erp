import React from 'react';

import { CLUBS } from '../content';
import { SectionIntro } from './SectionIntro';
import { AsyncContent, CardSkeleton, type SectionQuery } from './AsyncContent';
import { ClubAvatar } from '../../../components/ui/ClubAvatar';
import type { ShowcaseClub } from '../../../api/types';

interface Props {
  query: SectionQuery<ShowcaseClub>;
}

/**
 * The club showcase.
 *
 * `club.logo` was on `ShowcaseClubOut` all along and the public page never
 * rendered it — the workspace UI showed initials, the landing page showed
 * nothing. It now goes through `ClubAvatar`, which already handles the
 * initials fallback for clubs with no logo (which is all of them in the
 * seed data).
 *
 * `.club-card` is the GSAP reveal hook — see the contract note in `HeroSection`.
 */
export const ClubsSection: React.FC<Props> = ({
  query,
}) => (
  <section id="clubs" className="clubs-section scroll-mt-20 px-5 py-20 sm:px-8 lg:px-14">
    <div className="mx-auto max-w-[1180px]">
      <SectionIntro
        eyebrow={CLUBS.eyebrow}
        heading={CLUBS.heading}
        description={CLUBS.description}
      />

      <AsyncContent
        query={query}
        skeleton={<CardSkeleton count={2} height="h-44" />}
        errorTitle="The club list didn't load"
        emptyTitle="No clubs published yet"
        emptyDescription="Active clubs appear here automatically."
      >
        {items => (
          <div className="flex flex-wrap gap-4.5">
            {items.map(club => (
              <article
                key={club.id}
                className="club-card flex-1 basis-[320px] rounded-lg bg-muted p-7 transition-transform hover:-translate-y-0.5"
              >
                <div className="mb-3.5 flex items-center gap-3.5">
                  <ClubAvatar name={club.name} logo={club.logo} size={56} />
                  <div className="min-w-0">
                    <h3 className="font-heading text-[23px] font-semibold text-primary">
                      {club.name}
                    </h3>
                    {club.category ? (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.11em] text-secondary">
                        {club.category}
                      </span>
                    ) : null}
                  </div>
                </div>

                {club.description ? (
                  <p className="text-[14.5px] leading-[1.65] text-secondary">{club.description}</p>
                ) : null}

                {club.contact_email ? (
                  <div className="mt-5 flex flex-wrap items-baseline gap-2 border-t border-border pt-4 text-xs">
                    <span className="text-secondary">{CLUBS.contactLabel}</span>
                    <a
                      href={`mailto:${club.contact_email}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {club.contact_email}
                    </a>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </AsyncContent>
    </div>
  </section>
);
