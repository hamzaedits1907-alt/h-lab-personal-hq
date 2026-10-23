import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthState } from '@/data/repository';
import { useRepository } from './RepositoryContext';

type AuthContextState = { status: 'loading' } | AuthState;

const AuthContext = createContext<AuthContextState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [state, setState] = useState<AuthContextState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    repo
      .getAuthState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ status: 'signed-out' }));
    const off = repo.onAuthChange((s) => alive && setState(s));
    return () => {
      alive = false;
      off();
    };
  }, [repo]);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function useIsAdmin(): boolean {
  const a = useAuth();
  return a.status === 'signed-in' && a.isAdmin;
}
