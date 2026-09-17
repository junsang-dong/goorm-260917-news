import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { assertCloudConfig, getAppMode, isFirebaseConfigured, type AuthUser } from './config';
import { signInWithGoogle, signOutGoogle, subscribeAuth } from './firebase-auth';

type AuthContextValue = {
  ready: boolean;
  enabled: boolean;
  mode: 'local' | 'cloud';
  user: AuthUser | null;
  error: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, onSignedOut }: { children: ReactNode; onSignedOut?: () => void }) {
  const mode = getAppMode();
  const enabled = isFirebaseConfigured();
  const [ready, setReady] = useState(!enabled);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      assertCloudConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증 설정 오류');
      setReady(true);
      return;
    }
    if (!enabled) {
      setReady(true);
      return;
    }
    const unsub = subscribeAuth((next) => {
      setUser(next);
      setReady(true);
    });
    return unsub;
  }, [enabled]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      enabled,
      mode,
      user,
      error,
      async signIn() {
        setError('');
        await signInWithGoogle();
      },
      async signOut() {
        setError('');
        await signOutGoogle();
        onSignedOut?.();
      },
    }),
    [ready, enabled, mode, user, error, onSignedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider가 필요합니다.');
  return ctx;
}
