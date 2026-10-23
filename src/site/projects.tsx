import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/app/LanguageContext';
import { paragraphs, statusLabel, uiLabel } from '@/content/localize';
import { PROJECT_STATUSES, isHttpsUrl, type Project, type ProjectStatus } from '@/content/schema';
import { useVisibleContent } from './content';
import { ArrowIcon, CloseIcon, ExternalIcon, MediaImage, PlaceholderArt, Reveal } from './ui';

function StatusPill({ status }: { status: ProjectStatus }) {
  const { lang } = useLanguage();
  const { settings } = useVisibleContent();
  return (
    <span className="pill" data-status={status}>
      <span className="status-dot" aria-hidden="true" />
      {statusLabel(settings, status, lang)}
    </span>
  );
}

/** Keeps `?preview=1` (and other params) when opening/closing a project. */
function withProject(params: URLSearchParams, slug: string | null): string {
  const next = new URLSearchParams(params);
  if (slug) next.set('project', slug);
  else next.delete('project');
  const s = next.toString();
  return s ? `?${s}` : '?';
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const { t, lang } = useLanguage();
  const { settings } = useVisibleContent();
  const [params] = useSearchParams();
  const ref = useRef<HTMLAnchorElement>(null);

  // Spotlight that follows the pointer (CSS variables only; no re-render).
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <Reveal as="li" className="card-cell" delay={Math.min(index, 6) * 60}>
      <Link
        ref={ref}
        to={withProject(params, project.slug)}
        preventScrollReset
        className="card"
        data-status={project.status}
        data-hidden={project.isVisible ? undefined : 'true'}
        onPointerMove={onMove}
      >
        <span className="card__cover">
          <MediaImage
            mediaId={project.coverMediaId}
            className="card__img"
            sizes="(min-width: 960px) 360px, (min-width: 600px) 45vw, 92vw"
            fallback={<PlaceholderArt seed={project.slug} />}
          />
        </span>
        <span className="card__body">
          <span className="card__meta">
            <StatusPill status={project.status} />
            {!project.isVisible && <span className="pill pill--warn">Hidden</span>}
          </span>
          <span className="card__title">{project.title}</span>
          <span className="card__summary">{t(project.summary)}</span>
          {project.tags.length > 0 && (
            <span className="card__tags">
              {project.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </span>
          )}
          <span className="card__cta" aria-hidden="true">
            {uiLabel(settings, 'viewProject', lang)} <ArrowIcon />
          </span>
        </span>
      </Link>
    </Reveal>
  );
}

export function ProjectGrid({ showFilters }: { showFilters: boolean }) {
  const { projects, settings } = useVisibleContent();
  const { lang } = useLanguage();
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');

  const present = useMemo(() => PROJECT_STATUSES.filter((s) => projects.some((p) => p.status === s)), [projects]);
  const shown = filter === 'all' ? projects : projects.filter((p) => p.status === filter);
  // If the active filter's projects disappear (e.g. after an edit), fall back to "all".
  const effective = filter !== 'all' && !present.includes(filter) ? projects : shown;

  if (projects.length === 0) {
    return <p className="empty">{uiLabel(settings, 'noProjects', lang)}</p>;
  }

  return (
    <>
      {showFilters && present.length > 1 && (
        <div className="filters" role="group" aria-label={uiLabel(settings, 'allProjects', lang)}>
          {(['all', ...present] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="filter"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              data-status={s === 'all' ? undefined : s}
            >
              {s !== 'all' && <span className="status-dot" aria-hidden="true" />}
              {s === 'all' ? uiLabel(settings, 'allProjects', lang) : statusLabel(settings, s, lang)}
            </button>
          ))}
        </div>
      )}
      <ul className="grid" aria-live="polite">
        {effective.map((p, i) => (
          <ProjectCard key={p.id} project={p} index={i} />
        ))}
      </ul>
    </>
  );
}

/* ------------------------------- detail ------------------------------ */

export function ProjectDialog() {
  const { projects, settings } = useVisibleContent();
  const { t, lang } = useLanguage();
  const [params, setParams] = useSearchParams();
  const slug = params.get('project');
  const project = slug ? projects.find((p) => p.slug === slug) : undefined;
  const ref = useRef<HTMLDialogElement>(null);

  const close = () => setParams(new URLSearchParams(withProject(params, null)), { preventScrollReset: true, replace: false });

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg || !project) return;
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    }
    document.documentElement.classList.add('has-modal');
    return () => {
      document.documentElement.classList.remove('has-modal');
      if (dlg.open && typeof dlg.close === 'function') dlg.close();
    };
  }, [project]);

  if (!project) return null;

  const hasUrl = project.url && isHttpsUrl(project.url);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="project-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close(); // backdrop click
      }}
    >
      <div className="modal__panel" data-status={project.status}>
        <button type="button" className="modal__close" onClick={close} aria-label={uiLabel(settings, 'close', lang)}>
          <CloseIcon />
        </button>
        <div className="modal__cover">
          <MediaImage mediaId={project.coverMediaId} eager sizes="(min-width: 760px) 720px, 100vw" fallback={<PlaceholderArt seed={project.slug} />} />
        </div>
        <div className="modal__body">
          <StatusPill status={project.status} />
          <h2 id="project-dialog-title" className="modal__title">
            {project.title}
          </h2>
          {t(project.summary) && <p className="modal__summary">{t(project.summary)}</p>}
          <div className="prose">
            {paragraphs(t(project.description)).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {project.tags.length > 0 && (
            <ul className="card__tags">
              {project.tags.map((tag) => (
                <li key={tag} className="tag">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          <div className="modal__actions">
            {hasUrl && (
              <a className="btn btn--primary" href={project.url ?? undefined} target="_blank" rel="noopener noreferrer">
                {uiLabel(settings, 'visitProject', lang)} <ExternalIcon />
              </a>
            )}
            <button type="button" className="btn" onClick={close}>
              {uiLabel(settings, 'close', lang)}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
