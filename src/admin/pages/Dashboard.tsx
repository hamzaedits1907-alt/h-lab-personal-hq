import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { useSiteData } from '@/app/SiteContext';
import type { ChangeEntry } from '@/content/schema';
import { errorMessage } from '@/data/errors';
import { EmptyState, Notice, PageHeader, Panel } from '../ui';

const TABLE_LABEL: Record<string, string> = {
  projects: 'Project',
  content_blocks: 'Section',
  media: 'Image',
  site_settings: 'Settings',
};

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Dashboard() {
  const repo = useRepository();
  const data = useSiteData();
  const [changes, setChanges] = useState<ChangeEntry[] | null>(null);
  const [changesError, setChangesError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    repo
      .listChanges(8)
      .then((c) => alive && setChanges(c))
      .catch((e) => alive && setChangesError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [repo, data]);

  if (!data?.settings) return null;
  const s = data.settings;
  const media = Object.values(data.media);
  const missingAlt = media.filter((m) => !m.alt.en?.trim() && !m.alt.tr?.trim()).length;
  const visibleProjects = data.projects.filter((p) => p.isVisible).length;
  const visibleBlocks = data.blocks.filter((b) => b.isVisible).length;

  const checks: { ok: boolean; label: string; to: string }[] = [
    {
      ok: repo.kind === 'supabase',
      label: repo.kind === 'supabase' ? 'Connected to the database' : 'Demo mode: not connected to a real database',
      to: '/admin/settings',
    },
    { ok: s.isPublished, label: s.isPublished ? 'Site is published' : 'Site is in draft: visitors see "coming soon"', to: '/admin/settings' },
    { ok: Boolean(s.contactEmail), label: s.contactEmail ? 'Contact email set' : 'Add a contact email', to: '/admin/settings' },
    { ok: s.socialLinks.length > 0, label: s.socialLinks.length ? 'Social links added' : 'Add your GitHub or other links', to: '/admin/settings' },
    { ok: Boolean((s.seo.description.en ?? '').trim()), label: 'Search and share description', to: '/admin/settings' },
    { ok: Boolean(s.ogMediaId), label: s.ogMediaId ? 'Share image set' : 'Optional: add a share image', to: '/admin/settings' },
    {
      ok: missingAlt === 0,
      label: missingAlt ? `${missingAlt} image${missingAlt > 1 ? 's' : ''} without alt text` : 'All images have alt text',
      to: '/admin/media',
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your site at a glance. Everything shown here is real data from the database." />

      {data.invalidBlocks.length > 0 && (
        <Notice kind="warn">
          {data.invalidBlocks.length} section{data.invalidBlocks.length > 1 ? 's have' : ' has'} content that no longer matches its type and is not shown
          publicly. <Link to="/admin/sections">Review sections</Link>
        </Notice>
      )}

      <div className="a-stats">
        <Link className="a-stat" to="/admin/projects">
          <span className="a-stat__n">{visibleProjects}</span>
          <span className="a-stat__l">published projects</span>
          <span className="a-stat__s">{data.projects.length} total</span>
        </Link>
        <Link className="a-stat" to="/admin/sections">
          <span className="a-stat__n">{visibleBlocks}</span>
          <span className="a-stat__l">visible sections</span>
          <span className="a-stat__s">{data.blocks.length} total</span>
        </Link>
        <Link className="a-stat" to="/admin/media">
          <span className="a-stat__n">{media.length}</span>
          <span className="a-stat__l">images</span>
          <span className="a-stat__s">in the media library</span>
        </Link>
        <Link className="a-stat" to="/admin/settings">
          <span className="a-stat__n">{s.languages.map((l) => l.toUpperCase()).join(' + ')}</span>
          <span className="a-stat__l">{s.languages.length > 1 ? 'languages published' : 'language published'}</span>
          <span className="a-stat__s">default {s.defaultLanguage.toUpperCase()}</span>
        </Link>
      </div>

      <div className="a-cols">
        <Panel title="Quick actions">
          <div className="a-actions">
            <Link className="a-btn a-btn--primary" to="/admin/projects/new">
              New project
            </Link>
            <Link className="a-btn" to="/admin/sections">
              Add a section
            </Link>
            <Link className="a-btn" to="/admin/media">
              Upload an image
            </Link>
            <Link className="a-btn" to="/admin/text">
              Edit site text
            </Link>
            <a className="a-btn" href="/?preview=1" target="_blank" rel="noopener">
              Preview site
            </a>
          </div>
        </Panel>

        <Panel title="Setup status" hint="Based on your current settings.">
          <ul className="a-checks">
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? 'is-ok' : 'is-todo'}>
                <span className="a-checks__icon" aria-hidden="true">
                  {c.ok ? '✓' : '!'}
                </span>
                <Link to={c.to}>{c.label}</Link>
                <span className="visually-hidden">{c.ok ? ' (done)' : ' (needs attention)'}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent changes">
        {changesError ? (
          <Notice kind="warn">Could not load recent changes: {changesError}</Notice>
        ) : changes === null ? (
          <p className="a-hint">Loading…</p>
        ) : changes.length === 0 ? (
          <EmptyState title="No changes recorded yet">Edits you make will be listed here.</EmptyState>
        ) : (
          <ul className="a-changes">
            {changes.map((c) => (
              <li key={c.id}>
                <span className="a-changes__kind mono">{c.action}</span>
                <span>
                  {TABLE_LABEL[c.table] ?? c.table}: <strong>{c.summary}</strong>
                </span>
                <time dateTime={c.at} className="a-hint">
                  {ago(c.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
