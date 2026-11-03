/**
 * The landing page's animation safety contract.
 *
 * This page has already shipped the bug these tests exist to prevent: the
 * headline was stranded at 0.36 opacity forever, because the hidden start state
 * was written to the DOM and then `requestAnimationFrame` was throttled in a
 * background tab, so the tween that would have revealed it never ran.
 *
 * The invariant that came out of that: **content is never hidden in a way that
 * requires JavaScript to un-hide it.** Concretely, `shouldAnimateEntrances()`
 * must return false whenever the animation might not run — and when it returns
 * false, the un-animated markup is what ships, fully legible.
 *
 * Phase 3 decomposes this 514-line page into section components. That refactor
 * is exactly when someone moves an effect into a child, or renames a class the
 * parent selects on, and re-introduces the bug. These tests are the tripwire.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { shouldAnimateEntrances } from './Home';

/** The elements the parent effect animates, selected by class name. */
const ANIMATED_CLASSES = [
  'hero-badge',
  'hero-title',
  'hero-desc',
  'hero-cta',
  'stat-card',
  'course-card',
  'club-card',
] as const;

function setReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
}

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shouldAnimateEntrances', () => {
  it('animates on a visible tab with motion allowed', () => {
    setVisibility('visible');
    setReducedMotion(false);
    expect(shouldAnimateEntrances()).toBe(true);
  });

  it('does not animate when the user asked for reduced motion', () => {
    // Not a preference to honour cosmetically — if we hid content and then
    // skipped the tween, it would stay hidden.
    setVisibility('visible');
    setReducedMotion(true);
    expect(shouldAnimateEntrances()).toBe(false);
  });

  it('does not animate when the tab is hidden at mount', () => {
    // rAF is throttled in a background tab, so a tween queued here may never
    // run. This is the exact condition that produced the shipped bug.
    setVisibility('hidden');
    setReducedMotion(false);
    expect(shouldAnimateEntrances()).toBe(false);
  });

  it('does not animate when the tab is merely occluded', () => {
    setVisibility('hidden');
    setReducedMotion(true);
    expect(shouldAnimateEntrances()).toBe(false);
  });
});

describe('the class-name contract between the page and its sections', () => {
  // These class names are the API between the GSAP effects (which stay in
  // Home.tsx) and the markup (which Phase 3 moves into child components).
  // Renaming one in a child silently disconnects it from its reveal.
  it('lists the animated classes explicitly so a rename is a visible diff', () => {
    expect(ANIMATED_CLASSES).toMatchInlineSnapshot(`
      [
        "hero-badge",
        "hero-title",
        "hero-desc",
        "hero-cta",
        "stat-card",
        "course-card",
        "club-card",
      ]
    `);
  });

  it('is the same set that settleEntrances rescues', async () => {
    // `settleEntrances` is the visibilitychange safety net: if the tab is
    // hidden PART-WAY through the timeline the tween freezes, and this forces
    // every animated element to its finished state. Its selector list must not
    // drift from the list of things actually animated — an element animated but
    // not rescued is one that can still strand.
    const source = await import('./Home?raw').then(
      (m) => (m as unknown as { default: string }).default
    );
    const selectorBlock = source.slice(
      source.indexOf('function settleEntrances'),
      source.indexOf('function settleEntrances') + 600
    );
    for (const cls of ANIMATED_CLASSES) {
      expect(selectorBlock, `settleEntrances does not rescue .${cls}`).toContain(
        `.${cls}`
      );
    }
  });
});

describe('no gsap.from anywhere on the landing page', () => {
  it('never animates FROM a hidden state', async () => {
    // `gsap.from()` writes the hidden start state to the DOM immediately. If
    // the timeline is throttled, the element is stranded invisible with nothing
    // left to finish the job. The page must always animate TO its final state,
    // so that "no animation" is the worst possible outcome rather than "no
    // content".
    const source = await import('./Home?raw').then(
      (m) => (m as unknown as { default: string }).default
    );
    // Strip comments first — the rule is discussed at length in prose here.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/gsap\s*\.\s*from\s*\(/);
    expect(code).not.toMatch(/\.fromTo\s*\(/);
  });
});
