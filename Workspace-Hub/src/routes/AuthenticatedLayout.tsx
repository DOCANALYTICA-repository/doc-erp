import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../context/useStore';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { Kbd } from '@astryxdesign/core/Kbd';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Search, Bell, Inbox, LogOut } from 'lucide-react';
import { useNotifications } from '../api/hooks';
import { PageLoader } from '../components/ui/PageLoader';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { AppSideNav } from './AppSideNav';
import { CommandBar } from './CommandBar';
import { NotificationTray } from './NotificationTray';
import { MODULES, PRODUCT_NAME } from '../lib/navigation';
import { useDocumentMeta } from '../lib/meta';
import { CLUB_TABS } from '../modules/clubs/tabs';
import { CLAIM_TABS } from '../modules/claims/tabs';
import { FACULTY_TABS } from '../modules/faculty/tabs';
import { DemoPersonaMenu } from './DemoPersonaMenu';

/**
 * What the browser tab says you are looking at.
 *
 * Every /app screen shared one title, so four open tabs were four identical
 * entries in the tab strip and in history — and the back button gave no clue
 * where it was about to take you.
 *
 * Derived from the SAME vocabulary the nav renders from, not a second list of
 * screen names. That is the whole point of `lib/navigation.ts` and the three
 * `tabs.ts` files: a renamed tab renames its title too, and a tab added
 * without a title here degrades to the module name rather than going stale.
 */
const TAB_LABELS: Record<string, string> = Object.fromEntries(
  [...CLUB_TABS, ...CLAIM_TABS, ...FACULTY_TABS].map(t => [t.id, t.label])
);

const STANDALONE_TITLES: Record<string, string> = {
  '': 'Waiting on you',
  modules: 'Workspaces',
  pipeline: 'Pipeline',
  settings: 'Notification settings',
};

function titleForPath(pathname: string): string {
  const [, , moduleSegment = '', tabSegment = ''] = pathname.split('/');

  const standalone = STANDALONE_TITLES[moduleSegment];
  if (standalone !== undefined) return standalone;

  const moduleLabel = MODULES.find(m => m.id === moduleSegment)?.label;
  if (!moduleLabel) return PRODUCT_NAME;

  const tabLabel = TAB_LABELS[tabSegment];
  return tabLabel ? `${tabLabel} · ${moduleLabel}` : moduleLabel;
}

/**
 * Shared authenticated shell — replaces the big conditionally-rendered
 * block that used to live directly in App.tsx. Every /app/* route renders
 * inside here via <Outlet/>.
 */
