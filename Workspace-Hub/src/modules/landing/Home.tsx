import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { useClubShowcase, useGallery, useProgrammes, usePublicStatistics } from '../../api/hooks';
import type { GalleryImage } from '../../api/types';
import { SiteHeader } from './sections/SiteHeader';
import { HeroSection } from './sections/HeroSection';
import { AboutSection } from './sections/AboutSection';
import { ProgrammesSection } from './sections/ProgrammesSection';
import { ClubsSection } from './sections/ClubsSection';
import { GallerySection } from './sections/GallerySection';
import { ContactFooter } from './sections/ContactFooter';
import { Lightbox } from './Lightbox';
import { META } from './content';
import { useDocumentMeta } from '../../lib/meta';

gsap.registerPlugin(ScrollTrigger);

/**
 * Should we animate entrances at all?
 *
 * The rule this page learned the hard way: NEVER hide content in a way that
 * requires JavaScript to un-hide it. gsap.from() (and, just as badly, a
 * gsap.set(opacity: 0) followed by a tween) writes the hidden state to the DOM
 * immediately, and browsers throttle requestAnimationFrame in a background or
 * occluded tab. The headline was reproducibly stranded at 0.35 opacity
 * FOREVER — the animation simply never ran.
 *
 * So the start state is only ever written when the document is actually
 * visible and the user has not asked for reduced motion. Otherwise the
 * un-animated markup — which is fully legible — is what stays on screen.
 *
 * Exported so `animation.test.ts` can pin all three branches.
 */
