import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../context/useStore';

/**
 * Route guard. Replaces the old activeModule-based useEffect redirect —
 * with real routes, "you must be logged in to see this" is just a
 * component wrapping the protected route element.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = useStore((state) => state.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
};
