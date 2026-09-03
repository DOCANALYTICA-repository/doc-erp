import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../context/useStore';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Sparkles, Search, Bell, ChevronDown } from 'lucide-react';
import { useNotifications } from '../api/hooks';
import { PageLoader } from '../components/ui/PageLoader';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { AppSideNav } from './AppSideNav';
import { CommandBar } from './CommandBar';
import { NotificationTray } from './NotificationTray';

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
              className="flex cursor-pointer items-center gap-3 text-left"
              onClick={() => navigate('/app')}
              aria-label="Go to your inbox"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <TopNavHeading heading="DOC Unified Digital ERP" />
              {activeModule ? (
                <span className="ml-2 rounded border border-slate-200/50 bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-500">
                  {activeModule}
                </span>
              ) : null}
            </button>
          }
          endContent={
            <div className="flex items-center gap-4">
              {/* Opens the command palette rather than being a search box
                  that fired a request per keystroke. */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search and commands"
                className="hidden items-center gap-2 rounded-lg bg-slate-100 py-1.5 pl-3 pr-2 text-sm text-slate-500 hover:bg-slate-200 md:flex"
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
                className="relative rounded-lg p-2 text-slate-500 hover:text-slate-900"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadCount > 0 ? (
                  <span className="absolute right-1 top-1 min-w-[1rem] rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-4 text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </button>

              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-600">
                    {user.name[0]}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200/50 bg-white p-2 shadow-lg text-xs space-y-1 animate-fade-in z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="font-bold text-slate-900 truncate">{user.name}</div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">{user.email}</div>
                    </div>
                    <button onClick={() => { setUserDropdownOpen(false); navigate('/app'); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700">
                      Workspace Switcher
                    </button>
                    <button onClick={() => { setUserDropdownOpen(false); logout(); navigate('/'); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 text-rose-600 font-medium">
                      Log Out
                    </button>
                  </div>
                )}
              </div>
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
