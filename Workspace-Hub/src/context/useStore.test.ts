import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore, type UserState } from './useStore';
import { ApiError, api } from '../services/api';
import { readSession, writeSession } from '../services/session';

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

describe('restoreSession', () => {
  const stale: UserState = {
    id: 'fac_reynal', email: 'reynal@christuniversity.in', name: 'Dr. Reynal', primary_role: 'faculty',
    role_tags_str: 'Club Faculty Coordinator', status: 'active', permissions: ['claims:review_faculty'],
  };

  beforeEach(() => {
    useStore.setState({ user: null, token: null, capabilities: {}, isSessionRestoring: true });
    localStorage.clear();
    writeSession({ user: stale as never, token: 'tok', refreshToken: 'rt1', capabilities: {} });
  });
  afterEach(() => vi.restoreAllMocks());

  it('re-reads the profile, so a session from before a release gets its new permissions and capabilities', async () => {
    vi.spyOn(api, 'get').mockImplementation((async () => {
      // The access token expired and was refreshed (and rotated) during the request.
      writeSession({ ...readSession()!, token: 'tok2', refreshToken: 'rt2' });
      return {
        ...stale,
        permissions: ['claims:review_faculty', 'yellow_forms:approve_faculty_coordinator'],
        capabilities: { 'claims.individual_co_curricular': 'coming_soon' },
      };
    }) as never);

    await useStore.getState().restoreSession();

    const state = useStore.getState();
    expect(state.isSessionRestoring).toBe(false);
    expect(state.hasPermission('yellow_forms:approve_faculty_coordinator')).toBe(true);
    expect(state.isEnabled('claims.individual_co_curricular')).toBe(false);
    const stored = readSession();
    expect(stored?.user?.permissions).toContain('yellow_forms:approve_faculty_coordinator');
    expect([stored?.token, stored?.refreshToken]).toEqual(['tok2', 'rt2']);
  });

  it('keeps the stored profile when the server cannot be reached', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new ApiError(0, { detail: 'Cannot reach the server.' }));

    await useStore.getState().restoreSession();

    expect(useStore.getState().user?.permissions).toEqual(['claims:review_faculty']);
    expect(useStore.getState().isSessionRestoring).toBe(false);
  });
});
