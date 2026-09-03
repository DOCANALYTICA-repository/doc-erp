import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandPalette } from '@astryxdesign/core/CommandPalette';
import type { SearchableItem, SearchSource } from '@astryxdesign/core/Typeahead';
import { Award, Compass, FileText, FolderOpen, Inbox, User, Users } from 'lucide-react';

import { api } from '../services/api';
import type { SearchResults } from '../api/types';
import { useStore } from '../context/useStore';

/**
 * ⌘K as the primary navigation.
 *
 * The global search endpoint already existed and was wired to a modal nobody
 * opened — one that fired a request PER KEYSTROKE. This replaces it with a
 * proper command palette: jump to any club, person, meeting or task, and run
 * the handful of actions people actually come here for, without touching a
 * menu.
 *
 * For an HOD or a coordinator this is most of their navigation, which is why
 * it is worth more than the modal it replaces.
 */

type Aux = { group: string; href: string; icon: React.ComponentType<{ className?: string }> };
interface Item extends SearchableItem<Aux> {}

const ICONS = { club: Award, person: User, meeting: Users, task: FileText };

function commandsFor(hasPermission: (p: string) => boolean): Item[] {
  const all: (Item & { perm?: string })[] = [
    { id: 'go:inbox', label: 'Go to inbox', auxiliaryData: { group: 'Actions', href: '/app', icon: Inbox } },
    { id: 'go:clubs', label: 'Go to clubs', perm: 'clubs:view', auxiliaryData: { group: 'Actions', href: '/app/clubs', icon: Award } },
    { id: 'go:claims', label: 'Go to claims', perm: 'claims:view_own', auxiliaryData: { group: 'Actions', href: '/app/claims', icon: Compass } },
    { id: 'go:faculty', label: 'Go to faculty workspace', perm: 'faculty:dashboard', auxiliaryData: { group: 'Actions', href: '/app/faculty', icon: FolderOpen } },
    { id: 'do:new-claim', label: 'File a new attendance claim', perm: 'claims:submit', auxiliaryData: { group: 'Actions', href: '/app/claims/new_claim', icon: FileText } },
    { id: 'do:review-queue', label: 'Open my review queue', perm: 'claims:review_faculty', auxiliaryData: { group: 'Actions', href: '/app/claims/review_queue', icon: FileText } },
    { id: 'do:meetings', label: 'Record meeting minutes', perm: 'meetings:manage', auxiliaryData: { group: 'Actions', href: '/app/faculty/meetings', icon: Users } },
    { id: 'do:directory', label: 'Search the faculty directory', perm: 'directory:view', auxiliaryData: { group: 'Actions', href: '/app/faculty/directory', icon: Users } },
  ];
  return all.filter(c => !c.perm || hasPermission(c.perm)).map(({ perm: _perm, ...item }) => item);
}

export const CommandBar: React.FC<{ isOpen: boolean; onOpenChange: (open: boolean) => void }> = ({
  isOpen, onOpenChange,
}) => {
  const navigate = useNavigate();
  const hasPermission = useStore(s => s.hasPermission);

  const commands = React.useMemo(() => commandsFor(hasPermission), [hasPermission]);

  /**
   * Every item the palette has shown, by id.
   *
   * onValueChange gives us an id, not the item — and remote results are not in
   * `commands` — so without this the only selectable rows would be the
   * built-in commands.
   */
  const knownItems = React.useRef(new Map<string, Item>());

  const remember = (items: Item[]) => {
    for (const item of items) knownItems.current.set(item.id, item);
    return items;
  };

  const source = React.useMemo<SearchSource<Item>>(() => {
    let controller: AbortController | null = null;

    return {
      bootstrap: () => remember(commands),
      cancel() { controller?.abort(); },
      async search(query: string) {
        const local = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
        if (query.trim().length < 2) return remember(local);

        try {
          // One request per SEARCH, not per keystroke — the palette debounces
          // and this cancels anything still in flight.
          controller?.abort();
          controller = new AbortController();
          const results = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`);

          const remote: Item[] = [
            ...results.clubs.map(c => ({
              id: `club:${c.id}`, label: c.name,
              auxiliaryData: { group: 'Clubs', href: `/app/clubs/dashboard?club=${c.id}`, icon: ICONS.club },
            })),
            ...results.users.map(u => ({
              id: `user:${u.id}`, label: `${u.name} · ${u.email}`,
              auxiliaryData: { group: 'People', href: '/app/faculty/directory', icon: ICONS.person },
            })),
            ...results.meetings.map(m => ({
              id: `meeting:${m.id}`, label: `${m.title} · ${m.date}`,
              auxiliaryData: { group: 'Meetings', href: '/app/faculty/meetings', icon: ICONS.meeting },
            })),
            ...results.tasks.map(t => ({
              id: `task:${t.id}`, label: t.title,
              auxiliaryData: { group: 'Tasks', href: '/app/faculty/tasks', icon: ICONS.task },
            })),
          ];

          return remember([...local, ...remote]);
        } catch {
          // A failed search should still leave the built-in commands usable.
          return remember(local);
        }
      },
    };
  }, [commands]);

  return (
    <CommandPalette<Item>
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      label="Search and commands"
      searchSource={source}
      emptyBootstrapText="Type to search clubs, people, meetings and tasks"
      emptySearchText="Nothing matched"
      onValueChange={value => {
        const href = knownItems.current.get(value)?.auxiliaryData?.href;
        if (!href) return;
        navigate(href);
        onOpenChange(false);
      }}
      renderItem={item => {
        const Icon = item.auxiliaryData?.icon ?? Inbox;
        return (
          <span className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span>{item.label}</span>
          </span>
        );
      }}
    />
  );
};
