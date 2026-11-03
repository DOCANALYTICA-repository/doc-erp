import React from 'react';
import { useNavigate } from 'react-router-dom';

import { SITE, CONTACT, FOOTER } from '../content';

/**
 * Contact details and the site footer, as one dark band.
 *
 * The design canvas merged the old white "Contact Department" card into the
 * footer, which is a genuine improvement — the address was previously stated
 * twice on the same page in two different visual treatments.
 *
 * What did NOT come across from the canvas: it rewrote the address to "Central
 * Block" (it is Block IV), changed the support email's local part, and added a
 * phone number that appears nowhere in this codebase. All three were rejected
 * as unverified. See the note on `CONTACT` in ./content.
 *
 * The department's own headings are kept as the column labels — the canvas
 * replaced "Department Office Address" and "Official Support Email" with a
 * single "Reach us", which is tidier but discards published copy for no gain.
 *
 * `id="contact"` stays on this element so the header's `#contact` nav link has
 * somewhere to go.
 */
export const ContactFooter: React.FC = () => {
  const navigate = useNavigate();

  return (
    <footer
      id="contact"
      className="scroll-mt-20 bg-sand-900 px-5 py-16 text-sand-100 sm:px-8 lg:px-14"
    >
      <div className="mx-auto max-w-[1180px]">
        <h2 className="font-heading text-2xl font-semibold text-sand-100">{CONTACT.heading}</h2>
        <p className="mt-1.5 text-sm text-sand-100/70">{CONTACT.description}</p>
      </div>

      <div className="mx-auto mt-10 flex max-w-[1180px] flex-wrap justify-between gap-10">
        <div className="flex-1 basis-[300px]">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-sand-100/60">
            {CONTACT.addressHeading}
          </h3>
          <div className="mb-2 font-heading text-lg font-semibold text-sand-100">{SITE.brand}</div>
          <address className="max-w-[40ch] text-sm not-italic leading-[1.7] text-sand-100/80">
            {CONTACT.addressLines.map((line, idx) => (
              <React.Fragment key={line}>
                {line}
                {idx < CONTACT.addressLines.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </address>
        </div>

        <div className="basis-[220px]">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-sand-100/60">
            {CONTACT.emailHeading}
          </h3>
          {/* Was plain text, so nobody could click it. */}
          <a
            href={`mailto:${CONTACT.email}`}
            className="text-sm leading-loose text-sand-100/85 hover:text-sand-100 hover:underline"
          >
            {CONTACT.email}
          </a>
        </div>

        <div className="basis-[220px]">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.11em] text-sand-100/60">
            {CONTACT.membersLabel}
          </h3>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-100"
          >
            {CONTACT.membersCta}
          </button>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-[1180px] flex-col gap-3 border-t border-sand-100/15 pt-6 text-xs text-sand-100/60 md:flex-row md:items-center md:justify-between">
        <span>{FOOTER.copyright(new Date().getFullYear())}</span>
        {/*
          * Text, not links, until there are real pages to point at — see the
          * note on FOOTER.notices. The moment an `href` is filled in, that
          * entry renders as an anchor and nothing else changes.
          */}
        <div className="flex gap-6">
          {FOOTER.notices.map(notice =>
            notice.href ? (
              <a
                key={notice.label}
                href={notice.href}
                className="hover:text-sand-100 hover:underline"
              >
                {notice.label}
              </a>
            ) : (
              <span key={notice.label}>{notice.label}</span>
            ),
          )}
        </div>
      </div>
    </footer>
  );
};
