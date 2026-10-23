import type { ReactNode } from 'react';
import { RouterProvider, createBrowserRouter, type DataRouter } from 'react-router-dom';
import { AuthProvider } from '@/app/AuthContext';
import { LanguageProvider } from '@/app/LanguageContext';
import { RepositoryProvider } from '@/app/RepositoryContext';
import { SiteProvider } from '@/app/SiteContext';
import { ThemeApplier } from '@/app/ThemeApplier';
import { env } from '@/app/env';
import type { Repository } from '@/data/repository';
import { appRoutes } from './routes';

export function AppProviders({ repository, children }: { repository: Repository; children: ReactNode }) {
  return (
    <RepositoryProvider repository={repository}>
      <AuthProvider>
        <SiteProvider>
          <LanguageProvider>
            <ThemeApplier />
            {children}
            {env.demo && (
              <div className="demo-badge" role="note">
                Demo mode: data is stored in this browser only
              </div>
            )}
          </LanguageProvider>
        </SiteProvider>
      </AuthProvider>
    </RepositoryProvider>
  );
}

export function App({ repository, router }: { repository: Repository; router?: DataRouter }) {
  const r = router ?? createBrowserRouter(appRoutes);
  return (
    <AppProviders repository={repository}>
      <RouterProvider router={r} />
    </AppProviders>
  );
}
