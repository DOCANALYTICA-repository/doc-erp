import React, { createContext, useContext } from 'react';

import type { ClubBootstrap } from '../../api/types';

/**
 * What every club tab needs, provided once by the shell.
 *
 * Each tab used to receive nothing and read from 41 useState slots in a shared
 * 1,000-line parent. Now a tab takes the shell payload from context and owns
 * its own query and its own form state — which is what makes the tab files
 * independently readable, and independently testable.
 */
interface ClubWorkspace {
  clubId: string;
  bootstrap: ClubBootstrap;
  /** Refetch the shell (counters, capabilities) after a write that changes them. */
  refreshShell: () => void;
}

const Context = createContext<ClubWorkspace | null>(null);

export const ClubWorkspaceProvider: React.FC<{
  value: ClubWorkspace;
  children: React.ReactNode;
}> = ({ value, children }) => <Context.Provider value={value}>{children}</Context.Provider>;

export function useClubWorkspace(): ClubWorkspace {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error('useClubWorkspace must be used inside a ClubWorkspaceProvider');
  }
  return ctx;
}

/** Convenience: the resolved capability set for the current viewer. */
export function useClubCapabilities() {
  return useClubWorkspace().bootstrap.capabilities;
}