export const AuthenticatedLayout: React.FC = () => {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const isSearchOpen = useStore((state) => state.isSearchOpen);
  const setSearchOpen = useStore((state) => state.setSearchOpen);
  const isNotificationsOpen = useStore((state) => state.isNotificationsOpen);
  const setNotificationsOpen = useStore((state) => state.setNotificationsOpen);
  const navigate = useNavigate();
  const location = useLocation();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const activeModule = location.pathname.split('/')[2] || '';

  // No description and no canonicalPath: these screens are behind a login and
  // have nothing to say to a crawler or a link preview.
  useDocumentMeta({ title: titleForPath(location.pathname) });

  /**
   * The unread badge, from the server's own filtered list.
   *
   * This used to be `notifications.filter(n => !n.is_read).length` on a list
   * the endpoint had ALREADY filtered to unread — tautological, and it drifted
   * the moment anything was marked read without a refetch. The query also
   * re-ran on every route change; it now polls on a timer instead.
   */
  const { data: notifications } = useNotifications();
  const unreadCount = notifications?.length ?? 0;

  // ⌘K / Ctrl-K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  if (!user) return <PageLoader label="Loading..." />;

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      style={{ height: '100dvh', width: '100%' }}
      // Filling this slot is what gives the app a mobile menu. AppShell gates
      // its hamburger on `sideNav` being present and this was passing nothing,
      // so below the breakpoint there was NO navigation at all.
      sideNav={<AppSideNav />}
      mobileNav={{ breakpoint: 'md' }}
      topNav={
        <TopNav
          label="Main navigation"
          heading={
            <button
              type="button"
              className="flex min-w-0 cursor-pointer items-center gap-3 text-left"
              onClick={() => navigate('/app')}
              aria-label="Go to your inbox"
            >
              {/* The department's real mark. This was a generic `Sparkles`
                  glyph while icon-512.png sat unused in public/. */}
              <img
                src="/icon-512.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-md shadow-sm"
              />
              {/*
                  * The wordmark is hidden below `md`, not shrunk.
                  *
                  * The wordmark plus the account menu is 637px of
                  * content in a 375px viewport, and the top nav is the one row
                  * that cannot wrap. The mark and the module chip beside it
                  * still say where you are, and `md` is the same breakpoint
                  * AppShell uses for the mobile drawer, so the nav switches to
                  * its compact form exactly when the rest of the shell does.
                  *
                  * `contents` rather than `block` so TopNavHeading stays a
                  * direct flex child of the row above it.
                  */}
              <span className="hidden md:contents">
                <TopNavHeading heading={PRODUCT_NAME} />
              </span>
              {activeModule ? (
                <span className="ml-2 rounded border border-border bg-muted px-2 py-0.5 text-xs font-semibold uppercase text-secondary">
                  {activeModule}
                </span>
              ) : null}
            </button>
          }
          endContent={
            <div className="flex items-center gap-2 md:gap-4">
              {/* Opens the command palette rather than being a search box
                  that fired a request per keystroke. */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search and commands"
                className="hidden items-center gap-2 rounded-lg bg-muted py-1.5 pl-3 pr-2 text-sm text-secondary hover:bg-sand-300 md:flex"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Search or jump to…</span>
                <Kbd keys="mod+k" />
              </button>

              <button
                type="button"
                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                aria-label={
                  unreadCount > 0
                    ? `Notifications, ${unreadCount} unread`
                    : 'Notifications'
                }
                aria-expanded={isNotificationsOpen}
                className="relative rounded-lg p-2 text-secondary hover:text-primary"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-error px-1 text-[10px] font-semibold leading-4 text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {/*
                * Development only, and it renders nothing at all in a
                * production build — `import.meta.env.DEV` is replaced with
                * `false`, so the bundler drops the component. It is a SEPARATE
                * control from the account menu below, deliberately: the design
                * canvas put the persona list where "Your inbox" and
                * "Notification settings" live, which would have removed the
                * only route to the notification preferences screen.
                */}
              <span className="hidden md:contents">
                <DemoPersonaMenu />
              </span>

              {/*
                * Astryx DropdownMenu, replacing a raw useState + an absolutely
                * positioned div.
                *
                * The old menu had no click-outside, no Escape, no focus return
                * to the trigger and no aria-expanded — so it stayed open when
                * you clicked elsewhere, and a keyboard user could tab into a
                * menu the page never told them had opened. All four come free
                * here, and DropdownMenu was already a dependency (TabStrip
                * uses it for tab overflow).
                *
                * The design canvas replaced this menu's contents with a
                * "Switch persona" list and dropped "Your inbox" and
                * "Notification settings". Both are kept: they are the only
                * route to the notification preferences screen. The persona
                * switcher is deliberately not here — it is impersonation
                * against a live permission system and is scoped as a dev-only
                * tool in Phase 6.
                */}
              <DropdownMenu
                isMenuOpen={userDropdownOpen}
                onOpenChange={setUserDropdownOpen}
                button={{
                  label: user.name,
                  variant: 'ghost',
                  size: 'sm',
                  'aria-label': `Account menu for ${user.name}`,
                }}
                menuWidth={240}
                items={[
                  {
                    type: 'section',
                    title: user.email,
                    items: [
                      { label: 'Your inbox', icon: <Inbox className="h-4 w-4" />, onClick: () => navigate('/app') },
                      {
                        label: 'Notification settings',
                        icon: <Bell className="h-4 w-4" />,
                        onClick: () => navigate('/app/settings/notifications'),
                      },
                    ],
                  },
                  { type: 'divider' },
                  {
                    label: 'Log out',
                    icon: <LogOut className="h-4 w-4" />,
                    onClick: () => {
                      logout();
                      navigate('/');
                    },
                  },
                ]}
              />
            </div>
          }
        />
      }
    >
      <div className="w-full h-full min-h-[calc(100vh-4rem)]">
        {/* A crash inside a module must not take out the shell around it —
            the nav, the search and the sign-out control stay usable. */}
        <ErrorBoundary label="This workspace">
          <Outlet />
        </ErrorBoundary>
      </div>

      <CommandBar isOpen={isSearchOpen} onOpenChange={setSearchOpen} />

      {isNotificationsOpen ? (
        <NotificationTray onClose={() => setNotificationsOpen(false)} />
      ) : null}
    </AppShell>
  );
};
