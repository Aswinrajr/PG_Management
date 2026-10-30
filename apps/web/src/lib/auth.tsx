import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Membership {
  orgId: string;
  orgName: string;
  orgStatus?: string;
  role: 'owner' | 'manager' | 'staff' | 'resident';
  propertyIds: string[];
}

export interface Me {
  user: { id: string; phone: string; name: string; isSuperAdmin: boolean; preferredLanguage: string };
  memberships: Membership[];
  isSuperAdmin: boolean;
  impersonatedBy?: string;
}

const WORKSPACE_KEY = 'roomora.workspace';

const keyOf = (m: Pick<Membership, 'orgId' | 'role'>) => `${m.orgId}:${m.role}`;

export const homeOf = (m?: Membership) => (!m ? '/onboarding' : m.role === 'resident' ? '/me' : '/app/dashboard');

interface AuthValue {
  me: Me | null;
  loading: boolean;
  workspace?: Membership;
  orgPath: (path: string) => string;
  setWorkspace: (m: Membership) => void;
  reload: () => Promise<Me | null>;
  signIn: (token: string) => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceKey, setWorkspaceKey] = useState(() => localStorage.getItem(WORKSPACE_KEY));

  const reload = useCallback(async () => {
    const next = await api.get<Me>('/auth/me').catch(() => null);
    setMe(next);
    return next;
  }, []);

  useEffect(() => {
    void (async () => {
      if (await api.refresh()) await reload();
      setLoading(false);
    })();
  }, [reload]);

  const value = useMemo<AuthValue>(() => {
    const memberships = me?.memberships ?? [];
    const workspace = memberships.find((m) => keyOf(m) === workspaceKey) ?? memberships[0];
    return {
      me,
      loading,
      workspace,
      orgPath: (path) => `/org/${workspace?.orgId}${path}`,
      setWorkspace: (m) => {
        localStorage.setItem(WORKSPACE_KEY, keyOf(m));
        setWorkspaceKey(keyOf(m));
      },
      reload,
      signIn: async (token) => {
        api.setToken(token);
        return reload();
      },
      signOut: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        api.setToken(null);
        localStorage.removeItem(WORKSPACE_KEY);
        setMe(null);
      },
    };
  }, [me, loading, workspaceKey, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs AuthProvider');
  return value;
}
