import { describe, it, expect } from 'vitest';

import type { Notification } from '../api/types';
import { destinationFor } from './NotificationTray';

function notification(entity_type: string | null, entity_id: string | null): Notification {
  return {
    id: 'n-1',
    user_id: 'u-1',
    title: 'Title',
    content: null,
    is_read: false,
    source_module: 'claims',
    entity_type,
    entity_id,
  };
}

describe('where a notification leads', () => {
  it('opens a pre-approval on the Yellow Forms tab', () => {
    expect(destinationFor(notification('pre_approval', 'paf_da_2'))).toBe('/app/claims/yellow_forms?open=paf_da_2');
  });

  it('opens a claim sheet on the Yellow Forms tab', () => {
    expect(destinationFor(notification('claim_sheet', 'ccs_da_7'))).toBe('/app/claims/yellow_forms?open=ccs_da_7');
  });

  it('leaves the existing destinations alone', () => {
    expect(destinationFor(notification('claim', 'cl_1'))).toBe('/app/claims/my_claims?claim=cl_1');
    expect(destinationFor(notification('pre_approval', null))).toBeNull();
  });
});
