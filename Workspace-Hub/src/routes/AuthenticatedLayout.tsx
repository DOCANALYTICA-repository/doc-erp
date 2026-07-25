import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../context/useStore';
import { api } from '../services/api';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { Sparkles, LogOut, Search, Bell, X, ChevronDown } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>({ users: [], clubs: [], meetings: [], tasks: [] });
  const [notifications, setNotifications] = useState<any[]>([]);

  const activeModule = location.pathname.split('/')[2] || '';

  useEffect(() => {
    if (user) {
      api.get<any[]>('/notifications').then(setNotifications).catch(console.error);
    }
  }, [user, location.pathname]);

  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      api.get<any>(`/search?q=${encodeURIComponent(searchQuery)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults({ users: [], clubs: [], meetings: [], tasks: [] }));
    } else {
      setSearchResults({ users: [], clubs: [], meetings: [], tasks: [] });
    }
  }, [searchQuery]);

  if (!user) return null;

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      style={{ height: '100dvh', width: '100%' }}
      topNav={
        <TopNav
          label="Main navigation"
          heading={
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/app')}>
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white dark:text-slate-900" />
              </div>
              <TopNavHeading heading="DOC Unified Digital ERP" />
              <span className="text-[10px] bg-slate-105 dark:bg-slate-900 text-slate-400 font-bold px-2 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/80 uppercase ml-2">
                {activeModule}
              </span>
            </div>
          }
          endContent={
            <div className="flex items-center gap-4">
              <div className="relative hidden md:block">
                <input
                  type="text"
                  placeholder="Search people, clubs, tasks..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  className="w-64 pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-slate-900 border-none rounded-lg text-xs focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition-all text-slate-950 dark:text-white"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
              </div>

              <button
                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white relative rounded-lg"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
                )}
              </button>

              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-600 dark:text-slate-300">
                    {user.name[0]}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200/50 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-lg text-xs space-y-1 animate-fade-in z-50">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{user.name}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{user.email}</div>
                    </div>
                    <button onClick={() => { setUserDropdownOpen(false); navigate('/app'); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Workspace Switcher
                    </button>
                    <button onClick={() => { setUserDropdownOpen(false); logout(); navigate('/'); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 font-medium">
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
        <Outlet />
      </div>

      {isSearchOpen && searchQuery && (
        <div className="fixed inset-0 z-50 bg-slate-950/20 backdrop-blur-sm flex justify-center p-4 pt-20">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col max-h-[70vh] animate-slide-up">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Global Search results for "{searchQuery}"</h3>
              <button onClick={() => setSearchOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {searchResults.users?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faculty & Students</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.users.map((u: any) => (
                      <div key={u.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs">
                        <div className="font-bold text-slate-900 dark:text-white">{u.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{u.role}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {searchResults.clubs?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clubs</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.clubs.map((c: any) => (
                      <div key={c.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs cursor-pointer" onClick={() => { navigate('/app/clubs'); setSearchOpen(false); }}>
                        <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{c.category} Club</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isNotificationsOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col animate-slide-up">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800/80">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Notifications Tray</h3>
            <button onClick={() => setNotificationsOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {notifications.map(notif => (
              <div key={notif.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 text-xs">
                <div className="font-bold text-slate-950 dark:text-white">{notif.title}</div>
                <p className="text-slate-500 mt-1.5 leading-relaxed">{notif.content}</p>
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/30 flex justify-between items-center text-[10px]">
                  <span className="text-slate-400 uppercase font-medium">{notif.source_module}</span>
                  {!notif.is_read && (
                    <button
                      onClick={async () => {
                        await api.post(`/notifications/${notif.id}/read`, {});
                        setNotifications(notifications.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
                      }}
                      className="text-indigo-600 hover:underline"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
};
