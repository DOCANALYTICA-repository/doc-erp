import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@astryxdesign/core/Toast';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { UserCog } from 'lucide-react';

import { api } from '../services/api';
import { describeError } from '../services/errors';
import { parseUserProfile } from '../api/contracts';
import { useStore, type UserState } from '../context/useStore';
import { writeSession } from '../services/session';
import type { LoginResponse, UserProfile } from '../api/types';

/**
 * Switch to a seeded account without its password. DEVELOPMENT ONLY.
 *
 * ── Why this is fenced so heavily ───────────────────────────────────────────
 *
 * The design canvas showed a "Switch persona" list in three places, and it is
 * genuinely useful — checking the HOD's view, the Class Teacher's view and a
 * student's view otherwise means three sign-ins with three passwords.
 *
 * But it is impersonation against a live OAuth2 system with server-resolved
 * permissions, so it is gated twice over:
 *
 *  1. **Client:** `import.meta.env.DEV`. Vite replaces this with the literal
 *     `false` in a production build, so the whole component — and its import
 *     of the endpoint path — is dead code the bundler removes. It cannot be
 *     rendered in production even by mistake.
 *
 *  2. **Server:** `POST /auth/demo-persona` returns **404** unless
 *     `ENABLE_DEMO_PERSONAS` is on, and only accepts an allow-list of seeded
 *     fixture accounts. A production API refuses even if a dev build somehow
 *     reached it.
 *
 * Both are required. The client gate alone would leave a live endpoint; the
 * server gate alone would ship a visible control that always fails.
 *
 * ── What it deliberately does NOT do ────────────────────────────────────────
 *
 * It does not replace the account menu. The canvas put the persona list where
 * "Your inbox" and "Notification settings" used to be, which would remove the
 * only route to the notification preferences screen. This is a separate,
 * clearly-labelled control beside it.
 */

/**
 * Supplied by the server, not hardcoded here.
 *
 * The allow-list lives in `settings.DEMO_PERSONA_EMAILS`, and a second copy in
 * the client would drift from it — offering a persona the API refuses, or
 * hiding one it allows.
 */
interface DemoPersona {
  email: string;
  name: string;
  primary_role: string;
  role_tags_str: string;
}

export const DemoPersonaMenu: React.FC = () => {
  const login = useStore(state => state.login);
  const currentEmail = useStore(state => state.user?.email);
  const navigate = useNavigate();
  const showToast = useToast();
  const [isOpen, setIsOpen] = React.useState(false);
  const [personas, setPersonas] = React.useState<DemoPersona[]>([]);

  /*
   * Ask the server what is available before rendering anything.
   *
   * A control that is always present and always fails is worse than no
   * control. `GET /auth/demo-persona` 404s when the flag is off, so an empty
   * list means "do not render" — and the list it returns doubles as the menu's
   * contents, which is why there is no persona list in this file.
   *
   * Note the POST cannot answer this question: it deliberately returns 404
   * both when the feature is off and when an address is not allow-listed, so
   * that it cannot be used to enumerate the personas.
   */
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    api
      .get<DemoPersona[]>('/auth/demo-persona')
      .then(list => {
        if (!cancelled) setPersonas(list);
      })
      .catch(() => {
        // 404 (feature off) or anything else — either way, render nothing.
        if (!cancelled) setPersonas([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!import.meta.env.DEV || personas.length === 0) return null;

  const become = async (email: string) => {
    try {
      const res = await api.post<LoginResponse>('/auth/demo-persona', { email });
      const accessToken = res.access_token;
      const refreshToken = res.refresh_token ?? null;

      // Same hydration order as LoginPage: write the pair first so /auth/me
      // carries the Authorization header.
      writeSession({ user: null, token: accessToken, refreshToken, capabilities: {} });
      const profile = parseUserProfile(await api.get<UserProfile>('/auth/me')) as UserProfile;

      login(profile as UserState, accessToken, profile.capabilities || {}, refreshToken);
      showToast({ body: `Now viewing as ${profile.name}.`, type: 'info' });
      navigate('/app', { replace: true });
    } catch (error) {
      showToast({ body: describeError(error), type: 'error' });
    }
  };

  return (
    <DropdownMenu
      isMenuOpen={isOpen}
      onOpenChange={setIsOpen}
      button={{
        label: 'Persona',
        variant: 'ghost',
        size: 'sm',
        icon: <UserCog className="h-4 w-4" />,
        'aria-label': 'Switch to a demo persona (development only)',
      }}
      menuWidth={280}
      items={[
        {
          type: 'section',
          title: 'Development only — switch persona',
          items: personas.map(persona => ({
            label: persona.name,
            description: [persona.primary_role, persona.role_tags_str]
              .filter(Boolean)
              .join(' · '),
            isDisabled: persona.email === currentEmail,
            onClick: () => void become(persona.email),
          })),
        },
      ]}
    />
  );
};
