import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastViewport } from '@astryxdesign/core/Toast';

import { yellowFormKeys } from '../../lib/queryKeys';
import type { YellowFormWorkflow } from '../../api/types';
import { WORKFLOW_FIXTURE } from './testFixtures';

/**
 * Render a yellow-form component the way the app mounts it: inside a query
 * client (with the workflow table already cached, as it is after the first
 * screen) and the one toast viewport. Test-only.
 */
export function renderWithClient(ui: ReactElement, workflow: YellowFormWorkflow | null = WORKFLOW_FIXTURE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (workflow) queryClient.setQueryData(yellowFormKeys.workflow(), workflow);
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastViewport>{ui}</ToastViewport>
    </QueryClientProvider>,
  );
  return { queryClient, ...result };
}
