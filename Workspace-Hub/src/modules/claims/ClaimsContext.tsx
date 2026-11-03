import React, { createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useClaims, useClaimsInvalidator, useTimetable } from '../../api/hooks';
import type { Claim, ClaimView, TimetableSession } from '../../api/types';
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
  /** Which slice of the reviewer's claims this tab is showing. */
  view: ClaimView;
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

  /**
   * The tab decides which list we fetch.
   *
   * "Approved & Actioned" is not a filter applied to the queue — it is a
   * different question asked of the server ("what have I already decided?"),
   * because the answer includes claims that have since moved to another
   * reviewer's desk and are no longer in this one's scope at all.
   */
  const { tab } = useParams<{ tab: string }>();
  const view: ClaimView = tab === 'reviewed' ? 'actioned' : 'pending';

  // Page lives here rather than in a tab, so switching between "All claims"
  // and the review queue does not silently reset the reader's position.
  const [page, setPage] = React.useState(1);
  const pageSize = 25;

  // Two tabs, two lists: reset to page 1 when the question changes, or the
  // reader lands on page 3 of a list that may only have one.
  React.useEffect(() => { setPage(1); }, [view]);

  const claimsQuery = useClaims(page, pageSize, view);
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
    view,
    academicContext,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useClaimsWorkspace(): ClaimsWorkspace {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useClaimsWorkspace must be used inside a ClaimsProvider');
  return ctx;
}
