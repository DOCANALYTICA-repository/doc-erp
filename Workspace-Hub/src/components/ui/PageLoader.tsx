import React from 'react';
import { Spinner } from '@astryxdesign/core/Spinner';

/** Full-section loading placeholder — use whenever a page/workspace/tab is
 * fetching its initial data, instead of rendering blank until it resolves. */
export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <div className="w-full min-h-[40vh] flex items-center justify-center">
    <Spinner size="lg" label={label} />
  </div>
);
