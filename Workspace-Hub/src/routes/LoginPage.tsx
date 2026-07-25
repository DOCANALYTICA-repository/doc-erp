import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore, UserState } from '../context/useStore';
import { api, ApiError } from '../services/api';
import { Sparkles } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const login = useStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

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

      login(userProfile as UserState, accessToken, capabilities);
      const from = (location.state as any)?.from?.pathname || '/app';
      navigate(from, { replace: true });
    } catch (err) {
      localStorage.removeItem('doc_user_session');
      setLoginError(
        err instanceof ApiError ? err.message : 'Authentication failed. Check email or password.'
      );
    }
  };

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
          <button onClick={() => navigate('/')} className="text-xs text-slate-400 hover:underline">
            Back to Public Website
          </button>
        </div>
      </div>
    </div>
  );
};
