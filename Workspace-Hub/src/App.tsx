import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useStore } from './context/useStore';
import { PageLoader } from './components/ui/PageLoader';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { LoginPage } from './routes/LoginPage';

/*
 * Route-level code splitting.
 *
 * All of these are NAMED exports, so each needs the .then(m => ({ default: m.X }))
 * shim — React.lazy only understands a default export.
 *
 * This is worth doing here specifically: the landing page is the only thing
 * that touches GSAP (~70 kB), and the three dashboards are ~2,000 lines that
 * an anonymous visitor never runs.
 */
const LandingHome = lazy(() =>
  import('./modules/landing/Home').then(m => ({ default: m.LandingHome }))
);
const ClubsDashboard = lazy(() =>
  import('./modules/clubs/ClubsDashboard').then(m => ({ default: m.ClubsDashboard }))
);
const ClaimsDashboard = lazy(() =>
  import('./modules/claims/ClaimsDashboard').then(m => ({ default: m.ClaimsDashboard }))
);
const FacultyDashboard = lazy(() =>
  import('./modules/faculty/FacultyDashboard').then(m => ({ default: m.FacultyDashboard }))
);
const Inbox = lazy(() =>
  import('./modules/inbox/Inbox').then(m => ({ default: m.Inbox }))
);
import { ModuleLauncher } from './routes/ModuleLauncher';
import { AuthenticatedLayout } from './routes/AuthenticatedLayout';
import { NotFound } from './routes/NotFound';
import { RequireAuth } from './routes/RequireAuth';
import { CLUBS_DEFAULT_TAB } from './modules/clubs/tabs';
import { CLAIMS_DEFAULT_TAB } from './modules/claims/tabs';
import { FACULTY_DEFAULT_TAB } from './modules/faculty/tabs';
import { clearSession, readSession, setSessionEndedHandler } from './services/session';
import { queryClient } from './lib/queryClient';

export default function App() {
  const login = useStore((state) => state.login);
  const logout = useStore((state) => state.logout);
  const finishSessionRestore = useStore((state) => state.finishSessionRestore);
  const navigate = useNavigate();

  // Restore session on load — real routes now mean this no longer needs to
  // decide "which screen to show," only "am I logged in." RequireAuth waits
  // on isSessionRestoring before redirecting, so a hard refresh on a valid
  // session doesn't get bounced to /login before this effect runs.
  useEffect(() => {
    const saved = readSession();
    if (saved?.user && saved.token) {
      login(saved.user as never, saved.token, saved.capabilities ?? {}, saved.refreshToken ?? null);
    } else if (saved) {
      clearSession();
    }
    finishSessionRestore();
  }, []);

  /**
   * What "your session ended" means to the app.
   *
   * services/session.ts cannot navigate or clear caches on its own, so it
   * calls back here when a refresh is definitively refused — expired, revoked,
   * or reuse detected. Anything less than that (a network blip) is NOT a
   * sign-out.
   */
  useEffect(() => {
    setSessionEndedHandler(() => {
      logout();
      // Drop every cached response: the next user of this browser must not
      // see the previous one's data flash on screen before the redirect.
      queryClient.clear();
      navigate('/login', { replace: true });
    });
  }, [logout, navigate]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/"
          element={
            // The public site is the one screen an anonymous visitor sees. A
            // render throw here used to be a blank page at the department's
            // front door.
            <ErrorBoundary label="This page">
              <LandingHome />
            </ErrorBoundary>
          }
        />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AuthenticatedLayout />
            </RequireAuth>
          }
        >
          {/*
            * Every screen has a URL.
            *
            * These three used to be splat routes (`clubs/*`) with nothing
            * inside them and nothing reading the splat, so 27 screens shared
            * 3 URLs: the tab lived in useState, Back left the module
            * entirely, and a deep link to "the Budget tab of the Commerce
            * Club" could not be written down at all.
            *
            * The tab is a path segment; the club is a SEARCH param, because
            * they are orthogonal — you can change club without changing tab.
            */}
          <Route index element={<Inbox />} />
          <Route path="modules" element={<ModuleLauncher />} />

          <Route path="clubs">
            <Route index element={<Navigate to={CLUBS_DEFAULT_TAB} replace />} />
            <Route path=":tab" element={<ClubsDashboard />} />
          </Route>

          <Route path="claims">
            <Route index element={<Navigate to={CLAIMS_DEFAULT_TAB} replace />} />
            <Route path=":tab" element={<ClaimsDashboard />} />
          </Route>

          <Route path="faculty">
            <Route index element={<Navigate to={FACULTY_DEFAULT_TAB} replace />} />
            <Route path=":tab" element={<FacultyDashboard />} />
          </Route>

          {/* A stale /app/... bookmark used to be thrown out to the public
              landing page by the catch-all below. It now lands inside the
              shell, where the user can still see where they are. */}
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Unauthenticated paths only. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
