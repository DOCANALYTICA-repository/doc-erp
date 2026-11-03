
/**
 * Client-side filter pills.
 *
 * Deliberately NOT `TabStrip`. That component routes — each of its items is a
 * URL and the browser Back button moves between them. These are a view filter
 * on the current screen: "show me only claims". Conflating the two is how you
 * end up with a Back button that undoes a filter instead of leaving the page.
 *
 * Rendered as a radiogroup rather than a set of buttons, so a screen reader
 * announces "1 of 5" and arrow keys move between options — which is what this
 * control actually is.
 */
export const FilterChips = <T extends string>({
  items,
  activeId,
  onChange,
  label,
}: {
  items: { id: T; label: string; count?: number }[];
  activeId: T;
  onChange: (id: T) => void;
  /** Accessible name for the group, e.g. "Filter by type". */
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
    {items.map(item => {
      const active = item.id === activeId;
      return (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(item.id)}
          className={[
            'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            active
              ? 'border-accent bg-accent text-on-accent'
              : 'border-border bg-card text-secondary hover:bg-muted',
          ].join(' ')}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className={`tabular-nums ${active ? 'opacity-70' : 'text-sand-500'}`}>
              {item.count}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
);
