import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { clubKeys } from '../../../lib/queryKeys';
import { ClubHierarchyChart } from '../ClubHierarchyChart';
import { useClubWorkspace } from '../ClubWorkspaceContext';

export const StructureTab: React.FC = () => {
  const { clubId, bootstrap, refreshShell } = useClubWorkspace();
  const queryClient = useQueryClient();

  // The hierarchy and the roster both arrive in the shell payload, so this tab
  // fetches nothing at all. It used to re-fetch /hierarchy that the parent had
  // loaded moments earlier — the endpoint was hit twice per workspace load.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'members') });
    queryClient.invalidateQueries({ queryKey: clubKeys.resource(clubId, 'hierarchy') });
    refreshShell();
  };

  return (
    <ClubHierarchyChart
      clubId={clubId}
      members={bootstrap.members}
      canEdit={bootstrap.capabilities.can_edit_hierarchy}
      levels={bootstrap.hierarchy}
      onLevelsChanged={refresh}
      onMembersChanged={refresh}
    />
  );
};
