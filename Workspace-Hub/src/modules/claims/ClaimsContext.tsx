import React, { createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useClaims, useClaimsInvalidator, useTimetable } from '../../api/hooks';
import type { Claim, TimetableSession } from '../../api/types';
import { useStore } from '../../context/useStore';

interface ClaimsWorkspace {
  claims: Claim[];
  /** Total across ALL pages, so the control can size itself honestly. */
  totalClaims: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  timetable: TimetableSession[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** Invalidates claims, the action queue and notifications together. */
  invalidate: () => void;
  /** Reviewer view: faculty AND super_admin. */
  isReviewer: boolean;
  academicContext: { programme: string; semester: string; section: string };
}

const Context = createContext<ClaimsWorkspace | null>(null);

export const ClaimsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = useStore(s => s.user);
  const invalidate = useClaimsInvalidator();
  useQueryClient();

  /**
   * super_admin belongs on the reviewer side.
   *
   * This used to test `primary_role === 'faculty'` alone, so an admin got the
   * student tabs with no review queue at all — and therefore no way to rescue
   * a stuck claim, which is exactly what the backend's super_admin bypass
   * exists for.
   */
  const isReviewer = user?.primary_role === 'faculty' || user?.primary_role === 'super_admin';

  const academicContext = {
    programme: user?.programme || '',
    semester: user?.semester || '',
    section: user?.section || '',
  };

  // Page lives here rather than in a tab, so switching between "All claims"
  // and the review queue does not silently reset the reader's position.
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  const claimsQuery = useClaims(page, pageSize);
  const timetableQuery = useTimetable(
    academicContext.programme, academicContext.semester, academicContext.section,
  );

  const value: ClaimsWorkspace = {
    claims: claimsQuery.data?.items ?? [],
    totalClaims: claimsQuery.data?.total ?? 0,
    page,
    pageSize,
    setPage,
    timetable: timetableQuery.data ?? [],
    isLoading: claimsQuery.isLoading,
    isError: claimsQuery.isError,
    error: claimsQuery.error,
    refetch: () => { void claimsQuery.refetch(); },
    invalidate,
    isReviewer,
    academicContext,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useClaimsWorkspace(): ClaimsWorkspace {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useClaimsWorkspace must be used inside a ClaimsProvider');
  return ctx;
}
