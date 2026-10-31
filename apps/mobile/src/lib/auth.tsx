import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { closeSocket } from './socket';
import { BIOMETRIC_KEY, REFRESH_KEY, storage, WORKSPACE_KEY } from './storage';

export interface Membership {
  orgId: string;
  orgName: string;
  orgStatus?: string;
  role: 'owner' | 'resident';
}

export interface Me {
  user: { id: string; phone: string; name: string; email?: string; isSuperAdmin: boolean };
  memberships: Membership[];
  isSuperAdmin: boolean;
}

type Status = 'loading' | 'out' | 'locked' | 'in';

const RELOCK_MS = 60_000;
const keyOf = (m: Membership) => `${m.orgId}:${m.role}`;

interface AuthValue {
  status: Status;
  me: Me | null;
  workspace?: Membership;
  orgPath: (path: string) => string;
  biometricOn: boolean;
  biometricReady: boolean;
  chooseWorkspace: (m: Membership) => Promise<void>;
  signIn: (accessToken: string, refreshToken: string) => Promise<void>;
  unlock: () => Promise<boolean>;
  setBiometric: (on: boolean) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const confirmIdentity = async () => (await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Roomora', cancelLabel: 'Use OTP' })).success;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState<string | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const leftAt = useRef<number | null>(null);

  const load = useCallback(async () => {
    setMe(await api.get<Me>('/auth/me'));
    setStatus('in');
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await storage.get(REFRESH_KEY);
    await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    await Promise.all([storage.set(REFRESH_KEY, null), storage.set(WORKSPACE_KEY, null)]);
    api.setToken(null);
    closeSocket();
    setMe(null);
    setStatus('out');
  }, []);

  /** Restores the session. A dead session goes back to OTP. */
  const resume = useCallback(async () => {
    if (await api.refresh()) await load();
    else setStatus('out');
  }, [load]);

  useEffect(() => {
    void (async () => {
      const [refreshToken, flag, savedWorkspace, hasHardware, enrolled] = await Promise.all([
        storage.get(REFRESH_KEY),
        storage.get(BIOMETRIC_KEY),
        storage.get(WORKSPACE_KEY),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
      ]);
      const ready = hasHardware && enrolled;
      setBiometricReady(ready);
      setBiometricOn(ready && flag === 'on');
      setWorkspaceKey(savedWorkspace);
      if (!refreshToken) return setStatus('out');
      if (ready && flag === 'on') return setStatus('locked');
      await resume().catch(() => setStatus('out'));
    })();
  }, [resume]);

  // Lock again after the app has been in the background for a minute.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current && Date.now() - leftAt.current > RELOCK_MS && biometricOn) setStatus((s) => (s === 'in' ? 'locked' : s));
    });
    return () => subscription.remove();
  }, [biometricOn]);

  const value = useMemo<AuthValue>(() => {
    const memberships = me?.memberships ?? [];
    const workspace = memberships.find((m) => keyOf(m) === workspaceKey) ?? memberships[0];
    return {
      status,
      me,
      workspace,
      orgPath: (path) => `/org/${workspace?.orgId}${path}`,
      biometricOn,
      biometricReady,
      chooseWorkspace: async (m) => {
        await storage.set(WORKSPACE_KEY, keyOf(m));
        setWorkspaceKey(keyOf(m));
      },
      signIn: async (accessToken, refreshToken) => {
        api.setToken(accessToken);
        await storage.set(REFRESH_KEY, refreshToken);
        await load();
      },
      unlock: async () => {
        if (!(await confirmIdentity())) return false;
        await resume();
        return true;
      },
      setBiometric: async (on) => {
        if (on && !(await confirmIdentity())) return false;
        await storage.set(BIOMETRIC_KEY, on ? 'on' : null);
        setBiometricOn(on);
        return true;
      },
      signOut,
    };
  }, [status, me, workspaceKey, biometricOn, biometricReady, load, resume, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth needs AuthProvider');
  return value;
}
