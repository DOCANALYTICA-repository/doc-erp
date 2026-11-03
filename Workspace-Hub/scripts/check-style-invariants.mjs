#!/usr/bin/env node
/**
 * Two style invariants that no type checker or unit test can catch.
 *
 * Run as `npm run check:style`. Both checks exist because the failure they
 * guard against is invisible in code review.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. THE PALETTE RATCHET
 *
 * The app has a fully wired 172-token theme (`src/theme/docPortalTheme.ts` →
 * generated `doc-portal.css` → Tailwind utilities like `bg-card`,
 * `text-primary`, `border-border`) and, at the start of the UI revamp, used
 * almost none of it: ~650 raw Tailwind palette utilities across 52 of 62
 * source files.
 *
 * `.claude/CLAUDE.md` has mandated tokens-only styling the whole time. A
 * mandate without a ratchet is precisely what produced that number. So this
 * does not demand zero — it demands the count never *rises*. The baseline
 * drops as the revamp migrates each seam; it can never drift back up.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. THE color-scheme GUARD
 *
 * `src/index.css` carries a deliberately UNLAYERED `:root { color-scheme:
 * light }`. It is load-bearing: unlayered rules beat every `@layer`, and this
 * is the only thing stopping all 281 of the theme's `light-dark()` tokens from
 * resolving to their dark values on a machine with a dark OS setting.
 *
 * It regresses in two ways, both plausible: someone tidies the file, or someone
 * moves the declaration into `src/theme/doc-portal.css` — which is
 * `@generated` and would drop it on the next `astryx theme build`.
 *
 * The bug only reproduces for users whose OS is set to dark, so it escapes
 * review on a light-mode laptop entirely.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. THE CASCADE LAYER ORDER
 *
 * `src/index.css` opens with an explicit `@layer` statement putting
 * `astryx-base` AFTER Tailwind's `base`. Without it, layers are ordered by
 * first appearance in the bundle, `astryx-base` lands ahead of preflight, and
 * preflight's `*{margin:0;padding:0;border:0 solid}` silently flattens the box
 * model of every Astryx component in the app.
 *
 * That is not hypothetical — it is what this repo shipped. Measured on /app
 * before the fix: 147 of 153 Astryx-rendered elements computed `padding: 0`,
 * with `border-width: 0` and `border-radius: 0` alongside. It survived
 * unnoticed for the life of the project because there is no error, no warning
 * and no missing class; components just render flat, and a theme override on
 * Button happened to hide the most visible symptom.
 *
 * Two ways it regresses, both of them ordinary-looking edits: someone deletes
 * the `@layer` statement as noise, or someone adds `import '…/astryx.css'` to
 * a `.tsx` file, which re-registers the layer at whatever position the JS
 * bundler picks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 4. THE CARD-SHELL RATCHET
 *
 * `<Card>` exists so the card shell is defined once. The 27 hand-written
 * copies were all migrated to the same token string during the revamp, so they
 * now LOOK right — but they are still literals, and the next restyle would
 * have to find all of them again.
 *
 * Same ratchet logic as the palette: the count may fall, never rise. A regex
 * codemod cannot finish this job (rewriting the opening tag is easy; matching
 * the right closing tag is not), so it is deliberately tracked as a number to
 * drive down by hand rather than pretended to be done.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — the repo path contains a space, which
// pathname percent-encodes into a directory that does not exist.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const BASELINE_FILE = fileURLToPath(
  new URL('./palette-baseline.json', import.meta.url)
);
const INDEX_CSS = join(SRC, 'index.css');

/** Tailwind's default palette hues. Using any of these is the thing we count. */
const PALETTE_HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

/**
 * Matches a palette utility in a className: an optional variant prefix, a
 * known property, a hue and a numeric step — e.g. `hover:bg-slate-100`,
 * `md:text-rose-600/50`, `border-sky-200`.
 *
 * Deliberately does NOT match `bg-white` / `text-black`: those are not palette
 * steps, they are separate (still non-token) values, and conflating them would
 * make the baseline harder to reason about.
 */
