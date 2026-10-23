import { Link, useNavigate } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import { slugify, uniqueSlug } from '@/content/localize';
import { PROJECT_STATUSES, type Project, type ProjectInput, type ProjectStatus } from '@/content/schema';
import { useConfirm, useSaver } from '../feedback';
import { ImageRef } from '../media';
import { EmptyState, MoveButtons, PageHeader, SelectField, Toggle, moveItem } from '../ui';

export const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }));

export function toInput(p: Project): ProjectInput {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    description: p.description,
    status: p.status,
    tags: p.tags,
    url: p.url,
    repoUrl: p.repoUrl,
    coverMediaId: p.coverMediaId,
    isVisible: p.isVisible,
  };
}

export function ProjectsPage() {
  const repo = useRepository();
  const { reload } = useSite();
  const data = useSiteData();
  const saver = useSaver();
  const confirm = useConfirm();
  const navigate = useNavigate();
  if (!data) return null;
  const projects = data.projects;

  const act = (fn: () => Promise<unknown>, message: string) =>
    saver.run(async () => {
      await fn();
      await reload();
    }, message);

  const move = (from: number, to: number) => {
    const ids = moveItem(projects.map((p) => p.id), from, to);
    void act(() => repo.reorderProjects(ids), 'Order saved');
  };

  const duplicate = async (p: Project) => {
    let createdId = '';
    const ok = await act(async () => {
      const copy = await repo.createProject({
        ...toInput(p),
        title: `${p.title} (copy)`.slice(0, 80),
        slug: uniqueSlug(slugify(`${p.slug}-copy`), projects.map((x) => x.slug)),
        isVisible: false,
      });
      createdId = copy.id;
    }, 'Project duplicated (hidden until you publish it)');
    if (ok && createdId) navigate(`/admin/projects/${createdId}`);
  };

  const remove = async (p: Project) => {
    const yes = await confirm({
      title: `Delete “${p.title}”?`,
      message: 'The project will be removed from the site permanently. This cannot be undone. Its cover image stays in the media library.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (yes) void act(() => repo.deleteProject(p.id), 'Project deleted');
  };

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Order here is the order on the site. Hidden projects are only visible in preview."
        actions={
          <Link className="a-btn a-btn--primary" to="/admin/projects/new">
            New project
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState title="No projects yet">
          <Link className="a-btn a-btn--primary" to="/admin/projects/new">
            Create your first project
          </Link>
        </EmptyState>
      ) : (
        <ul className="a-list" aria-busy={saver.saving}>
          {projects.map((p, i) => (
            <li key={p.id} className={`a-row ${p.isVisible ? '' : 'is-hidden'}`}>
              <ImageRef id={p.coverMediaId} empty="" />
              <div className="a-row__main">
                <Link to={`/admin/projects/${p.id}`} className="a-row__title">
                  {p.title}
                </Link>
                <span className="a-hint">
                  {p.slug}
                  {!p.isVisible && ' · hidden'}
                </span>
              </div>
              <div className="a-row__status">
                <SelectField
                  label={`Status of ${p.title}`}
                  value={p.status}
                  options={STATUS_OPTIONS}
                  onChange={(s: ProjectStatus) => void act(() => repo.updateProject(p.id, { status: s }), 'Status updated')}
                />
              </div>
              <Toggle
                label={`Show ${p.title} on the site`}
                checked={p.isVisible}
                disabled={saver.saving}
                onChange={(v) => void act(() => repo.updateProject(p.id, { isVisible: v }), v ? 'Project is now visible' : 'Project hidden')}
              />
              <div className="a-row__actions">
                <MoveButtons index={i} count={projects.length} onMove={move} disabled={saver.saving} label={p.title} />
                <Link className="a-btn a-btn--small" to={`/admin/projects/${p.id}`}>
                  Edit
                </Link>
                <button type="button" className="a-btn a-btn--small" disabled={saver.saving} onClick={() => void duplicate(p)}>
                  Duplicate
                </button>
                <button type="button" className="a-btn a-btn--small a-btn--danger-quiet" disabled={saver.saving} onClick={() => void remove(p)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
