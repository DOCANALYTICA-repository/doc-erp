import React from 'react';
import { useNavigate } from 'react-router-dom';

import { SITE, NAV_LINKS, HEADER } from '../content';

/**
 * The public header.
 *
 * Two changes from the old version. The brand mark is now the real
 * `icon-512.png` rather than a `Sparkles` lucide glyph — the department had a
 * logo in `public/` the whole time and the page drew a generic icon instead.
 * And it is `sticky` rather than `fixed`, so it no longer needs the page to
 * reserve space for it with a magic `pt-36`.
 */
export const SiteHeader: React.FC = () => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-5 border-b border-border bg-card/90 px-5 py-4 backdrop-blur-md sm:px-8 lg:px-14">
      <div className="flex items-center gap-3">
        <img
          src="/icon-512.png"
          alt=""
          width={38}
          height={38}
          className="h-9 w-9 rounded-md shadow-sm"
        />
        <span className="font-heading text-lg font-semibold tracking-tight text-primary">
          {SITE.brand}
        </span>
      </div>

      <nav aria-label="Sections" className="flex flex-wrap items-center gap-5 sm:gap-6">
        {NAV_LINKS.map(link => (
          <a
            key={link.href}
            href={link.href}
            className="hidden text-sm font-medium text-secondary transition-colors hover:text-accent md:inline"
          >
            {link.label}
          </a>
        ))}
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {HEADER.loginCta}
        </button>
      </nav>
    </header>
  );
};
