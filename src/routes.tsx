import { lazy, Suspense } from 'react';
import { Link, Navigate, type RouteObject } from 'react-router-dom';
import { LoadingState, NotFound, SitePage } from '@/site/SitePage';

// The admin app is a separate chunk: visitors never download it.
const AdminApp = lazy(() => import('@/admin/AdminApp'));

export const appRoutes: RouteObject[] = [
  { path: '/', element: <SitePage /> },
  {
    path: '/admin/*',
    element: (
      <Suspense fallback={<LoadingState />}>
        <AdminApp />
      </Suspense>
    ),
  },
  // Old-style deep links /projects/<slug> -> /?project=<slug>
  { path: '/projects/:slug', element: <LegacyProjectRedirect /> },
  { path: '*', element: <NotFound /> },
];

function LegacyProjectRedirect() {
  const slug = window.location.pathname.split('/').filter(Boolean)[1] ?? '';
  return slug ? <Navigate to={`/?project=${encodeURIComponent(slug)}`} replace /> : <Link to="/">Home</Link>;
}
