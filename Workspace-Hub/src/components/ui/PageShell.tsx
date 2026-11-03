import React from 'react';

/**
 * The frame every ERP screen sits in.
 *
 * `ClubsDashboard`, `ClaimsDashboard` and `FacultyDashboard` each hand-wrote
 * this exact structure — an outer column on the page ground, then a centred,
 * independently scrolling `<main>` — and the only thing that differed between
 * the three was the max-width. Which means the scroll container, the
 * `min-h-[calc(100vh-4rem)]` (the 4rem is the top nav) and the responsive
 * padding were all duplicated three times and free to drift.
 *
 * `<main>` is the landmark a screen-reader user jumps to with a single
 * keystroke, so there must be exactly one per screen — put page content in
 * here, not in a second `<main>` inside a tab.
 */

const MAX_WIDTH = {
  '3xl': 'max-w-3xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-none',
} as const;

export const PageShell: React.FC<{
  maxWidth?: keyof typeof MAX_WIDTH;
  /** Rendered above the scroll area — for a tab strip that must not scroll away. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}> = ({ maxWidth = '6xl', toolbar, children }) => (
  <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col bg-body">
    {toolbar}
    <main
      className={`mx-auto w-full flex-1 overflow-y-auto p-6 md:p-8 ${MAX_WIDTH[maxWidth]}`}
    >
      {children}
    </main>
  </div>
);
