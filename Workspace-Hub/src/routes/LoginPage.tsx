import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore, UserState } from '../context/useStore';
import { api, ApiError } from '../services/api';
import { Sparkles } from 'lucide-react';
import type { LoginResponse, UserProfile } from '../api/types';
import { parseUserProfile } from '../api/contracts';
import { clearSession, writeSession } from '../services/session';

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

      const res = await api.post<LoginResponse>('/auth/login', params);

      let userProfile = res.user_profile;
      let capabilities = res.capabilities || {};
      const accessToken = res.access_token;
      const refreshToken = res.refresh_token ?? null;

      if (!userProfile) {
        // Store the pair before calling /auth/me, so that request carries the
        // Authorization header — and so a token expiring mid-hydrate can
        // refresh rather than bouncing the user back to this page.
        writeSession({ user: null, token: accessToken, refreshToken, capabilities: {} });
        const profile = parseUserProfile(await api.get<UserProfile>('/auth/me')) as UserProfile;
        capabilities = profile.capabilities || {};
        userProfile = profile;
      }

      login(userProfile as UserState, accessToken, capabilities, refreshToken);
      const from =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/app';
      navigate(from, { replace: true });
    } catch (err) {
      clearSession();
      setLoginError(
        err instanceof ApiError ? err.message : 'Authentication failed. Check email or password.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-white border border-slate-200/60 shadow-xl space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">DOC Digital Identity</h2>
          <p className="text-sm text-slate-500">Sign in with your university account.</p>
        </div>

        {/*
          * The labels here were not associated with their inputs (no htmlFor,
          * no nesting), so a screen reader announced two unlabelled text
          * fields — and the inputs carried no `name` or `autocomplete`, which
          * is why no password manager ever offered to fill this form.
          */}
        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-slate-600" htmlFor="login-email">
              CHRIST email address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="name@christuniversity.in"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-slate-600" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            />
          </div>

          {/* role=alert so the failure is announced, not just recoloured. */}
          {loginError ? (
            <p role="alert" className="text-sm text-rose-600">{loginError}</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            Sign in
          </button>
        </form>
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-slate-500 hover:underline"
          >
            Back to the public website
          </button>
        </div>
      </div>
    </div>
  );
};
