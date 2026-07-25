import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './context/useStore';
import { LandingHome } from './modules/landing/Home';
import { ClubsDashboard } from './modules/clubs/ClubsDashboard';
import { ClaimsDashboard } from './modules/claims/ClaimsDashboard';
import { FacultyDashboard } from './modules/faculty/FacultyDashboard';
import { LoginPage } from './routes/LoginPage';
import { ModuleLauncher } from './routes/ModuleLauncher';
import { AuthenticatedLayout } from './routes/AuthenticatedLayout';
import { RequireAuth } from './routes/RequireAuth';

export default function App() {
  const login = useStore((state) => state.login);

  // Restore session on load — real routes now mean this no longer needs to
  // decide "which screen to show," only "am I logged in."
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

  return (
    <Routes>
      <Route path="/" element={<LandingHome />} />
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
  );
}
