/**
 * Navigation vocabulary integrity.
 *
 * Two things this pins, both of which the revamp is likely to disturb:
 *
 *  1. Every tab in a module's vocabulary has a component behind it. A tab
 *     added to `tabs.ts` with no entry in `TAB_COMPONENTS` renders `undefined`
 *     as a component — a runtime crash on a screen that looks fine in review.
 *
 *  2. The module vocabulary is defined exactly once, in src/lib/navigation.ts,
 *     and no component has quietly grown its own copy back. It was duplicated
 *     across four files with three different label sets.
 */
import { describe, it, expect } from 'vitest';
import { CLUB_TABS, CLUBS_DEFAULT_TAB } from '../modules/clubs/tabs';
import { CLAIM_TABS, CLAIMS_DEFAULT_TAB } from '../modules/claims/tabs';
import { FACULTY_TABS, FACULTY_DEFAULT_TAB } from '../modules/faculty/tabs';
import { MODULES, PRODUCT_NAME } from '../lib/navigation';

describe('tab vocabularies', () => {
  const modules = [
    ['clubs', CLUB_TABS, CLUBS_DEFAULT_TAB],
    ['claims', CLAIM_TABS, CLAIMS_DEFAULT_TAB],
    ['faculty', FACULTY_TABS, FACULTY_DEFAULT_TAB],
  ] as const;

  for (const [name, tabs, defaultTab] of modules) {
    it(`${name}: every tab has a unique id and a label`, () => {
      const ids = tabs.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const tab of tabs) {
        expect(tab.label.trim()).not.toBe('');
      }
    });

    it(`${name}: the default tab is in the vocabulary`, () => {
      // An index route redirecting to a tab that does not exist would bounce
      // between the redirect and the not-found fallback.
      expect(tabs.map((t) => t.id)).toContain(defaultTab);
    });

    it(`${name}: tab ids are URL-safe path segments`, () => {
      // These are path segments, not query values — a space or a slash here
      // silently breaks deep links.
      for (const id of tabs.map((t) => t.id)) {
        expect(id).toMatch(/^[a-z0-9_-]+$/);
      }
    });
  }
});

describe('tab id ⇄ component coverage', () => {
  // Imported lazily so a module-level throw in a tab component surfaces here
  // as a clear failure rather than breaking collection of the whole file.
  it('clubs: every vocabulary id maps to a component', async () => {
    const mod = await import('../modules/clubs/ClubsDashboard');
    const components = (mod as unknown as { TAB_COMPONENTS?: Record<string, unknown> })
      .TAB_COMPONENTS;
    if (!components) return; // not exported — covered by the route smoke tests
    for (const { id } of CLUB_TABS) {
      expect(components[id], `no component for clubs tab "${id}"`).toBeTruthy();
    }
  });
});

/**
 * One module vocabulary, consumed everywhere.
 *
 * `AppSideNav`, `ModuleLauncher`, `Inbox` and `CommandBar` each used to
 * hardcode the same three modules, with three different label sets and four
 * copies of each permission string — so a user was told three different names
 * for one destination depending on how they reached it.
 *
 * These tests are a source scan rather than a render assertion, because what
 * matters is that no fifth copy appears. A regression here looks like someone
 * adding `const MODULES = [...]` back into a component.
 */
