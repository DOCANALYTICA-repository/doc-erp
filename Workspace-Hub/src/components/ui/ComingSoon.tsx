import React from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Tooltip } from '@astryxdesign/core/Tooltip';

/**
 * Nav-level / action-level "coming soon" treatment. Use for a whole nav
 * tab that isn't live yet, or wrap a single disabled action button.
 * Keep the underlying element VISIBLE and disabled (sets expectations about
 * the full product shape) rather than hiding it outright.
 */
export const ComingSoonBadge: React.FC<{ label?: string }> = ({ label = 'Coming Soon' }) => (
  <Tooltip content="Available in a future release">
    <Badge variant="neutral" label={label} />
  </Tooltip>
);
