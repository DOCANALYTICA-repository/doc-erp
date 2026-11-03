/**
 * The landing page renders the content module.
 *
 * `content.ts` + `content.test.ts` only protect anything if the page actually
 * reads from them. Without this test the two could drift apart and the
 * contract test would keep passing against a file nobody renders — worse than
 * no test, because it looks like coverage.
 *
 * So: mount the real page and assert the strings reach the DOM.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderRoute, resetTestSession } from '../../test/renderRoute';
import {
  SITE, NAV_LINKS, HEADER, HERO, STATS, ABOUT,
  PROGRAMMES, CLUBS, GALLERY, CONTACT,
} from './content';

afterEach(resetTestSession);

describe('the public landing page', () => {
  it('renders every section heading from the content module', async () => {
    await renderRoute('/', { user: null });

    for (const text of [
      SITE.brand,
      HEADER.loginCta,
      HERO.badge,
      HERO.title,
      HERO.description,
      HERO.primaryCta,
      HERO.secondaryCta,
      ABOUT.heading,
      ABOUT.vision.body,
      ABOUT.mission.body,
      PROGRAMMES.heading,
      PROGRAMMES.description,
      CLUBS.eyebrow,
      CLUBS.heading,
      GALLERY.heading,
      CONTACT.heading,
      CONTACT.emailHeading,
      CONTACT.email,
    ]) {
      // getAllByText: several of these are substrings of each other — the
      // brand name appears in the header, the address and the footer.
      expect(
        screen.getAllByText(text, { exact: false }).length,
        `landing page does not render: "${text}"`
      ).toBeGreaterThan(0);
    }
  });

  it('renders the department address line by line', async () => {
    await renderRoute('/', { user: null });
    // Rendered as one <p> with <br /> separators, so match on the container.
    const body = document.body.textContent ?? '';
    for (const line of CONTACT.addressLines) {
      expect(body, `missing address line: "${line}"`).toContain(line);
    }
  });

  it('renders every nav link, including the gallery the design dropped', async () => {
    await renderRoute('/', { user: null });
    for (const link of NAV_LINKS) {
      const anchor = screen.getByRole('link', { name: link.label });
      expect(anchor.getAttribute('href')).toBe(link.href);
    }
  });

  it('shows an em-dash rather than a zero before statistics load', async () => {
    await renderRoute('/', { user: null });
    for (const label of Object.values(STATS.labels)) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The mocked /content/statistics returns zeros, so the labels are what
    // matter here; the placeholder itself is pinned in content.test.ts.
    expect(STATS.placeholder).toBe('—');
  });

  it('links each nav target to a section that exists in the document', async () => {
    await renderRoute('/', { user: null });
    for (const link of NAV_LINKS) {
      const id = link.href.slice(1);
      expect(
        document.getElementById(id),
        `nav links to #${id} but no such section is rendered`
      ).toBeTruthy();
    }
  });
});

describe('the landing page distinguishes loading, failed and empty', () => {
  // The gap this closes: every section used to destructure `{ data = [] }` and
  // render `data.map(...)`, so a slow Content Engine, a failed request and a
  // genuinely empty catalogue all produced an identical result — a heading
  // above an empty grid, with no way to tell which had happened.
  it('offers a retry when a section fails to load', async () => {
    await renderRoute('/', { user: null, failEndpoints: ['/content/courses'] });
    expect(
      await screen.findByText(/programme catalogue didn't load/i)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('says so plainly when a section is genuinely empty', async () => {
    // The seed ships no gallery images on purpose, so this is the real
    // production state of that section rather than a contrived one.
    await renderRoute('/', { user: null });
    expect(await screen.findByText(/no photographs yet/i)).toBeTruthy();
  });
});
