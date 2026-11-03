/**
 * Document metadata, tested at the DOM.
 *
 * `useDocumentMeta` writes into `<head>`, which nothing else in the app reads
 * back — so a hook that quietly stopped working would look identical to one
 * that worked, in the app and in every other test. The failure mode that
 * matters is not "the title is wrong on screen", it is "the title is wrong in
 * a search result, a shared link, or a browser tab", and none of those are
 * visible from inside the app at all.
 *
 * The restore-on-unmount case gets the most attention here because it is the
 * one with a real bug available: leave it out and the last route to set
 * metadata leaks its title and canonical URL onto every route after it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import type { DocumentMeta } from './meta';

/*
 * The module is re-imported per test, deliberately.
 *
 * `meta.ts` snapshots the authored tags at MODULE LOAD, which is the only
 * moment it can be sure no route has touched them yet. A plain top-level
 * import would therefore capture jsdom's empty `<head>` once, and every
 * restore-on-unmount assertion would be checking against nothing. Seeding the
 * head and then re-importing gives each test the same starting conditions the
 * real app has: a document that already carries index.html's tags.
 */
type MetaModule = typeof import('./meta');
let useDocumentMeta: MetaModule['useDocumentMeta'];
let SITE_ORIGIN: MetaModule['SITE_ORIGIN'];
let TITLE_SUFFIX: MetaModule['TITLE_SUFFIX'];

const INITIAL_TITLE = 'DOC Portal — Department of Commerce, CHRIST University';
const INITIAL_DESCRIPTION = 'The authored index.html description.';
const INITIAL_CANONICAL = 'https://commerce.christuniversity.in/';

/**
 * Reproduce the tags index.html ships.
 *
 * Order matters: assigning `head.innerHTML` replaces the `<title>` element
 * along with everything else, so setting `document.title` first would be
 * undone by the next line and every test would snapshot an empty title.
 */
function seedHead() {
  document.head.innerHTML = `
    <meta name="description" content="${INITIAL_DESCRIPTION}">
    <link rel="canonical" href="${INITIAL_CANONICAL}">
    <meta property="og:title" content="Department of Commerce">
  `;
  document.title = INITIAL_TITLE;
}

const Probe: React.FC<DocumentMeta> = (meta) => {
  useDocumentMeta(meta);
  return null;
};

const head = (selector: string, attr: string) =>
  document.head.querySelector(selector)?.getAttribute(attr) ?? null;

describe('useDocumentMeta', () => {
  beforeEach(async () => {
    seedHead();
    vi.resetModules();
    ({ useDocumentMeta, SITE_ORIGIN, TITLE_SUFFIX } = await import('./meta'));
  });
  afterEach(cleanup);

  it('appends the site suffix to the page title', () => {
    render(<Probe title="Club Budget · Clubs" />);
    expect(document.title).toBe(`Club Budget · Clubs — ${TITLE_SUFFIX}`);
  });

  it('resolves canonicalPath against the site origin, absolutely', () => {
    // A relative canonical is ignored by crawlers, so the join matters.
    render(<Probe title="Home" canonicalPath="/" />);
    expect(head('link[rel="canonical"]', 'href')).toBe(`${SITE_ORIGIN}/`);
    expect(head('meta[property="og:url"]', 'content')).toBe(`${SITE_ORIGIN}/`);
  });

  it('mirrors the description into og and twitter descriptions', () => {
    render(<Probe title="Home" description="One description, three tags." />);
    expect(head('meta[name="description"]', 'content')).toBe('One description, three tags.');
    expect(head('meta[property="og:description"]', 'content')).toBe(
      'One description, three tags.'
    );
    expect(head('meta[name="twitter:description"]', 'content')).toBe(
      'One description, three tags.'
    );
  });

  it('lets a social title differ from the browser-tab title', () => {
    render(
      <Probe
        title="Department of Commerce, CHRIST University"
        socialTitle="Department of Commerce — CHRIST (Deemed to be University)"
      />
    );
    expect(document.title).toBe(
      `Department of Commerce, CHRIST University — ${TITLE_SUFFIX}`
    );
    expect(head('meta[property="og:title"]', 'content')).toBe(
      'Department of Commerce — CHRIST (Deemed to be University)'
    );
  });

  it('falls back to the authored canonical when a screen omits canonicalPath', () => {
    // An /app URL is not a separate indexable page. It inherits index.html's
    // canonical — the public root — rather than inventing one per screen.
    render(<Probe title="Review queue · Claims" />);
    expect(head('link[rel="canonical"]', 'href')).toBe(INITIAL_CANONICAL);
  });

  it('restores the authored tags when the route unmounts', () => {
    const view = render(<Probe title="Sign in" description="Sign in page." />);
    expect(document.title).toBe(`Sign in — ${TITLE_SUFFIX}`);

    view.unmount();

    expect(document.title).toBe(INITIAL_TITLE);
    expect(head('meta[name="description"]', 'content')).toBe(INITIAL_DESCRIPTION);
    expect(head('link[rel="canonical"]', 'href')).toBe(INITIAL_CANONICAL);
  });

  it('does not leak one route’s metadata onto the next', () => {
    // The regression this exists for: /login sets a description, unmounts,
    // and an authenticated screen inherits "Sign in to the DOC Portal".
    const login = render(<Probe title="Sign in" description="Sign in page." />);
    login.unmount();

    render(<Probe title="Pipeline" />);

    expect(document.title).toBe(`Pipeline — ${TITLE_SUFFIX}`);
    expect(head('meta[name="description"]', 'content')).toBe(INITIAL_DESCRIPTION);
  });
});
