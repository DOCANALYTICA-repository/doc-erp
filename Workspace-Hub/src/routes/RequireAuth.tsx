import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../context/useStore';
import { PageLoader } from '../components/ui/PageLoader';

/**
 * Route guard. Replaces the old activeModule-based useEffect redirect —
 * with real routes, "you must be logged in to see this" is just a
 * component wrapping the protected route element.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = useStore((state) => state.user);
  const isSessionRestoring = useStore((state) => state.isSessionRestoring);
  const location = useLocation();

  // Wait for App's session-restore effect before deciding — otherwise a
  // hard refresh on a valid session briefly has user === null and
  // incorrectly redirects to /login before localStorage is read.
  if (isSessionRestoring) {
    return <PageLoader label="Restoring your session..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
};
