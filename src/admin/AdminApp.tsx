import { Suspense, lazy, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useRepository } from '@/app/RepositoryContext';
import { useSite } from '@/app/SiteContext';
import { env } from '@/app/env';
import { errorMessage } from '@/data/errors';
import { BrandMark } from '@/site/ui';
import { ErrorState, LoadingState } from '@/site/SitePage';
import { ConfirmProvider, ToastProvider } from './feedback';
import { Notice } from './ui';
import { AppearancePage } from './pages/AppearancePage';
import { BlockEditorPage } from './pages/BlockEditorPage';
import { Dashboard } from './pages/Dashboard';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { ProjectEditorPage } from './pages/ProjectEditorPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { SectionsPage } from './pages/SectionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SiteTextPage } from './pages/SiteTextPage';
import '@/styles/admin.css';

// Only exists in demo builds; in production `env.demo` is false and the import is removed.
const DemoHint =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_DEMO_MODE === 'true' ? lazy(() => import('./DemoHint')) : () => null;

export default function AdminApp() {
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    const previous = document.title;
    document.title = 'Admin · H/LAB';
    return () => {
      robots.remove();
      document.title = previous;
    };
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="admin">
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route element={<RequireAdmin />}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/new" element={<ProjectEditorPage />} />
              <Route path="projects/:id" element={<ProjectEditorPage />} />
              <Route path="sections" element={<SectionsPage />} />
              <Route path="sections/:id" element={<BlockEditorPage />} />
              <Route path="media" element={<MediaLibraryPage />} />
              <Route path="appearance" element={<AppearancePage />} />
              <Route path="text" element={<SiteTextPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

/* ------------------------------- login -------------------------------- */

function LoginPage() {
  const repo = useRepository();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === 'signed-in' && auth.isAdmin) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await repo.signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="a-login" id="content">
      <form className="a-login__card" onSubmit={submit} noValidate>
        <div className="a-login__brand">
          <BrandMark size={34} />
          <div>
            <h1 className="a-login__title">Admin sign in</h1>
            <p className="a-subtitle">Private area. Authorized owner only.</p>
          </div>
        </div>

        {auth.status === 'signed-in' && !auth.isAdmin && (
          <Notice kind="error">
            This account ({auth.email}) is not authorized to manage the site.{' '}
            <button type="button" className="a-link" onClick={() => void repo.signOut()}>
              Sign out
            </button>
          </Notice>
        )}
        {env.demo && (
          <Suspense fallback={null}>
            <DemoHint />
          </Suspense>
        )}

        <div className="a-field">
          <label className="a-label" htmlFor="login-email">
            Email
          </label>
          <input id="login-email" className="a-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="a-field">
          <label className="a-label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            className="a-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>
        {error && (
          <p id="login-error" className="a-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="a-btn a-btn--primary a-btn--block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="a-hint">
          <Link to="/">← Back to the site</Link>
        </p>
      </form>
    </main>
  );
}

/* ------------------------------ guard + shell -------------------------- */

function RequireAdmin() {
  const auth = useAuth();
  const location = useLocation();
  const repo = useRepository();
  const { state, reload } = useSite();

  if (auth.status === 'loading') return <LoadingState />;
  if (auth.status === 'signed-out') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!auth.isAdmin) {
    return (
      <main className="a-login" id="content">
        <div className="a-login__card">
          <h1 className="a-login__title">Not authorized</h1>
          <Notice kind="error">
            The account <strong>{auth.email}</strong> is signed in but is not an administrator of this site, so it cannot change anything.
          </Notice>
          <button type="button" className="a-btn a-btn--block" onClick={() => void repo.signOut()}>
            Sign out
          </button>
          <p className="a-hint">
            <Link to="/">← Back to the site</Link>
          </p>
        </div>
      </main>
    );
  }
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') {
    return <ErrorState title="Could not load the admin data" message={state.error.message} onRetry={() => void reload()} />;
  }
  return <AdminLayout email={auth.email} />;
}

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/projects', label: 'Projects' },
  { to: '/admin/sections', label: 'Sections' },
  { to: '/admin/media', label: 'Media' },
  { to: '/admin/appearance', label: 'Appearance' },
  { to: '/admin/text', label: 'Site text' },
  { to: '/admin/settings', label: 'Settings' },
];

function AdminLayout({ email }: { email: string }) {
  const repo = useRepository();
  const { state } = useSite();
  const settings = state.status === 'ready' ? state.data.settings : null;

  return (
    <div className="a-shell">
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>
      <header className="a-top">
        <Link to="/admin" className="a-brand" aria-label="Admin home">
          <BrandMark size={24} />
          <span>{settings?.brandText ?? 'H/LAB'}</span>
          <span className="a-brand__tag mono">Admin</span>
        </Link>
        <div className="a-top__actions">
          <a className="a-btn a-btn--small" href="/?preview=1" target="_blank" rel="noopener">
            Preview
          </a>
          <a className="a-btn a-btn--small a-hide-sm" href="/" target="_blank" rel="noopener">
            View site
          </a>
          <button type="button" className="a-btn a-btn--small" onClick={() => void repo.signOut()} title={email}>
            Sign out
          </button>
        </div>
      </header>
      <nav className="a-nav" aria-label="Admin">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `a-nav__link ${isActive ? 'is-active' : ''}`}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main id="admin-main" className="a-main" tabIndex={-1}>
        {!settings && (
          <Notice kind="error">
            The database has no site settings row. Apply the migrations in <code>supabase/migrations</code> (see docs/DEPLOYMENT.md).
          </Notice>
        )}
        {settings && <Outlet />}
      </main>
    </div>
  );
}
