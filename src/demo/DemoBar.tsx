import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/data/demoCredentials';

/**
 * Demo-mode controls. This module is only ever loaded in demo builds (`vite --mode demo`):
 * in a production build the import in ./index.ts is removed at build time, so neither this
 * UI nor the demo credentials exist in `dist/`.
 */
export default function DemoBar({ variant }: { variant: 'site' | 'admin' }) {
  const repo = useRepository();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const openAdmin = async () => {
    setBusy(true);
    try {
      await repo.signIn(DEMO_EMAIL, DEMO_PASSWORD);
      navigate('/admin');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset the demo to its starter content? This only affects the demo data stored in this browser.')) return;
    if ('reset' in repo && typeof repo.reset === 'function') (repo as { reset: () => void }).reset();
    await repo.signOut();
    window.location.assign('/');
  };

  if (variant === 'admin') {
    return (
      <div className="demo-strip" role="note">
        <span>
          <strong>Demo admin.</strong> Real admin interface, local-only data (stays in this browser).
        </span>
        <span className="demo-strip__actions">
          <Link to="/">← Back to public site</Link>
          <button type="button" onClick={() => void reset()}>
            Reset demo
          </button>
        </span>
      </div>
    );
  }

  return (
    <aside className="demo-bar" aria-label="Demo mode">
      <span className="demo-bar__label">
        <strong>Demo mode</strong>
        <span> · data stays in this browser</span>
      </span>
      <button type="button" className="demo-bar__primary" onClick={() => void openAdmin()} disabled={busy}>
        {busy ? 'Opening…' : 'Open demo admin'}
      </button>
      <button type="button" className="demo-bar__quiet" onClick={() => void reset()}>
        Reset demo
      </button>
    </aside>
  );
}
