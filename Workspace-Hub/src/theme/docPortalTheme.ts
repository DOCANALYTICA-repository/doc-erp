import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

/**
 * The DOC Portal visual language.
 *
 * Source of truth: `design/DOC Portal.dc.html`, lines 16–28. That block is the
 * authoritative override on top of the "Organic" starter system it links; the
 * starter's own stylesheet under `_ds/organic-<id>/` is STALE (terracotta `#c67139`,
 * `Caprasimo` display face) and must never be linked from the app. Extract
 * from the canvas, not from `_ds`.
 *
 * ── Why this file rather than a bespoke Tailwind @theme layer ────────────────
 *
 * `@astryxdesign/core/tailwind-theme.css` (imported in main.tsx) is a
 * `@theme inline` bridge: it registers Tailwind utilities that resolve through
 * these custom properties at paint time. So retuning tokens here repaints
 * every surface that consumes `bg-card` / `text-primary` / `border-border`
 * with no component edits at all. A parallel token system would throw that
 * away — and would also lose the exact mappings the bridge already gives us:
 *
 *   --spacing: var(--spacing-1)        → Tailwind's whole numeric scale
 *   --radius-{xs,sm}: --radius-inner   → rounded-sm
 *   --radius-md: --radius-element      → rounded-md
 *   --radius-lg: --radius-container    → rounded-lg
 *   --radius-xl: --radius-page         → rounded-xl
 *   --font-sans: --font-family-body    → font-sans
 *   --font-heading: --font-family-heading
 *
 * ── Regenerating ────────────────────────────────────────────────────────────
 *
 *   npx astryx theme build src/theme/docPortalTheme.ts
 *
 * That writes `src/theme/doc-portal.css`, which carries an "@generated"
 * header and is overwritten on every build. Never hand-edit it. In
 * particular, the unlayered `:root { color-scheme: light }` fix lives in
 * `src/index.css` and must stay there.
 *
 * The tonal ramps (gold / sage / sand, 100–900) cannot live here: Astryx's
 * `TokenName` is a closed vocabulary with no ramp entries, and the bridge has
 * no mapping for them. They are hand-written in `src/theme/ramps.css`.
 */
