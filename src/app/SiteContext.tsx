import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SiteData } from '@/content/schema';
import { AppError } from '@/data/errors';
import { useRepository } from './RepositoryContext';

export type SiteState =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; data: SiteData };

interface SiteContextValue {
  state: SiteState;
  /** Re-fetch from the database. Keeps showing current data while refreshing. */
  reload: () => Promise<SiteData | null>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const [state, setState] = useState<SiteState>({ status: 'loading' });
  const requestId = useRef(0);

  const reload = useCallback(async (): Promise<SiteData | null> => {
    const id = ++requestId.current;
    try {
      const data = await repo.loadSite();
      if (id === requestId.current) setState({ status: 'ready', data });
      return data;
    } catch (e) {
      const error = e instanceof AppError ? e : new AppError('unknown', 'Could not load the site.');
      // Keep the last good data on screen if a refresh fails; only show the error on first load.
      if (id === requestId.current) setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', error }));
      return null;
    }
  }, [repo]);

  useEffect(() => {
    void reload();
    // Signing in or out changes which rows are visible (admins see hidden ones).
    return repo.onAuthChange(() => void reload());
  }, [repo, reload]);

  const value = useMemo(() => ({ state, reload }), [state, reload]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSite must be used inside <SiteProvider>');
  return ctx;
}

/** Convenience for components that only render when data is ready. */
export function useSiteData(): SiteData | null {
  const { state } = useSite();
  return state.status === 'ready' ? state.data : null;
}
