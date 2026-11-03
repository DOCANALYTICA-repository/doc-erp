import React from 'react';

/**
 * The card shell, once.
 *
 * Before this existed, the literal string `rounded-xl border border-slate-200
 * bg-white p-6 shadow-sm` was pasted into 27 places, in three spellings that
 * differed only by padding (`p-4`, `p-5`, `p-6`). Restyling cards meant a
 * find-and-replace across three strings and hoping none had drifted — and two
 * of them had.
 *
 * (That old string is written out here deliberately unmangled: the palette
 * codemod rewrites `bg-white`/`border-slate-200` on sight, comments included,
 * so quoting the pre-migration classes in prose needs care.)
 *
 * Note on the house rules: `.claude/CLAUDE.md` says cards are for "dashboard
 * widgets, galleries, settings groups only" and that dense data should be
 * edge-to-edge rows. That is good advice and this component does not enforce
 * it — `DataTable` uses `Card` for its frame, which is the one deliberate
 * exception, because a table needs the same outer shell as the widgets beside
 * it.
 */

const TONE: Record<string, string> = {
  /** Default. Cards, panels, anything sitting on the page ground. */
  card: 'bg-card border-border',
  /** A step darker — stat tiles, section bands, things that recede. */
  muted: 'bg-muted border-border',
  /** Accent-tinted. Use sparingly: for the one thing on a screen that matters. */
  accent: 'bg-accent-muted border-gold-300',
  /** The secondary hue, for content that is deliberately not the accent. */
  sage: 'bg-sage-100 border-sage-300',
};

const PADDING: Record<string, string> = {
  /** For a table or list that supplies its own cell padding. */
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

const ELEVATION: Record<string, string> = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow-md',
};

type CardTag = 'div' | 'section' | 'article' | 'li' | 'form';

/*
 * Extends FormHTMLAttributes rather than HTMLAttributes so `as="form"` can
 * carry `onSubmit` AND `noValidate` — the latter lives only on the form
 * interface, and every converted form needs it (rhf owns validation, so the
 * browser's own bubbles must be off).
 */
export interface CardProps extends React.FormHTMLAttributes<HTMLElement> {
  tone?: keyof typeof TONE;
  padding?: keyof typeof PADDING;
  elevation?: keyof typeof ELEVATION;
  /**
   * Render as a real element when the card is more than a box.
   *
   * `section`/`article` when it is a landmark, `li` inside a list, and `form`
   * for a card-shelled form panel — several create forms are exactly that, and
   * without this they would need a Card wrapping a form and an extra nesting
   * level for nothing.
   */
  as?: CardTag;
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  tone = 'card',
  padding = 'lg',
  elevation = 'sm',
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}) => (
  <Tag
    // Everything else (onSubmit, noValidate, key handlers, aria-*) passes
    // through, which is what lets `as="form"` be useful.
    {...rest}
    className={[
      // rounded-lg is --radius-container (28px) under this theme, not
      // Tailwind's stock 0.5rem. See src/theme/docPortalTheme.ts.
      'rounded-lg border',
      TONE[tone],
      PADDING[padding],
      ELEVATION[elevation],
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {children}
  </Tag>
);
