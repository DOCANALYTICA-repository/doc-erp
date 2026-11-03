import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { z } from 'zod';

import { useStore, UserState } from '../context/useStore';
import { api, ApiError } from '../services/api';
import type { LoginResponse, UserProfile } from '../api/types';
import { parseUserProfile } from '../api/contracts';
import { clearSession, writeSession } from '../services/session';
import { useZodForm, withServerErrors } from '../lib/forms';
import { NativeTextField } from '../components/ui/form/NativeTextField';
import { FormError } from '../components/ui/form/FormError';
import { rootServerError } from '../components/ui/form/fieldStatus';
import { useDocumentMeta } from '../lib/meta';

/**
 * Credentials, validated before they reach the network.
 *
 * `.email()` is not gatekeeping — a typo in the address produced a round trip
 * and a generic "Authentication failed. Check email or password." that pointed
 * at the password just as much as at the address. Catching it here says which
 * field is wrong, immediately.
 *
 * No maximum length, no character rules on the password: the server owns the
 * password policy, and a client-side rule that disagrees with it locks people
 * out of their own accounts.
 */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Enter your CHRIST email address.')
    .email('That does not look like an email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type LoginValues = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  /*
   * No canonicalPath: /login is a door, not a destination. Declaring it
   * canonical would invite a crawler to index a page whose only content is a
   * form, and to compete with the landing page for the department's name.
   */
  useDocumentMeta({
    title: 'Sign in',
    description: 'Sign in to the DOC Portal with your CHRIST University account.',
  });

  const login = useStore(state => state.login);
  const navigate = useNavigate();
  const location = useLocation();

  const form = useZodForm(loginSchema, {
    defaultValues: { email: '', password: '' },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  /**
   * The OAuth2 password grant. Preserved exactly.
   *
   * Four things here are load-bearing and must survive any refactor:
   *  - the body is `URLSearchParams` with `username`/`password`, not JSON —
   *    that is the form encoding the grant type requires;
   *  - `writeSession` runs BEFORE `/auth/me`, so that request carries the
   *    Authorization header and a token expiring mid-hydrate can refresh
   *    rather than bouncing the user back here;
   *  - the redirect honours `location.state.from`, so a deep link that hit
   *    `RequireAuth` resumes where it was going;
   *  - `clearSession()` on failure, so a half-written session cannot linger.
   */
  const submit = withServerErrors<LoginValues>(form, async values => {
    try {
      const params = new URLSearchParams();
      params.append('username', values.email);
      params.append('password', values.password);

      const res = await api.post<LoginResponse>('/auth/login', params);

      let userProfile = res.user_profile;
      let capabilities = res.capabilities || {};
      const accessToken = res.access_token;
      const refreshToken = res.refresh_token ?? null;

      if (!userProfile) {
        writeSession({ user: null, token: accessToken, refreshToken, capabilities: {} });
        const profile = parseUserProfile(await api.get<UserProfile>('/auth/me')) as UserProfile;
        capabilities = profile.capabilities || {};
        userProfile = profile;
      }

      login(userProfile as UserState, accessToken, capabilities, refreshToken);
      const from =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/app';
      navigate(from, { replace: true });
    } catch (error) {
      clearSession();

      /*
       * A 401 means something different here than anywhere else in the app.
       *
       * `describeError` maps every 401 to "Your session has expired. Please
       * sign in again." — correct when a token dies mid-session, nonsense on
       * the sign-in page, where the user never had a session and the real
       * cause is a wrong email or password. Left alone, a mistyped password
       * told people to sign in again on the form they were already using.
       *
       * Rethrown as a plain Error carrying the server's own detail:
       * `describeError` keys its session-expiry copy off `ApiError.status`, so
       * preserving the ApiError — even with a different body — would keep
       * producing the wrong sentence. A plain Error falls through to its
       * message.
       */
      if (error instanceof ApiError && error.status === 401) {
        throw new Error(
          typeof error.body?.detail === 'string'
            ? error.body.detail
            : 'Incorrect email or password.'
        );
      }
      throw error;
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-body p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2 text-center">
          <img
            src="/icon-512.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg shadow-sm"
          />
          <h1 className="font-heading text-xl font-semibold text-primary">DOC Digital Identity</h1>
          <p className="text-sm text-secondary">Sign in with your university account.</p>
        </div>

        {/*
          * Native inputs, deliberately — NOT the Astryx-backed `TextField`.
          *
          * Astryx input props extend React.HTMLAttributes rather than
          * InputHTMLAttributes, so they accept no `name` and no
          * `autoComplete`. A password manager decides whether to offer to fill
          * and save based on exactly those, so putting this form on TextField
          * would mean nobody's password manager works here again. See
          * NativeTextField for the full note.
          *
          * The labels are associated via htmlFor/id; both were once missing
          * entirely, so a screen reader announced two unlabelled text fields.
          */}
        <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4 text-sm">
          <NativeTextField
            id="login-email"
            label="CHRIST email address"
            type="email"
            placeholder="name@christuniversity.in"
            autoComplete="username"
            registration={register('email')}
            error={errors.email}
            isDisabled={isSubmitting}
          />

          <NativeTextField
            id="login-password"
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            registration={register('password')}
            error={errors.password}
            isDisabled={isSubmitting}
          />

          <FormError message={rootServerError(errors)} />

          {/*
            * `disabled` while submitting. Without it this form could be
            * double-submitted, firing two OAuth2 password grants — which on a
            * rate-limited endpoint (slowapi is configured on /auth/login) can
            * lock someone out for typing quickly.
            */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-accent py-2.5 font-semibold text-on-accent transition-colors hover:bg-gold-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-secondary hover:underline"
          >
            Back to the public website
          </button>
        </div>
      </div>
    </div>
  );
};
