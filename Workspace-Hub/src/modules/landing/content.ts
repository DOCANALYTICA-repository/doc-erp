/**
 * Every hardcoded string on the public landing page, in one place.
 *
 * Why this file exists: the landing page's copy is a content *contract*. The
 * department's address, the support email and the programme headings are facts
 * about a real institution, and a redesign is exactly the moment they get
 * silently rewritten — a plausible-looking address is indistinguishable from
 * the correct one in a 500-line JSX diff.
 *
 * So the strings live here and `content.test.ts` pins them. A copy change is
 * then a deliberate, reviewable one-line diff instead of an accident.
 *
 * RULES
 *  - Facts (address, email, institution name) change ONLY on instruction from
 *    someone who can verify them. They are not style.
 *  - Everything the API supplies — programmes, clubs, gallery images, the stat
 *    *numbers* — belongs to the Content Engine and must never appear here. Only
 *    the labels around it do.
 */

/**
 * What a search result and a link preview say about this page.
 *
 * It lives here, with the rest of the published copy, for the same reason
 * everything else does: the description IS the page's copy, seen by someone
 * who has not opened it yet. When the hero paragraph was rewritten the
 * description in `index.html` was not, and for a while the snippet promised
 * wording the page no longer contained. Keeping both in this file, under the
 * same contract test, makes that drift a failing test rather than something
 * nobody notices.
 *
 * `index.html` still carries a matching static copy — that is the floor for a
 * crawler that runs no JavaScript, and these values are what `useDocumentMeta`
 * sets once the app hydrates. Keep the two in step.
 */
export const META = {
  /** Tab title. `useDocumentMeta` appends the " — DOC Portal" suffix. */
  title: 'Department of Commerce, CHRIST University',
  /** Reads differently from the tab title: a share card has room for the full name. */
  socialTitle: 'Department of Commerce — CHRIST (Deemed to be University)',
  description:
    'Leadership opportunities, technical accounting standards taught to global practice, and student-led club operations — the Department of Commerce at CHRIST (Deemed to be University), and the portal for attendance claims and club operations.',
} as const;

export const SITE = {
  /** Wordmark in the public header. */
  brand: 'Department of Commerce',
  institution: 'CHRIST (Deemed to be University)',
  imageAlt: 'Students and faculty at the Department of Commerce',
  /**
   * Caption under the About photograph. New in the revamp — the image had no
   * caption at all, and the canvas adds one. Consistent with the Bengaluru
   * address below, so it makes no claim the page did not already make.
   */
  imageCaption: 'The department, Bengaluru campus.',
} as const;

/**
 * Header nav. `href` values double as the section ids they scroll to, and
 * `Home.test.tsx` asserts every one resolves to a section that actually
 * renders — a nav link to a removed section is a dead scroll anchor.
 *
 * `#gallery` is here deliberately. The design canvas dropped the gallery
 * section and its nav entry entirely; it is a working feature backed by
 * `GET /content/gallery` and an admin editor, so it was kept and restyled.
 */
export const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#programmes', label: 'Programmes' },
  { href: '#clubs', label: 'Clubs' },
  { href: '#gallery', label: 'Gallery' },
  { href: '#contact', label: 'Contact' },
] as const;

export const HEADER = {
  loginCta: 'Portal login',
} as const;

/**
 * Marketing copy — adopted from the design canvas, which moved the whole page
 * to sentence case and rewrote the hero paragraph to describe what the portal
 * actually does ("annual plans to attendance claims") rather than what the
 * department aspires to.
 */
export const HERO = {
  badge: 'CHRIST (Deemed to be University)',
  title: 'Shape the future of global commerce and finance.',
  description:
    'Leadership opportunities, technical accounting standards taught to global practice, and student-led club operations run on one department system — from annual plans to attendance claims.',
  primaryCta: 'Access the ERP portal',
  secondaryCta: 'Explore programmes',
} as const;

/**
 * Stat labels only. The values come from `usePublicStatistics()`; `placeholder`
 * is what shows before they arrive, and is deliberately an em-dash rather than
 * a `0` — a real zero would be a lie about the department.
 */