export function shouldAnimateEntrances(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The finished state of every entrance animation on this page. */
const ENTRANCE_END = { y: 0, opacity: 1 } as const;

/**
 * Reveal elements as their section scrolls into view.
 *
 * onLeave/refresh safety aside, the important property is the one above: if
 * the tween never runs, the element was never hidden in the first place.
 */
function revealOnScroll(selector: string, trigger: string, stagger = 0.15) {
  const targets = gsap.utils.toArray<HTMLElement>(selector);
  if (targets.length === 0) return;

  gsap.set(targets, { y: 40, opacity: 0 });
  gsap.to(targets, {
    scrollTrigger: { trigger, start: 'top 85%', toggleActions: 'play none none none' },
    ...ENTRANCE_END,
    duration: 0.8,
    stagger,
    ease: 'power3.out',
  });
}

/**
 * Force every animated element to its finished state, immediately.
 *
 * The safety net for a tab that becomes hidden PART-WAY through the timeline:
 * rAF stops, the tween freezes, and without this the user returns to a
 * half-faded page.
 *
 * This selector list must stay in step with everything `revealOnScroll` and
 * the hero timeline touch. `animation.test.ts` asserts that it does — an
 * element that is animated but not rescued is one that can still strand.
 */
export function settleEntrances(scope: HTMLElement | null) {
  if (!scope) return;
  const targets = scope.querySelectorAll<HTMLElement>(
    '.hero-badge, .hero-title, .hero-desc, .hero-cta, .stat-card, .course-card, .club-card'
  );
  gsap.set(Array.from(targets), ENTRANCE_END);
}

/**
 * The public landing page.
 *
 * ── Why this file is an orchestrator and nothing else ────────────────────────
 *
 * This was 514 lines holding the entire public site. It is now composition,
 * data and the two GSAP effects, with the markup in ./sections.
 *
 * The effects MUST stay here. They are `gsap.context(…, heroContainerRef)` and
 * they select their targets by class name, which means:
 *
 *  - every section has to render inside the `heroContainerRef` subtree, or it
 *    is invisible both to the context and to `ctx.revert()` on cleanup;
 *  - moving an effect into a child would run it before its siblings mount and
 *    would narrow the context scope to that child;
 *  - the animated class names are a contract with the section components. See
 *    the note in HeroSection.
 */
export const LandingHome: React.FC = () => {
  /*
   * The one public route, and the only one with a canonical URL: everything
   * else is either behind a login or a redirect target. The values match the
   * static tags in index.html, which stay as the no-JavaScript floor.
   */
  useDocumentMeta({
    title: META.title,
    socialTitle: META.socialTitle,
    description: META.description,
    canonicalPath: '/',
  });

  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  // The whole image, not just its URL — the lightbox needs the caption/title
  // for its accessible name, and an <img> with alt="Lightbox" tells a
  // screen-reader user nothing about what they are looking at.
  const [activeLightbox, setActiveLightbox] = useState<GalleryImage | null>(null);

  // All four are cached and deduped; the public page is the most-hit route.
  // Kept as whole query objects rather than destructured `data = []`, because
  // the sections now distinguish pending from failed from genuinely empty —
  // which the old `{ data = [] }` shape made impossible to express.
  const stats = usePublicStatistics();
  const courses = useProgrammes();
  const clubs = useClubShowcase();
  const gallery = useGallery();

  // Escape closes the lightbox.
  useEffect(() => {
    if (!activeLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveLightbox(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeLightbox]);

  const heroContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Hero entrance.
   *
   * Two rules govern everything here, both learned from a shipped bug that
   * left the headline permanently at 0.36 opacity:
   *
   *  1. NEVER animate FROM opacity: 0. Animating TO the final state means the
   *     un-animated state is the readable one, and the worst possible failure
   *     is "no animation" rather than "no content".
   *
   *  2. Only animate what is on the page NOW. This effect has empty deps;
   *     .course-card and .club-card arrive later from the API, so those
   *     tweens found zero targets and silently did nothing. They live in
   *     their own effect below, keyed on the data.
   */
  useEffect(() => {
    if (!shouldAnimateEntrances()) return;

    // If the tab is hidden mid-timeline, rAF stops and the tween freezes.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        settleEntrances(heroContainerRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      const enter = (
        selector: string,
        startY: number,
        to: gsap.TweenVars,
        position?: gsap.Position
      ) => {
        const targets = gsap.utils.toArray<HTMLElement>(selector);
        if (targets.length === 0) return;
        gsap.set(targets, { y: startY, opacity: 0 });
        tl.to(targets, { ...ENTRANCE_END, ...to }, position);
      };

      enter('.hero-badge', -30, { duration: 0.8 });
      enter('.hero-title', 50, { duration: 1.2 }, '-=0.5');
      enter('.hero-desc', 30, { duration: 0.8 }, '-=0.8');
      enter('.hero-cta', 20, { duration: 0.6, stagger: 0.15 }, '-=0.5');

      revealOnScroll('.stat-card', '.stats-section');
    }, heroContainerRef);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      ctx.revert();
    };
  }, []);

  /**
   * Card reveals for the API-driven sections.
   *
   * Keyed on the data lengths, because these elements do not exist when the
   * effect above runs. `ScrollTrigger.refresh()` afterwards because inserting
   * rows changes every downstream trigger's position.
   */
  useEffect(() => {
    const courseCount = courses.data?.length ?? 0;
    const clubCount = clubs.data?.length ?? 0;
    if (courseCount === 0 && clubCount === 0) return;
    if (!shouldAnimateEntrances()) return;

    const ctx = gsap.context(() => {
      revealOnScroll('.course-card', '.courses-section', 0.12);
      revealOnScroll('.club-card', '.clubs-section', 0.15);
      ScrollTrigger.refresh();
    }, heroContainerRef);

    return () => ctx.revert();
  }, [courses.data?.length, clubs.data?.length]);

  return (
    <div ref={heroContainerRef} className="relative w-full overflow-x-hidden bg-body">
      <SiteHeader />

      <HeroSection stats={stats.data} />
      <AboutSection />

      {/*
        * The whole query goes down, not five unpacked props. The QUERIES stay
        * here on purpose — the second GSAP effect above is keyed on
        * `[courses.data?.length, clubs.data?.length]`, so this component has
        * to be the one that sees them change.
        */}
      <ProgrammesSection
        query={courses}
        activeId={activeCourseId}
        onToggle={id => setActiveCourseId(activeCourseId === id ? null : id)}
      />

      <ClubsSection query={clubs} />

      <GallerySection query={gallery} onOpen={setActiveLightbox} />

      <ContactFooter />

      {activeLightbox ? (
        <Lightbox image={activeLightbox} onClose={() => setActiveLightbox(null)} />
      ) : null}
    </div>
  );
};