export const docPortalTheme = defineTheme({
  name: 'doc-portal',
  extends: neutralTheme,

  /**
   * Figtree for text, Source Serif 4 at weight 600 for headings.
   *
   * Astryx does NOT load fonts — "font loading is the consumer's
   * responsibility" (see TypographyRole). The <link> lives in index.html.
   * Without it the serif silently falls back to Georgia and the whole design
   * reads subtly wrong, with no error anywhere.
   */
  typography: {
    body: {
      family: 'Figtree',
      fallbacks: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    heading: {
      family: 'Source Serif 4',
      fallbacks: 'Georgia, "Times New Roman", serif',
      weight: 'semibold',
    },
  },

  tokens: {
    // ── Shape ───────────────────────────────────────────────────────────────
    // The canvas ships three radii: 8 / 16 / 28. `--radius-page` is pinned to
    // the container value too, because ~27 card shells in this codebase still
    // spell their radius `rounded-xl`; they collapse into `<Card>` in Phase 2,
    // and until they do they should not look different from the ones that
    // don't.
    '--radius-inner': '8px',
    '--radius-element': '16px',
    '--radius-container': '28px',
    '--radius-page': '28px',

    // NOTE ON SPACING — deliberately NOT overridden.
    //
    // Organic's scale is exactly 4.4 × n, so `--spacing-1: 4.4px` would map
    // Tailwind's `p-4`/`gap-6` onto the canvas's own density for free. It is
    // also a 10% shift applied to every spacing utility in the app at once,
    // and fractional pixels produce 1px seams and blurry hairline borders in
    // dense tables — of which this app has many. 24px vs 26.4px is not a
    // visible difference; a seam in the claims table is. Staying on the 4px
    // integer grid.

    // ── Surfaces ────────────────────────────────────────────────────────────
    // The canvas naming inverts intuition, so read carefully: its
    // `--color-surface` (#ebddc5) is DARKER than its cards, and
    // `--color-neutral-100` (#f9f4ed) is what chrome and cards actually use.
    // Mapped by role here, not by name.
    '--color-background-body': '#f5ead8', // the cream page ground
    '--color-background-card': '#f9f4ed', // cards, top nav, side nav, menus
    '--color-background-surface': '#f9f4ed',
    '--color-background-popover': '#f9f4ed',
    '--color-background-muted': '#ebddc5', // section bands, stat tiles, badges
    '--color-background-inverted': '#2e2b25', // the dark footer

    // ── Ink ─────────────────────────────────────────────────────────────────
    // The canvas expresses secondary text and dividers as `color-mix(... 65%,
    // transparent)`, which composites against whatever sits behind. Resolved
    // to solid ramp steps here so a token never depends on its backdrop.
    '--color-text-primary': '#201e1d',
    '--color-text-secondary': '#645c50', // sand-700
    '--color-border': '#dcd3c4', // sand-300 ≈ the 16% ink divider
    '--color-border-emphasized': '#c0b6a5', // sand-400

    // ── Accent ──────────────────────────────────────────────────────────────
    '--color-accent': '#b8860b', // dark goldenrod
    '--color-accent-muted': '#fdf6e3', // gold-100
    '--color-icon-accent': '#b8860b',
    // Text and icons ON the accent are near-black, not white: goldenrod is a
    // light colour, and white on it fails contrast badly. This is the canvas's
    // own choice — `.btn-primary { color: #2e2b25 }`.
    '--color-on-accent': '#2e2b25',
    // Accent-coloured TEXT on a light ground needs the 700 step, not the base
    // accent, to clear 4.5:1. The canvas does the same for links.
    '--color-text-accent': '#7a5f0d', // gold-700

    // ── Status ──────────────────────────────────────────────────────────────
    // The canvas defines no status palette, so these are derived to sit inside
    // the warm system rather than importing Tailwind's cool defaults. Each is
    // a hue the accent is not, so "needs attention" never reads as "gold".
    '--color-success': '#56633f', // sage-700
    '--color-success-muted': '#f0fae1', // sage-100
    '--color-on-success': '#ffffff',
    '--color-warning': '#9a5b1b', // warm amber, distinct from the gold accent
    '--color-warning-muted': '#fdeacf',
    '--color-on-warning': '#ffffff',
    '--color-error': '#9c2b1b', // warm brick
    '--color-error-muted': '#fbe4de',
    '--color-on-error': '#ffffff',

    // ── Categorical hues ────────────────────────────────────────────────────
    // Astryx exposes six named hues (used by `Token`, `Badge` and the
    // `bg-{hue}-subtle` utilities) which ship as COOL defaults — a literal
    // #0074e2 blue among them. One of these was rendering a bright blue
    // "Submitted" chip in the middle of the warm claims table.
    //
    // Retuned to warm equivalents that keep each hue's identity: green stays
    // green (sage), red stays red (brick), yellow becomes the gold accent,
    // gray becomes sand.
    //
    // `blue` is deliberately LEFT ALONE. There is no blue in this palette, and
    // a token named `blue` that renders beige is a trap for the next person.
    // Nothing in the app uses it any more — see ClaimStatusStepper.
    '--color-background-gray': '#eee7db', // sand-200
    '--color-border-gray': '#dcd3c4',
    '--color-text-gray': '#645c50',
    '--color-icon-gray': '#82796a',

    '--color-background-yellow': '#fdf6e3', // gold-100
    '--color-border-yellow': '#ecd28a',
    '--color-text-yellow': '#7a5f0d',
    '--color-icon-yellow': '#9c7a12',

    '--color-background-green': '#f0fae1', // sage-100
    '--color-border-green': '#ccdbb2',
    '--color-text-green': '#3d472b',
    '--color-icon-green': '#56633f',

    '--color-background-red': '#fbe4de',
    '--color-border-red': '#e8b3a6',
    '--color-text-red': '#7d1f12',
    '--color-icon-red': '#9c2b1b',

    '--color-background-orange': '#fdeacf',
    '--color-border-orange': '#f0c48a',
    '--color-text-orange': '#7a4413',
    '--color-icon-orange': '#9a5b1b',
  },

  /**
   * Component-level overrides.
   *
   * This is what makes keeping Astryx the right call rather than a compromise:
   * the pill buttons and pill inputs the design wants are expressible here and
   * apply uniformly to all 47 existing `<Button>` sites, with no swizzling and
   * no specificity war against the generated `@scope` block.
   *
   * `astryx theme build` compiles these into `doc-portal.css`. The CLI is
   * 0.1.4 — verify the compiled output actually contains them after a build
   * (a pre-1.0 CLI could drop an unsupported key with no error and no
   * styling).
   */
  components: {
    button: {
      /*
       * Only the INLINE padding is overridden, and only for shape.
       *
       * A pill needs more inline padding than a rectangle, because the corner
       * curve eats into the space beside the label — a 999px radius with
       * Astryx's stock 12px reads as clipped text. These match the canvas's
       * own `10px 20px`.
       *
       * `paddingBlock` used to be pinned to `0px` here as half of a
       * workaround: Astryx's own `paddingBlock: --spacing-2` never applied,
       * because the whole `astryx-base` layer was ordered ahead of Tailwind's
       * preflight and got flattened by `*{padding:0}`. That is fixed at
       * source now — see the cascade-layer comment at the top of
       * src/index.css — so the block padding comes from Astryx's size
       * variants again, which is where it belongs: it is the thing that
       * differs between sm/md/lg.
       */
      base: {
        borderRadius: '999px',
        fontFamily: 'var(--font-family-body)',
        fontWeight: '600',
        letterSpacing: '0.005em',
        paddingInline: '18px',
      },
      'size:sm': { paddingInline: '14px' },
      'size:md': { paddingInline: '18px' },
      'size:lg': { paddingInline: '24px' },
      'variant:primary': {
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
        ':hover': { backgroundColor: '#9c7a12' }, // gold-600
        ':active': { backgroundColor: '#7a5f0d' }, // gold-700
      },
    },
    textinput: {
      base: {
        borderRadius: '999px',
        backgroundColor: 'var(--color-background-card)',
      },
    },
    badge: {
      base: { borderRadius: '999px', fontWeight: '600' },
    },
  },
});
