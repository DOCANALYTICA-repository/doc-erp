import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OverflowList } from '@astryxdesign/core/OverflowList';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';

export interface TabStripItem {
  id: string;
  label: string;
  to: string;
  /** Prefetch this tab's data on hover, so the click paints from cache. */
  onHover?: () => void;
}

/**
 * A horizontal tab strip that never hides a tab beyond reach.
 *
 * The club workspace has fifteen tabs. The previous strip was
 * `overflow-x-auto scrollbar-none`: the tabs that did not fit were still
 * there, but with no scrollbar and no other affordance, so on a mouse-only
 * desktop roughly 380px of them were simply unreachable — and nothing on
 * screen suggested they existed.
 *
 * OverflowList measures what fits and moves the rest into a menu, so every
 * tab stays reachable at every width. Each is a real <Link>, so Back works
 * and a tab can be opened in a new browser tab.
 */
export const TabStrip: React.FC<{
  items: TabStripItem[];
  activeId: string | undefined;
  label: string;
}> = ({ items, activeId, label }) => {
  const navigate = useNavigate();

  return (
    <nav
      aria-label={label}
      className="z-10 w-full border-b border-slate-200 bg-white px-6 py-2.5 shadow-sm"
    >
      <OverflowList
        gap={1}
        // Keep at least the first tab visible even in the narrowest column;
        // below that the mobile drawer is the navigation anyway.
        minVisibleItems={1}
        overflowRenderer={overflowItems => (
          <DropdownMenu
            button={{ label: `+${overflowItems.length} more`, variant: 'ghost' }}
            items={overflowItems.map(({ index }) => ({
              label: items[index].label,
              onClick: () => navigate(items[index].to),
            }))}
          />
        )}
      >
        {items.map(item => (
          <Link
            key={item.id}
            to={item.to}
            aria-current={activeId === item.id ? 'page' : undefined}
            onMouseEnter={item.onHover}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeId === item.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </OverflowList>
    </nav>
  );
};