const PALETTE_RE = new RegExp(
  String.raw`\b(?:[a-z-]+:)*(?:bg|text|border|ring|divide|from|via|to|fill|stroke|outline|shadow|accent|caret|decoration|placeholder)-(?:${PALETTE_HUES.join('|')})-\d{2,3}\b`,
  'g'
);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(tsx|ts|css)$/.test(entry) && !/\.test\.(tsx|ts)$/.test(entry)) {
      // Generated theme CSS is excluded: it is machine-written from the token
      // source and is not something a person can "fix".
      if (full.endsWith('theme/doc-portal.css')) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments, keeping string and template-literal contents intact.
 *
 * Why this exists: the ratchet counts text, and it cannot tell a `className`
 * from prose. Several comments in Card.tsx, index.css and ramps.css quote the
 * OLD class names deliberately, to record what was migrated away from and
 * why — `bg-slate-100`, `text-rose-600`. Counting those held the baseline at
 * 6 when the real number was 0, which means the ratchet could not distinguish
 * "someone wrote a raw utility" from "someone edited a comment".
 *
 * This is a scanner rather than a pair of regexes on purpose. The naive
 * `s.replace(/\/\/.*$/gm, '')` eats everything after the `//` in a URL, so a
 * real `bg-slate-100` later on that same line would stop being counted — a
 * strictly worse failure than the one being fixed. Tracking string state
 * costs thirty lines and cannot do that.
 *
 * Regex literals are not tracked: this file's only consumers are class-name
 * greps, and no regex in src/ contains a palette utility. If one ever does,
 * it counts, which is the safe direction.
 */
function stripComments(source, isCss) {
  let out = '';
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    // Block comment — the only comment form CSS has.
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // Line comment. CSS has none, so only strip it in TS/TSX.
    if (!isCss && c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }

    // A string or template literal: copy it through verbatim, respecting
    // backslash escapes, so a `//` or `/*` inside it is not treated as a
    // comment opener.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i++;
          break;
        }
        // An unterminated single- or double-quoted string never spans a
        // newline in valid source; bail rather than swallowing the file.
        if (quote !== '`' && source[i] === '\n') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

function countPaletteUsage() {
  const perFile = {};
  let total = 0;
  for (const file of walk(SRC)) {
    const source = stripComments(readFileSync(file, 'utf8'), file.endsWith('.css'));
    const matches = source.match(PALETTE_RE);
    if (matches?.length) {
      perFile[relative(SRC, file)] = matches.length;
      total += matches.length;
    }
  }
  return { total, files: Object.keys(perFile).length, perFile };
}

/**
 * Hand-written card shells that should be a `<Card>`.
 *
 * Matches the canonical token spelling only. A drifted variant would slip
 * past — but a drifted variant is also a visual bug the eye catches, whereas
 * a correct-looking literal is exactly what this needs to count.
 */
const CARD_SHELL_RE =
  /rounded-lg border border-border bg-card p-[456](?: shadow-sm)?/g;

function countCardShells() {
  const perFile = {};
  let total = 0;
  for (const file of walk(SRC)) {
    if (file.endsWith('components/ui/Card.tsx')) continue; // the definition itself
    const matches = readFileSync(file, 'utf8').match(CARD_SHELL_RE);
    if (matches?.length) {
      perFile[relative(SRC, file)] = matches.length;
      total += matches.length;
    }
  }
  return { total, files: Object.keys(perFile).length, perFile };
}

function checkColorScheme() {
  const css = readFileSync(INDEX_CSS, 'utf8');

  // Strip comments so the long explanatory note in the file cannot satisfy the
  // check on its own.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const declaration = /:root\s*\{[^}]*color-scheme\s*:\s*light[^}]*\}/;
  if (!declaration.test(code)) {
    return `src/index.css is missing ":root { color-scheme: light }".
    Without it, all 281 light-dark() theme tokens resolve DARK on a dark-OS
    machine. It must live in index.css, NOT in the @generated
    src/theme/doc-portal.css (which the next theme build would overwrite).`;
  }

  // Confirm it is not nested inside an @layer. Walk forward from each `@layer`
  // and check whether the declaration falls inside its braces.
  for (const match of code.matchAll(/@layer[^{]*\{/g)) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    const start = i;
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const block = code.slice(start, i);
    if (declaration.test(block)) {
      return `":root { color-scheme: light }" is inside an @layer in src/index.css.
    It must be UNLAYERED. Layered rules lose to @layer astryx-theme, which
    re-declares "color-scheme: light dark" — the exact regression this guards.`;
    }
  }
  return null;
}

/**
 * The layer statement must exist, and must order `astryx-base` after `base`.
 *
 * Parsed from the statement rather than pattern-matched, so a reordering that
 * still contains all the right names is caught.
 */
function checkLayerOrder() {
  const css = readFileSync(INDEX_CSS, 'utf8');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

  // A layer STATEMENT (`@layer a, b, c;`), not a layer block (`@layer a {`).
  const statement = code.match(/@layer\s+([a-z0-9-]+(?:\s*,\s*[a-z0-9-]+)+)\s*;/i);
  if (!statement) {
    return `src/index.css has no "@layer …;" order statement.
    Without one, cascade layers are ordered by first appearance in the bundle,
    astryx-base lands before Tailwind's preflight, and
    "*{margin:0;padding:0;border:0 solid}" flattens every Astryx component's
    box model app-wide — no error, no warning, just flat components.
    Restore: @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;`;
  }

  const order = statement[1].split(',').map((n) => n.trim());
  const at = (name) => order.indexOf(name);

  const required = [
    ['base', 'astryx-base'],
    ['astryx-base', 'astryx-theme'],
    ['astryx-theme', 'components'],
    ['components', 'utilities'],
  ];

  for (const [earlier, later] of required) {
    if (at(earlier) === -1 || at(later) === -1) {
      return `src/index.css's @layer statement is missing "${at(earlier) === -1 ? earlier : later}".
    Expected: reset, theme, base, astryx-base, astryx-theme, components, utilities
    Found:    ${order.join(', ')}`;
    }
    if (at(earlier) > at(later)) {
      return `src/index.css orders "${later}" before "${earlier}".
    Found: ${order.join(', ')}
    A later layer wins. "astryx-base" must come after "base" or Tailwind's
    preflight zeroes every Astryx component's padding, margin and border;
    "components"/"utilities" must come last or a Tailwind class on an Astryx
    component stops overriding it.`;
    }
  }

  // Astryx CSS imported from JS re-registers its layer wherever the bundler
  // puts it, which is what produced the bug in the first place.
  const offenders = [];
  for (const file of walk(SRC)) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = stripComments(readFileSync(file, 'utf8'), false);
    if (/import\s+['"]@astryxdesign\/core\/(astryx|reset|tailwind-theme)\.css['"]/.test(source)) {
      offenders.push(relative(SRC, file));
    }
  }
  if (offenders.length) {
    return `Astryx CSS is imported from JavaScript: ${offenders.join(', ')}.
    It must be @imported from src/index.css instead, below the @layer
    statement. An import from a .ts/.tsx file lands in the bundle at an order
    the bundler chooses, which re-registers astryx-base ahead of Tailwind's
    preflight and flattens every Astryx component.`;
  }

  return null;
}

// ── run ──────────────────────────────────────────────────────────────────────

const write = process.argv.includes('--write-baseline');
const failures = [];

const usage = countPaletteUsage();
const cards = countCardShells();

if (write) {
  writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      { total: usage.total, files: usage.files, cardShells: cards.total },
      null,
      2
    )}\n`
  );
  console.log(
    `Baseline written: ${usage.total} palette utilities across ${usage.files} files, ` +
      `${cards.total} un-migrated card shells.`
  );
} else {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    failures.push(
      'No palette baseline found. Run: npm run check:style -- --write-baseline'
    );
  }

  if (baseline) {
    if (usage.total > baseline.total) {
      const worst = Object.entries(usage.perFile)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([f, n]) => `      ${String(n).padStart(4)}  ${f}`)
        .join('\n');
      failures.push(`Raw Tailwind palette utilities went UP: ${baseline.total} → ${usage.total}.
    Use theme-backed utilities instead — bg-card, bg-body, bg-muted,
    text-primary, text-secondary, border-border — or the gold/sage/sand ramps
    for genuinely tonal values. See .claude/CLAUDE.md.
    Heaviest files:
${worst}`);
    } else if (usage.total < baseline.total) {
      console.log(
        `Palette usage improved: ${baseline.total} → ${usage.total}. ` +
          `Lower the baseline with: npm run check:style -- --write-baseline`
      );
    } else {
      console.log(`Palette usage held at baseline (${usage.total}).`);
    }
  }
}

if (!write && cards.total > 0) {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    baseline = null;
  }
  const allowed = baseline?.cardShells;
  if (allowed !== undefined && cards.total > allowed) {
    failures.push(`Hand-written card shells went UP: ${allowed} → ${cards.total}.
    Use <Card> from src/components/ui/Card.tsx instead of writing
    "rounded-lg border border-border bg-card p-6 shadow-sm" by hand.`);
  } else if (allowed !== undefined && cards.total < allowed) {
    console.log(
      `Card shells migrated: ${allowed} → ${cards.total}. ` +
        `Lower the baseline with: npm run check:style -- --write-baseline`
    );
  } else {
    console.log(`Card shells awaiting migration to <Card>: ${cards.total}.`);
  }
}

const colorSchemeError = checkColorScheme();
if (colorSchemeError) failures.push(colorSchemeError);
else console.log('color-scheme: light is present and unlayered.');

const layerOrderError = checkLayerOrder();
if (layerOrderError) failures.push(layerOrderError);
else console.log('Cascade layer order puts astryx-base after Tailwind preflight.');

if (failures.length) {
  console.error(`\n${failures.map((f) => `✗ ${f}`).join('\n\n')}\n`);
  process.exit(1);
}
