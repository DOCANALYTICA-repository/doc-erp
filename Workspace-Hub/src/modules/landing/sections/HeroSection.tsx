import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { HERO, STATS } from '../content';
import type { PublicStatistics } from '../../../api/types';

/**
 * Hero, with the statistics band inside it.
 *
 * The stats used to be a separate full-width band below the fold line; the
 * design pulls them up into the hero so the first screen carries a claim AND
 * the evidence for it.
 *
 * ── GSAP contract ───────────────────────────────────────────────────────────
 * `.hero-badge`, `.hero-title`, `.hero-desc`, `.hero-cta` and `.stat-card`
 * are the API between this markup and the timeline in `Home.tsx`. Renaming one
 * here disconnects it from its reveal and, worse, from `settleEntrances` —
 * which is the only thing that un-hides an element if the tab is backgrounded
 * mid-animation. Do not rename them without changing both effects.
 */
export const HeroSection: React.FC<{ stats?: PublicStatistics }> = ({ stats }) => {
  const navigate = useNavigate();

  const tiles = [
    { label: STATS.labels.students, value: stats ? `${stats.total_students}+` : STATS.placeholder },
    { label: STATS.labels.faculty, value: stats ? `${stats.faculty_count}+` : STATS.placeholder },
    { label: STATS.labels.clubs, value: stats ? `${stats.number_of_clubs}` : STATS.placeholder },
    {
      label: STATS.labels.legacy,
      value: stats ? `${stats.years_established} ${STATS.legacySuffix}` : STATS.placeholder,
    },
  ];

  return (
    <section className="stats-section relative overflow-hidden px-5 pb-16 pt-12 sm:px-8 lg:px-14 lg:pt-20">
      {/*
        * Decorative shapes. These replace a GSAP path-morph on an SVG blob that
        * ran `yoyo, repeat: -1` — an infinite animation is a liability for
        * anyone sensitive to motion, and it sat outside the reduced-motion
        * guard. Static shapes with a one-shot fade say the same thing.
        */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-44 h-[520px] w-[520px] rounded-full bg-gold-200 opacity-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-36 right-44 h-[300px] w-[300px] rounded-full bg-sage-200 opacity-70"
      />

      <div className="relative mx-auto max-w-[1180px]">
        <span className="hero-badge inline-flex items-center gap-2.5 rounded-full border border-border bg-muted px-4 py-1.5 text-xs font-semibold tracking-wide text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          {HERO.badge}
        </span>

        <h1 className="hero-title mt-5 max-w-[22ch] font-heading text-[38px] font-semibold leading-[1.06] tracking-tight text-primary sm:text-5xl lg:text-[62px]">
          {HERO.title}
        </h1>

        <p className="hero-desc mt-5 max-w-[58ch] text-[17px] leading-[1.65] text-secondary">
          {HERO.description}
        </p>

        <div className="hero-cta mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {HERO.primaryCta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <a
            href="#programmes"
            className="rounded-full bg-card px-6 py-3 text-[15px] font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {HERO.secondaryCta}
          </a>
        </div>

        <dl className="mt-14 flex flex-wrap gap-3.5">
          {tiles.map(tile => (
            <div
              key={tile.label}
              className="stat-card flex-1 basis-[190px] rounded-lg bg-muted px-6 py-5"
            >
              <dd className="font-heading text-[32px] font-semibold leading-[1.1] tabular-nums text-primary">
                {tile.value}
              </dd>
              <dt className="mt-2 text-[11px] font-medium uppercase tracking-[0.11em] text-secondary">
                {tile.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};
