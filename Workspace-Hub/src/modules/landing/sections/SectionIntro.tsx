import React from 'react';

/**
 * The heading block that opens each landing section.
 *
 * `h2` — the page's single `h1` is the hero headline. Every section used to
 * hand-write this trio (eyebrow, heading, description) with slightly different
 * sizes.
 */
export const SectionIntro: React.FC<{
  heading: string;
  description?: string;
  eyebrow?: string;
}> = ({ heading, description, eyebrow }) => (
  <div className="mb-9 max-w-[56ch]">
    {eyebrow ? (
      <span className="text-xs font-semibold uppercase tracking-[0.11em] text-accent">
        {eyebrow}
      </span>
    ) : null}
    <h2 className="mt-1 font-heading text-3xl font-semibold tracking-tight text-primary md:text-[38px]">
      {heading}
    </h2>
    {description ? (
      <p className="mt-2.5 text-[15.5px] leading-relaxed text-secondary">{description}</p>
    ) : null}
  </div>
);