export const STATS = {
  placeholder: '—',
  labels: {
    students: 'Enrolled Students',
    faculty: 'Faculty Advisors',
    clubs: 'Operational Clubs',
    legacy: 'Academic Legacy',
  },
  /** Suffix on `years_established`, e.g. "54 Years". */
  legacySuffix: 'Years',
} as const;

/**
 * The one fully static section on the page — no Content Engine backing.
 *
 * The heading follows the design's sentence case, but the vision and mission
 * BODIES are left byte-identical on purpose. The canvas rewrote them
 * ("centre" for "center", dropped serial commas), and those two paragraphs are
 * approved institutional text rather than marketing copy — not ours to
 * restyle. Copy-edit them only on instruction from someone who owns them.
 */
export const ABOUT = {
  heading: 'Our vision and mission',
  vision: {
    heading: 'Vision',
    body: 'To be a center of excellence in commerce education, nurturing socially responsible leaders, financial experts, and outstanding researchers.',
  },
  mission: {
    heading: 'Mission',
    body: 'To provide holistic commerce education integrated with global standards, professional certifications, corporate internships, and ethical principles.',
  },
} as const;

export const PROGRAMMES = {
  heading: 'Academic programmes',
  // The canvas said "undergraduate and postgraduate", which is a factual claim
  // about what the department offers. The seeded catalogue is B.Com variants
  // only, so the narrower, true version stays.
  description:
    'Specialised undergraduate pathways, each integrated with professional skills and a corporate internship.',
  outcomesHeading: 'Learning Outcomes:',
  careersHeading: 'Career Roles:',
  expandCta: 'View Curriculum Outcomes',
  collapseCta: 'Hide Details',
  /** Shown when a programme has a brochure — `brochure_url` was never rendered. */
  brochureCta: 'Download brochure',
} as const;

export const CLUBS = {
  eyebrow: 'Dynamic campus culture',
  heading: 'Student-led clubs',
  description:
    'Every club plans, budgets and reports through the same portal its faculty coordinator approves in.',
  contactLabel: 'Inquiries',
} as const;

export const GALLERY = {
  // Kept verbatim: existing published copy, and the canvas offered no
  // replacement because it removed the section altogether.
  heading: 'Campus Live Stream',
  description:
    'Glimpses of recent academic summits, recruitment days, and cultural fests.',
  /** Accessible name for each tile's button. */
  viewLabel: (title: string) => `View ${title} full size`,
  closeLabel: 'Close',
} as const;

/**
 * VERIFIED FACTS. Do not edit to match a mockup.
 *
 * The design canvas proposed "Central Block", `commerce@christuniversity.in`
 * and a phone number that appears nowhere in this codebase. All three were
 * rejected as unverified — these are the values the department actually ships.
 */
export const CONTACT = {
  heading: 'Contact Department',
  description: 'Address and details for official inquiries.',
  addressHeading: 'Department Office Address',
  addressLines: [
    'Department of Commerce, Block IV,',
    'CHRIST (Deemed to be University), Hosur Road,',
    'Bengaluru, Karnataka - 560029',
  ],
  emailHeading: 'Official Support Email',
  email: 'commerce.support@christuniversity.in',
  /**
   * Column label for the sign-in call to action in the footer. The canvas's
   * other footer label ("Reach us") was dropped in favour of the department's
   * own existing headings — `addressHeading` and `emailHeading` — so the
   * redesign changes the layout without discarding published copy.
   */
  membersLabel: 'Members',
  membersCta: 'Sign in to the portal',
} as const;

export const FOOTER = {
  /** Year is injected at render time, so the notice never goes stale. */
  copyright: (year: number) =>
    `© ${year} Department of Commerce, CHRIST (Deemed to be University). All rights reserved.`,
  /**
   * Footer notices, as TEXT rather than links.
   *
   * Both were `href="#"` — links that scroll nowhere. A link that does nothing
   * is worse than no link: on a university department page these are the two
   * things a visitor is most likely to go looking for, and a dead one reads as
   * a broken site rather than an absent page.
   *
   * The wording is preserved so nothing is lost. Give each an `href` here the
   * moment real destinations exist, and `ContactFooter` renders them as
   * anchors again with no other change.
   */
  notices: [
    { label: 'Privacy Policy', href: null },
    { label: 'Terms of Use', href: null },
  ] as readonly { label: string; href: string | null }[],
} as const;
