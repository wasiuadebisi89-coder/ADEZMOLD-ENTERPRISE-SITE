import { onIdTokenChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Re-reads the user (e.g. after email verification). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [, setVersion] = useState(0);

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
        setVersion((v) => v + 1);
      }),
    [],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh: async () => {
        if (!auth.currentUser) return;
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
        setUser(auth.currentUser);
        setVersion((v) => v + 1);
      },
      signOut: () => fbSignOut(auth),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