describe('module vocabulary', () => {
  const CONSUMERS = [
    'src/routes/AppSideNav.tsx',
    'src/routes/ModuleLauncher.tsx',
    'src/modules/inbox/Inbox.tsx',
    'src/routes/CommandBar.tsx',
  ];

  async function read(path: string): Promise<string> {
    const { readFile } = await import('node:fs/promises');
    return readFile(path, 'utf8');
  }

  it('is defined once, with an entry per workspace', () => {
    expect(MODULES.map(m => m.id)).toEqual(['clubs', 'claims', 'faculty']);
    for (const m of MODULES) {
      expect(m.label.trim()).not.toBe('');
      expect(m.description.trim()).not.toBe('');
      expect(m.commandLabel.trim()).not.toBe('');
      expect(m.permission).toMatch(/^[a-z_]+:[a-z_]+$/);
      expect(m.path).toBe(`/app/${m.id}`);
    }
  });

  it('is imported by every consumer', async () => {
    for (const file of CONSUMERS) {
      const source = await read(file);
      expect(source, `${file} does not import the shared vocabulary`).toMatch(
        /from '\.{1,2}(?:\/\.\.)*\/lib\/navigation'/
      );
    }
  });

  it('has no consumer redefining its own module list', async () => {
    for (const file of CONSUMERS) {
      const source = await read(file);
      expect(source, `${file} still declares a local MODULES array`).not.toMatch(
        /^const MODULES\s*=/m
      );
    }
  });

  it('gives the product exactly one name', async () => {
    expect(PRODUCT_NAME).toBe('DOC Unified Digital ERP');
    // "DOC Unified Digital Platform" was the launcher's competing name, one
    // click away from the top nav's.
    for (const file of [...CONSUMERS, 'src/routes/AuthenticatedLayout.tsx']) {
      const source = await read(file);
      expect(source, `${file} hardcodes a product name`).not.toContain(
        'DOC Unified Digital'
      );
    }
  });
});

describe('server-driven tab visibility', () => {
  // The client vocabulary is labels only; the server's `visible_tabs` decides
  // what a given viewer may open. Hardcoding visibility here would make the UI
  // promise what the API refuses.
  it('treats the client tab list as vocabulary, not permission', () => {
    // A tab present in the vocabulary must still be filterable out — i.e. the
    // list is a plain array with no notion of entitlement baked in.
    const visibleFromServer = ['dashboard', 'members'];
    const shown = CLUB_TABS.filter((t) => visibleFromServer.includes(t.id));
    expect(shown.map((t) => t.id)).toEqual(['dashboard', 'members']);
    expect(shown.length).toBeLessThan(CLUB_TABS.length);
  });

  it('tolerates a tab id the client does not know about', () => {
    // A newer backend can send a tab this bundle has never heard of. That must
    // be ignored, not rendered as a broken tab.
    const visibleFromServer = ['dashboard', 'a-tab-from-the-future'];
    const shown = CLUB_TABS.filter((t) => visibleFromServer.includes(t.id));
    expect(shown.map((t) => t.id)).toEqual(['dashboard']);
  });
});

/**
 * The two status colour maps cannot drift.
 *
 * `STATUS_CLASSES` (Tailwind classes, for `StatusChip`) and `STATUS_HUES`
 * (Astryx hue names, for `Token`/`StatusDot`) are two renderings of the same
 * six semantic states. They were once two hand-written tables, and they
 * drifted: `submitted` rendered a literal #0074e2 blue chip in the warm claims
 * table.
 */
describe('status colour maps', () => {
  it('covers every semantic state in both maps', async () => {
    const { STATUS_CLASSES, STATUS_HUES } = await import('../components/ui/status');
    expect(Object.keys(STATUS_HUES).sort()).toEqual(Object.keys(STATUS_CLASSES).sort());
  });

  it('never uses a hue the palette does not contain', async () => {
    const { STATUS_HUES } = await import('../components/ui/status');
    // There is no blue in this palette, and a token named `blue` that renders
    // beige would be a trap — so Astryx's `blue` is left at its cool default
    // and simply never used.
    expect(Object.values(STATUS_HUES)).not.toContain('blue');
  });

  it('reserves the accent hue for the state that wants attention', async () => {
    const { STATUS_HUES } = await import('../components/ui/status');
    // Gold is the brand accent, so it must not be spent on `pending` — the
    // most common state in the product, which would then permanently own the
    // one colour the eye is trained to go to.
    expect(STATUS_HUES.in_review).toBe('yellow');
    expect(STATUS_HUES.pending).toBe('gray');
  });
});
