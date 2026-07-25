import React, { useState, useEffect } from 'react';
import { useStore, UserState } from './context/useStore';
import { LandingHome } from './modules/landing/Home';
import { ClubsDashboard } from './modules/clubs/ClubsDashboard';
import { ClaimsDashboard } from './modules/claims/ClaimsDashboard';
import { FacultyDashboard } from './modules/faculty/FacultyDashboard';
import { api, ApiError } from './services/api';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import {
  Sparkles,
  LogOut,
  Search,
  Bell,
  Users,
  Award,
  Compass,
  FolderOpen,
  X,
  Menu,
  ChevronDown,
  Layers,
  CheckCircle,
  Clock
} from 'lucide-react';

export default function App() {
  const {
    user,
    token,
    activeModule,
    activeTab,
    isSearchOpen,
    isNotificationsOpen,
    login,
    logout,
    navigate,
    setSearchOpen,
    setNotificationsOpen,
    hasPermission
  } = useStore();

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>({ users: [], clubs: [], meetings: [], tasks: [] });
  const [notifications, setNotifications] = useState<any[]>([]);

  // Restore Session
  useEffect(() => {
    const saved = localStorage.getItem('doc_user_session');
    if (saved) {
      try {
        const { user, token, capabilities } = JSON.parse(saved);
        if (user) login(user, token, capabilities || {});
      } catch (e) {
        localStorage.removeItem('doc_user_session');
      }
    }
  }, []);

  // Route Guard: redirect unauthenticated users to login page if they try to access protected modules
  useEffect(() => {
    if (!user && activeModule !== 'landing') {
      navigate('landing', 'login');
    }
  }, [user, activeModule]);

  // Fetch notifications if logged in
  useEffect(() => {
    if (user) {
      api.get<any[]>('/notifications').then(setNotifications).catch(console.error);
    }
  }, [user, activeModule]);

  // Execute global search
  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      // Mock global search mapping
      const term = searchQuery.toLowerCase();
      const users = [
        { id: 'fac_class_teacher', name: 'Prof. Sarah Abraham', role: 'Class Teacher' },
        { id: 'fac_subject_2', name: 'Prof. David D\'Souza', role: 'Subject Professor' },
        { id: 'std_regular_1', name: 'Vikram Aditya', role: 'Student' }
      ].filter(u => u.name.toLowerCase().includes(term));

      const clubs = [
        { id: 'club_commerce', name: 'Commerce Club', category: 'Academic' },
        { id: 'club_cultural', name: 'Cultural Committee', category: 'Cultural' }
      ].filter(c => c.name.toLowerCase().includes(term));

      setSearchResults({ users, clubs, meetings: [], tasks: [] });
    } else {
      setSearchResults({ users: [], clubs: [], meetings: [], tasks: [] });
    }
  }, [searchQuery]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const params = new URLSearchParams();
      params.append('username', emailInput);
      params.append('password', passwordInput);

      const res = await api.post<any>('/auth/login', params);

      let userProfile = res.user_profile;
      let capabilities = res.capabilities || {};
      const accessToken = res.access_token;

      if (!userProfile) {
        // Real backend: save token temporarily so client headers include it
        localStorage.setItem('doc_user_session', JSON.stringify({ user: null, token: accessToken, capabilities: {} }));
        const profile = await api.get<any>('/auth/me');
        capabilities = profile.capabilities || {};
        userProfile = profile;
      }

      login(userProfile, accessToken, capabilities);
    } catch (err) {
      localStorage.removeItem('doc_user_session');
      setLoginError(
        err instanceof ApiError ? err.message : 'Authentication failed. Check email or password.'
      );
    }
  };

  // 1. If not authenticated, render Public website or Login screen
  if (!user) {
    if (activeTab === 'login') {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] flex items-center justify-center p-4">
          <div className="w-full max-w-sm p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-xl space-y-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white dark:text-slate-900" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">DOC Digital Identity</h2>
              <p className="text-xs text-slate-400">Enter your credentials to enter the ERP workspaces.</p>
            </div>
            
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-semibold">CHRIST Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@christuniversity.in"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-950 dark:text-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-500 font-semibold">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-950 dark:text-white"
                />
              </div>
              {loginError && <span className="text-[10px] text-rose-500 block">{loginError}</span>}
              <button
                type="submit"
                className="w-full py-2.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors text-xs"
              >
                Authenticate Session
              </button>
            </form>
            <div className="text-center pt-2">
              <button onClick={() => navigate('landing', 'home')} className="text-xs text-slate-400 hover:underline">
                Back to Public Website
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <LandingHome />;
  }

  // 2. Module Launcher Layout
  if (activeModule === 'launcher') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080808] flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-900 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center shadow">
                <Sparkles className="w-5 h-5 text-white dark:text-slate-900" />
              </div>
              <div>
                <h1 className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">DOC Unified Digital Platform</h1>
                <p className="text-xs text-slate-400 mt-0.5">Select a workspace according to your platform authorizations.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200/50 dark:border-slate-800/80">
                Role: {user.primary_role} {user.role_tags_str && `(${user.role_tags_str})`}
              </span>
              <button onClick={logout} className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors shadow-sm">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { id: 'clubs', title: 'Clubs Management', desc: 'Recruitments, annual planning, budget requests, and sponsorship tracking.', icon: Award, perm: 'clubs:view' },
              { id: 'claims', title: 'Attendance Claims', desc: 'Submit medical claims, co-curricular exemptions, and check review queues.', icon: Compass, perm: 'claims:view_own' },
              { id: 'faculty', title: 'Faculty Workspace', desc: 'Meetings agenda planner, curriculum tracking, personal folders, and notes.', icon: FolderOpen, perm: 'faculty:dashboard' }
            ].map(m => {
              const eligible = hasPermission(m.perm);
              return (
                <div
                  key={m.id}
                  onClick={() => eligible && navigate(m.id as any)}
                  className={`p-6 rounded-2xl border bg-white dark:bg-slate-900 text-left transition-all duration-300 shadow-sm flex flex-col justify-between h-56 ${
                    eligible 
                      ? 'border-slate-200/60 dark:border-slate-800/80 cursor-pointer hover:shadow-lg hover:scale-[1.01]' 
                      : 'border-slate-100 dark:border-slate-950 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <m.icon className={`w-8 h-8 ${eligible ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} />
                    <h3 className="font-bold text-slate-900 dark:text-white mt-4 text-base">{m.title}</h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">{m.desc}</p>
                  </div>
                  <div className="text-xs font-semibold pt-4 flex items-center justify-between">
                    <span className={eligible ? 'text-indigo-500' : 'text-slate-400'}>
                      {eligible ? 'Open Workspace →' : 'Access Restricted'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated Module Shared Shell Layout
  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      style={{ height: '100dvh', width: '100%' }}
      topNav={
        <TopNav
          label="Main navigation"
          heading={
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('launcher')}>
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white dark:text-slate-900" />
              </div>
              <TopNavHeading
                heading="DOC Unified Digital ERP"
              />
              <span className="text-[10px] bg-slate-105 dark:bg-slate-900 text-slate-400 font-bold px-2 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/80 uppercase ml-2">
                {activeModule}
              </span>
            </div>
          }
          endContent={
            <div className="flex items-center gap-4">
              {/* Search bar */}
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

              {/* Notifications */}
              <button
                onClick={() => setNotificationsOpen(!isNotificationsOpen)}
                className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white relative rounded-lg"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
                )}
              </button>

              {/* User menu dropdown */}
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
                    <button onClick={() => { setUserDropdownOpen(false); navigate('launcher'); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Workspace Switcher
                    </button>
                    <button onClick={() => { setUserDropdownOpen(false); logout(); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 font-medium">
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
      {/* Main Workspace content */}
      <div className="w-full h-full min-h-[calc(100vh-4rem)]">
        {activeModule === 'clubs' && <ClubsDashboard />}
        {activeModule === 'claims' && <ClaimsDashboard />}
        {activeModule === 'faculty' && <FacultyDashboard />}
      </div>

      {/* Search overlay drawer */}
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
              {searchResults.users.length > 0 && (
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
              {searchResults.clubs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clubs</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResults.clubs.map((c: any) => (
                      <div key={c.id} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs cursor-pointer" onClick={() => { navigate('clubs'); setSearchOpen(false); }}>
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

      {/* Notifications Drawer */}
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
}
