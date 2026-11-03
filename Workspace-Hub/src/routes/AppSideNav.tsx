import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { GitBranch, Inbox } from 'lucide-react';

import { useActionQueue } from '../api/hooks';
import { useStore } from '../context/useStore';
import { MODULES } from '../lib/navigation';

/**
 * The application's primary navigation.
 *
 * This exists for two reasons, and the second is the important one:
 *
 *  1. Moving between modules previously meant going back to the launcher.
 *
 *  2. THERE WAS NO MOBILE MENU AT ALL. AppShell generates a mobile drawer
 *     automatically from whatever is passed as `sideNav`, and
 *     AuthenticatedLayout passed nothing — so below the breakpoint the app had
 *     no navigation whatsoever. Not an oversight in the markup: the hamburger
 *     is gated on the slot being filled.
 */

export const AppSideNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasPermission = useStore(s => s.hasPermission);
  const { data: queue } = useActionQueue();

  const activeModule = location.pathname.split('/')[2] ?? '';

  // Mirrors the server's PermissionChecker(require_all=False) on /me/pipeline.
  const canSeePipeline =
    hasPermission('claims:approve_coordinator') ||
    hasPermission('clubs:approve_plan') ||
    hasPermission('rbac:assign_roles') ||
    hasPermission('yellow_forms:view_all');
  const waiting = queue?.total ?? 0;

  return (
    <SideNav>
      {/* A real title, not an empty string: an untitled section is dropped
          from the mobile drawer, which silently removed Inbox from the only
          navigation a phone has. */}
      <SideNavSection title="Your work">
        <SideNavItem
          label="Inbox"
          icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
          isSelected={activeModule === ''}
          onClick={() => navigate('/app')}
          endContent={
            waiting > 0 ? (
              <span
                className="rounded-full bg-gold-200 px-2 py-0.5 text-xs font-semibold text-accent"
                aria-label={`${waiting} items waiting on you`}
              >
                {waiting}
              </span>
            ) : undefined
          }
        />
      </SideNavSection>

      {/* Department oversight. Shown only to people who can actually open it,
          rather than rendering a link that 403s — the server gates the
          endpoint on any one of these permissions. */}
      {canSeePipeline ? (
        <SideNavSection title="Oversight">
          <SideNavItem
            label="Pipeline"
            icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}
            isSelected={location.pathname.startsWith('/app/pipeline')}
            onClick={() => navigate('/app/pipeline')}
          />
        </SideNavSection>
      ) : null}

      <SideNavSection title="Workspaces">
        {MODULES.filter(m => hasPermission(m.permission)).map(m => (
          <SideNavItem
            key={m.id}
            label={m.label}
            icon={<m.icon className="h-4 w-4" aria-hidden="true" />}
            isSelected={activeModule === m.id}
            onClick={() => navigate(`/app/${m.id}`)}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );
};
