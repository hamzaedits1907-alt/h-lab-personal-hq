import { createContext, useContext, type ReactNode } from 'react';
import { env } from './env';
import { AppError } from '@/data/errors';
import type { Repository } from '@/data/repository';
import { SupabaseRepository } from '@/data/supabaseRepository';

const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): Repository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('useRepository must be used inside <RepositoryProvider>');
  return repo;
}

/** Picks the backend from build-time configuration. Returns an AppError instead of throwing. */
export async function createRepository(): Promise<Repository | AppError> {
  // The condition is written inline so Vite can replace `import.meta.env.MODE` at build time:
  // in a production build this branch, and the demo repository it imports, are removed entirely.
  if (import.meta.env.MODE !== 'production' && import.meta.env.VITE_DEMO_MODE === 'true') {
    const { DemoRepository } = await import('@/data/demoRepository');
    return new DemoRepository();
  }
  if (!env.hasSupabase) {
    return new AppError(
      'config',
      'This site is not connected to a database yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.',
    );
  }
  try {
    return new SupabaseRepository();
  } catch (e) {
    return e instanceof AppError ? e : new AppError('config', 'Could not initialise the database client.');
  }
}
