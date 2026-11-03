import { useEffect } from 'react';

/**
 * Per-route document metadata.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * Everything a crawler or a link preview saw came from the static tags in
 * `index.html` — one title, one description, one canonical URL, for every
 * route in the application. That was defensible while `/` was the only public
 * page, but it also meant:
 *
 *   - every ERP screen shared one browser-tab title, so a user with the
 *     portal open in four tabs could not tell them apart, and their own
 *     history read as four identical entries;
 *   - `/login` and `/` were the same URL as far as a shared link was
 *     concerned;
 *   - adding a second public page would have silently inherited the landing
 *     page's description.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 *
 * This is not server-side rendering, and it does not pretend to be. Tags are
 * written after hydration, so a crawler that does not execute JavaScript sees
 * `index.html`'s tags and nothing else. That is why the static tags stay in
 * `index.html` and stay accurate for `/`: they remain the no-JavaScript
 * floor, and this layer is the per-route improvement on top of it.
 *
 * Prerendering or SSG is still the thing that would make the metadata visible
 * without JavaScript. The architectural difference is that it is now a build
 * concern only — the app already knows the right metadata for each route, in
 * one place, so a prerender step would have something to render rather than
 * needing this to be invented first.
 */

/**
 * The public origin, for absolute canonical and og:url values.
 *
 * A canonical link must be absolute, so the origin cannot be derived from the
 * route alone. It was hardcoded to the production domain in `index.html`;
 * overriding it here via `VITE_SITE_ORIGIN` means a staging deploy stops
 * declaring production as its canonical URL — which would ask search engines
 * to fold the two together.
 */
export const SITE_ORIGIN: string =
  import.meta.env.VITE_SITE_ORIGIN ?? 'https://commerce.christuniversity.in';

/** The suffix every tab title carries, so a bare tab still says whose it is. */
export const TITLE_SUFFIX = 'DOC Portal';

export interface DocumentMeta {
  /** Page-specific part of the title. The suffix is appended automatically. */
  title: string;
  /** `<meta name="description">` and `og:description`. */
  description?: string;
  /**
   * Path (not URL) this page should declare as canonical, e.g. `/`.
   *
   * Omit on authenticated screens. They then inherit `index.html`'s canonical
   * — the public site root — which is the honest answer: an /app URL is not a
   * separate indexable page, and pointing a crawler at the one page that is
   * beats both inventing a canonical per screen and leaving the tag off.
   */
  canonicalPath?: string;
  /** Overrides `title` for og:title / twitter:title when the sharing card
   *  should read differently from the browser tab. */
  socialTitle?: string;
}

/** Find or create a `<meta>` / `<link>` in `<head>`, and set its value. */
function upsert(
  tag: 'meta' | 'link',
  keyAttr: 'name' | 'property' | 'rel',
  keyValue: string,
  valueAttr: 'content' | 'href',
  value: string | null
): void {
  const selector = `${tag}[${keyAttr}="${keyValue}"]`;
  let el = document.head.querySelector<HTMLElement>(selector);

  if (value === null) {
    // Nothing to say. Remove a tag this hook added rather than leaving an
    // empty one, which some scrapers treat as an explicit "no description".
    if (el?.dataset.routeMeta === 'true') el.remove();
    return;
  }

  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(keyAttr, keyValue);
    // Marks it as ours, so the restore path knows what it may remove and what
    // was authored in index.html.
    el.dataset.routeMeta = 'true';
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, value);
}

/** Read the whole managed set, so it can be put back on unmount. */
function snapshot(): Record<string, string | null> {
  const read = (selector: string, attr: string) =>
    document.head.querySelector(selector)?.getAttribute(attr) ?? null;

  return {
    title: document.title,
    description: read('meta[name="description"]', 'content'),
    canonical: read('link[rel="canonical"]', 'href'),
    ogTitle: read('meta[property="og:title"]', 'content'),
    ogDescription: read('meta[property="og:description"]', 'content'),
    ogUrl: read('meta[property="og:url"]', 'content'),
    twitterTitle: read('meta[name="twitter:title"]', 'content'),
    twitterDescription: read('meta[name="twitter:description"]', 'content'),
  };
}

function apply(state: Record<string, string | null>): void {
  if (state.title !== null) document.title = state.title;
  upsert('meta', 'name', 'description', 'content', state.description);
  upsert('link', 'rel', 'canonical', 'href', state.canonical);
  upsert('meta', 'property', 'og:title', 'content', state.ogTitle);
  upsert('meta', 'property', 'og:description', 'content', state.ogDescription);
  upsert('meta', 'property', 'og:url', 'content', state.ogUrl);
  upsert('meta', 'name', 'twitter:title', 'content', state.twitterTitle);
  upsert('meta', 'name', 'twitter:description', 'content', state.twitterDescription);
}

/**
 * The tags as `index.html` shipped them.
 *
 * Captured once at module load — i.e. before any route has had a chance to
 * change them — so unmounting the last route that set metadata restores the
 * document to its authored state rather than to whatever the previous route
 * happened to leave behind.
 */
const INITIAL = typeof document === 'undefined' ? null : snapshot();

/**
 * Set this route's document metadata for as long as the component is mounted.
 *
 * Pass a stable object or memoise it: the effect is keyed on the individual
 * fields, not on object identity, so an inline literal is fine.
 */
export function useDocumentMeta(meta: DocumentMeta): void {
  const { title, description, canonicalPath, socialTitle } = meta;

  useEffect(() => {
    if (!INITIAL) return;

    const fullTitle = title ? `${title} — ${TITLE_SUFFIX}` : TITLE_SUFFIX;

    /*
     * Anything this route does not specify falls back to the value
     * `index.html` authored — NOT to null, and never to whatever the previous
     * route happened to leave behind.
     *
     * The subtle version of that bug: `upsert` can only remove tags it
     * created, because deleting an author's tag is not its business. So
     * writing `null` for a description leaves the authored
     * `<meta name="description">` element in place, still holding the last
     * value written into it — and the previous route's description silently
     * becomes this route's. Restoring on unmount happens to paper over it
     * while React unmounts the old route before mounting the new one, which
     * makes it a bug that depends on effect ordering to stay hidden.
     *
     * Resolving against INITIAL here makes each route's metadata a complete
     * statement rather than a diff, so it cannot depend on what ran before it.
     */
    const canonical = canonicalPath
      ? new URL(canonicalPath, SITE_ORIGIN).href
      : INITIAL.canonical;

    const resolvedDescription = description ?? INITIAL.description;
    const resolvedSocialTitle = socialTitle ?? title ?? INITIAL.ogTitle;

    apply({
      title: fullTitle,
      description: resolvedDescription,
      canonical,
      ogTitle: resolvedSocialTitle,
      ogDescription: resolvedDescription,
      ogUrl: canonical,
      twitterTitle: resolvedSocialTitle,
      twitterDescription: resolvedDescription,
    });

    return () => apply(INITIAL);
  }, [title, description, canonicalPath, socialTitle]);
}
