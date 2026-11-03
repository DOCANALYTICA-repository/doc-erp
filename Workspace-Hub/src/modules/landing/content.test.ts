/**
 * The landing page's content contract.
 *
 * These are not tests of behaviour — they are a tripwire. The revamp rewrites
 * every element on the public page, and the failure mode that survives code
 * review is a *plausible* wrong string: a mockup's address instead of the real
 * one, a support email with the wrong local part.
 *
 * So: facts are asserted by exact value, and the shape of the copy is snapshot.
 * If you are here because a snapshot failed, the question is not "how do I
 * update this" — it is "did someone verify the new value".
 */
import { describe, it, expect } from 'vitest';
import {
  SITE,
  NAV_LINKS,
  HEADER,
  HERO,
  STATS,
  ABOUT,
  PROGRAMMES,
  CLUBS,
  GALLERY,
  CONTACT,
  FOOTER,
  META,
} from './content';

describe('landing content — verified facts', () => {
  // These three were each proposed differently by the design canvas and
  // deliberately rejected. Asserting them by literal value is the whole point.
  it('ships the real department address', () => {
    expect(CONTACT.addressLines).toEqual([
      'Department of Commerce, Block IV,',
      'CHRIST (Deemed to be University), Hosur Road,',
      'Bengaluru, Karnataka - 560029',
    ]);
  });

  it('ships the real support email', () => {
    expect(CONTACT.email).toBe('commerce.support@christuniversity.in');
  });

  it('publishes no phone number', () => {
    // The canvas invented "+91 80 4012 9100". Nothing in this codebase can
    // corroborate it, so the page must not claim it.
    const everyString = JSON.stringify({ SITE, HERO, CONTACT, FOOTER });
    expect(everyString).not.toMatch(/\+91/);
    expect(everyString).not.toMatch(/\d{3,}\s?\d{4}/);
  });

  it('names the institution consistently', () => {
    expect(SITE.institution).toBe('CHRIST (Deemed to be University)');
    expect(HERO.badge).toBe(SITE.institution);
    expect(CONTACT.addressLines[1]).toContain(SITE.institution);
    expect(FOOTER.copyright(2026)).toContain(SITE.institution);
  });
});

describe('landing content — structure', () => {
  it('keeps every nav link pointed at a real section', () => {
    // A nav link to a section that no longer renders is a dead scroll anchor —
    // the most likely casualty of decomposing the page into section components.
    // `Home.test.tsx` checks the other half of this: that each id is actually
    // in the document.
    //
    // `#courses` became `#programmes` in the revamp, matching both the design
    // canvas and the label the nav already showed.
    expect(NAV_LINKS.map((l) => l.href)).toEqual([
      '#about',
      '#programmes',
      '#clubs',
      '#gallery',
      '#contact',
    ]);
  });

  it('keeps the gallery, which the design canvas dropped', () => {
    expect(NAV_LINKS.some((l) => l.href === '#gallery')).toBe(true);
    expect(GALLERY.heading).toBeTruthy();
  });

  it('publishes the footer notices as text while they have no destination', () => {
    // `href="#"` is a link that goes nowhere, which reads as a broken site.
    // The wording is kept; only the anchor is withheld.
    expect(FOOTER.notices.map((n) => n.label)).toEqual(['Privacy Policy', 'Terms of Use']);
    for (const notice of FOOTER.notices) {
      expect(notice.href).toBeNull();
    }
  });

  it('renders the year dynamically rather than hardcoding it', () => {
    expect(FOOTER.copyright(2026)).toContain('2026');
    expect(FOOTER.copyright(2031)).toContain('2031');
  });

  it('labels gallery tiles with the image title', () => {
    expect(GALLERY.viewLabel('Convocation 2026')).toBe(
      'View Convocation 2026 full size'
    );
  });

  it('uses an em-dash, not a zero, for unloaded statistics', () => {
    // "0 Enrolled Students" would be a false claim about the department.
    expect(STATS.placeholder).toBe('—');
  });
});

describe('landing content — copy', () => {
  it('matches the approved copy', () => {
    expect({
      meta: META,
      brand: SITE.brand,
      nav: NAV_LINKS.map((l) => l.label),
      loginCta: HEADER.loginCta,
      hero: HERO,
      statLabels: STATS.labels,
      about: ABOUT,
      programmes: PROGRAMMES,
      clubs: CLUBS,
      galleryHeading: GALLERY.heading,
      contactHeading: CONTACT.heading,
      footerNotices: FOOTER.notices.map((n) => n.label),
    }).toMatchSnapshot();
  });
});
