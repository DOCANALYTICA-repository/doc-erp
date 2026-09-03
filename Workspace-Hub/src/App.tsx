import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import { ModuleLauncher } from './routes/ModuleLauncher';
import { AuthenticatedLayout } from './routes/AuthenticatedLayout';
import { RequireAuth } from './routes/RequireAuth';

export default function App() {
  const login = useStore((state) => state.login);
  const finishSessionRestore = useStore((state) => state.finishSessionRestore);

  // Restore session on load — real routes now mean this no longer needs to
  // decide "which screen to show," only "am I logged in." RequireAuth waits
  // on isSessionRestoring before redirecting, so a hard refresh on a valid
  // session doesn't get bounced to /login before this effect runs.
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
    finishSessionRestore();
  }, []);

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
          <Route index element={<ModuleLauncher />} />
          <Route path="clubs/*" element={<ClubsDashboard />} />
          <Route path="claims/*" element={<ClaimsDashboard />} />
          <Route path="faculty/*" element={<FacultyDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
