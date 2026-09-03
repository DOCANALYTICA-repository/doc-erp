import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../services/api';

/**
 * @tanstack/react-query has been a dependency of this project since it began
 * and was imported exactly zero times. Every screen hand-rolled useEffect +
 * useState + a `reloadTick` counter instead, which is why switching a tab
 * re-issued thirteen requests for data that was already in memory.
 *
 * staleTime is the setting that does the work here. Club sub-resources change
 * on human timescales — somebody adds a member, files a reimbursement — so 30
 * seconds of staleness is invisible to a user and removes essentially all
 * repeat traffic from navigating between tabs.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,

      // Refetching on every window focus is the wrong default for a workspace
      // people leave open all day beside their email.
      refetchOnWindowFocus: false,

      retry: (failureCount, error) => {
        // Never retry something the server has definitively refused. A 403 is
        // not a transient failure, and retrying it three times just delays
        // telling the user why.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
