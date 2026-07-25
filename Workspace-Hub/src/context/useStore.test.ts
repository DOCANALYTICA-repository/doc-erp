import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore';

describe('useStore RBAC/capabilities (single source of truth from /auth/me)', () => {
  beforeEach(() => {
    useStore.setState({ user: null, token: null, capabilities: {} });
    localStorage.clear();
  });

  it('hasPermission is false for everyone before login', () => {
    expect(useStore.getState().hasPermission('claims:submit')).toBe(false);
  });

  it('hasPermission reflects the server-provided permissions array after login', () => {
    useStore.getState().login(
      { id: 'u1', email: 'a@b.com', name: 'A', primary_role: 'student', role_tags_str: '', status: 'active', permissions: ['claims:submit'] },
      'tok'
    );
    expect(useStore.getState().hasPermission('claims:submit')).toBe(true);
    expect(useStore.getState().hasPermission('clubs:approve_plan')).toBe(false);
  });

  it('super_admin wildcard "*" grants every permission', () => {
    useStore.getState().login(
      { id: 'u2', email: 'admin@b.com', name: 'Admin', primary_role: 'super_admin', role_tags_str: '', status: 'active', permissions: ['*'] },
      'tok'
    );
    expect(useStore.getState().hasPermission('anything:at_all')).toBe(true);
  });

  it('isEnabled treats an absent slug as live, and a coming_soon slug as disabled', () => {
    useStore.setState({ capabilities: { 'clubs.ai_command_center': 'coming_soon' } });
    expect(useStore.getState().isEnabled('clubs.ai_command_center')).toBe(false);
    expect(useStore.getState().isEnabled('clubs.events')).toBe(true);
  });

  it('logout clears session state and localStorage', () => {
    useStore.getState().login(
      { id: 'u1', email: 'a@b.com', name: 'A', primary_role: 'student', role_tags_str: '', status: 'active', permissions: [] },
      'tok'
    );
    useStore.getState().logout();
    expect(useStore.getState().user).toBeNull();
    expect(localStorage.getItem('doc_user_session')).toBeNull();
  });
});
