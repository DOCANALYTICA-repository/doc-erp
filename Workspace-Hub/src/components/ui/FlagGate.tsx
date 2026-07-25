import React from 'react';
import { useStore } from '../../context/useStore';
import { EmptyState } from '@astryxdesign/core/EmptyState';

interface FlagGateProps {
  slug: string;
  children: React.ReactNode;
}

/**
 * Route/section-level capability gate. Wrap any workspace whose backing
 * feature may be "coming_soon" (see backend/app/core/capabilities.py and the
 * v1 Feature Matrix). Renders the real content when live, otherwise a
 * consistent "Coming Soon" empty state — never a blank screen, a 404, or a
 * silent no-op. Build this once, reuse for every gated route/section.
 */
export const FlagGate: React.FC<FlagGateProps> = ({ slug, children }) => {
  const isEnabled = useStore((state) => state.isEnabled(slug));
  if (isEnabled) return <>{children}</>;

  return (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center p-8">
      <EmptyState
        title="Coming Soon"
        description="This capability is on our roadmap and isn't switched on yet."
      />
    </div>
  );
};
