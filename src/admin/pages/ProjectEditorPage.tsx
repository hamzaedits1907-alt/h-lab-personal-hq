import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import { slugify } from '@/content/localize';
import type { LocalizedText, Project } from '@/content/schema';
import { FieldErrorsProvider, useConfirm, useDraft, useSaver, useUnsavedGuard } from '../feedback';
import { ImageField } from '../media';
import { EmptyState, LangTabs, LocalizedField, Notice, PageHeader, Panel, SaveBar, SelectField, TagInput, TextField, Toggle, useEditLang } from '../ui';
import { STATUS_OPTIONS } from './ProjectsPage';

interface Form {
  title: string;
  slug: string;
  status: Project['status'];
  summary: LocalizedText;
  description: LocalizedText;
  tags: string[];
  url: string;
  coverMediaId: string | null;
  coverAlt: LocalizedText;
  isVisible: boolean;
}

const BLANK: Form = {
  title: '',
  slug: '',
  status: 'active',
  summary: {},
  description: {},
  tags: [],
  url: '',
  coverMediaId: null,
  coverAlt: {},
  isVisible: false,
};

export function ProjectEditorPage() {
  const { id } = useParams();
  const data = useSiteData();
  if (!data) return null;
  if (!id) return <ProjectForm key="new" project={null} />;
  const project = data.projects.find((p) => p.id === id);
  if (!project) {
    return (
      <EmptyState title="Project not found">
        It may have been deleted. <Link to="/admin/projects">Back to projects</Link>
      </EmptyState>
    );
  }
  return <ProjectForm key={project.id} project={project} />;
}

function ProjectForm({ project }: { project: Project | null }) {
  const repo = useRepository();
  const { reload } = useSite();
  const data = useSiteData()!;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const edit = useEditLang();
  const saver = useSaver();

  const formFrom = (p: Project | null): Form =>
    p
      ? {
          title: p.title,
          slug: p.slug,
          status: p.status,
          summary: p.summary,
          description: p.description,
          tags: p.tags,
          url: p.url ?? '',
          coverMediaId: p.coverMediaId,
          coverAlt: (p.coverMediaId && data.media[p.coverMediaId]?.alt) || {},
          isVisible: p.isVisible,
        }
      : BLANK;

  const draft = useDraft<Form>(formFrom(project));
  const guard = useUnsavedGuard(draft.dirty);
  const f = draft.value;
  const slugTouched = useRef(Boolean(project));
  const [navTo, setNavTo] = useState<string | null>(null);

  // Navigate only once the draft is clean, otherwise the unsaved-changes guard would fire.
  useEffect(() => {
    if (navTo && !draft.dirty) {
      navigate(navTo, { replace: true });
      void reload();
    }
  }, [navTo, draft.dirty, navigate, reload]);

  const setCover = (mediaId: string | null) =>
    draft.update({ coverMediaId: mediaId, coverAlt: (mediaId && data.media[mediaId]?.alt) || {} });

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    void saver.run(async () => {
      const input = {
        title: f.title,
        slug: f.slug,
        status: f.status,
        summary: f.summary,
        description: f.description,
        tags: f.tags,
        url: f.url.trim() === '' ? null : f.url.trim(),
        coverMediaId: f.coverMediaId,
        isVisible: f.isVisible,
      };
      const saved = project ? await repo.updateProject(project.id, input) : await repo.createProject(input);
      if (f.coverMediaId) {
        const current = data.media[f.coverMediaId]?.alt ?? {};
        if (JSON.stringify(current) !== JSON.stringify(f.coverAlt)) await repo.updateMediaAlt(f.coverMediaId, f.coverAlt);
      }
      await reload();
      draft.commit({ ...f, slug: saved.slug, title: saved.title, tags: saved.tags, url: saved.url ?? '' });
      if (!project) setNavTo(`/admin/projects/${saved.id}`);
    }, project ? 'Project saved' : 'Project created');
  };

  const remove = async () => {
    if (!project) return;
    const yes = await confirm({
      title: `Delete “${project.title}”?`,
      message: 'The project will be removed from the site permanently. This cannot be undone.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (!yes) return;
    const ok = await saver.run(() => repo.deleteProject(project.id), 'Project deleted');
    if (ok) {
      draft.discard();
      setNavTo('/admin/projects');
    }
  };

  const duplicate = async () => {
    if (!project) return;
    let createdId = '';
    const ok = await saver.run(async () => {
      const copy = await repo.createProject({
        title: `${project.title} (copy)`.slice(0, 80),
        slug: `${project.slug}-copy-${Math.random().toString(36).slice(2, 5)}`.slice(0, 64),
        status: project.status,
        summary: project.summary,
        description: project.description,
        tags: project.tags,
        url: project.url,
        coverMediaId: project.coverMediaId,
        isVisible: false,
      });
      createdId = copy.id;
      await reload();
    }, 'Duplicated (hidden until you publish it)');
    if (ok) navigate(`/admin/projects/${createdId}`);
  };

  return (
    <form onSubmit={save} noValidate>
      {guard}
      <PageHeader
        title={project ? 'Edit project' : 'New project'}
        subtitle={project ? project.slug : 'New projects start hidden. Turn on “Show on the site” when ready.'}
        actions={
          <>
            <Link className="a-btn a-btn--small" to="/admin/projects">
              ← All projects
            </Link>
            {project && (
              <a className="a-btn a-btn--small" href={`/?preview=1&project=${encodeURIComponent(project.slug)}`} target="_blank" rel="noopener">
                Preview
              </a>
            )}
          </>
        }
      />
      <FieldErrorsProvider value={saver.fields}>
        {saver.error && saver.error.code === 'validation' && <Notice kind="error">{saver.error.message}</Notice>}
        <LangTabs languages={edit.languages} lang={edit.lang} onChange={edit.setLang} />

        <Panel title="Basics">
          <TextField
            label="Title"
            name="title"
            required
            value={f.title}
            onChange={(v) => draft.update({ title: v, ...(slugTouched.current ? {} : { slug: slugify(v) }) })}
          />
          <TextField
            label="Address (slug)"
            name="slug"
            required
            value={f.slug}
            hint="Used in links like /?project=this-address. Changing it breaks old links."
            onChange={(v) => {
              slugTouched.current = true;
              draft.update({ slug: v });
            }}
          />
          <SelectField label="Status" name="status" value={f.status} options={STATUS_OPTIONS} onChange={(status) => draft.update({ status })} />
          <Toggle
            label="Show on the site"
            checked={f.isVisible}
            onChange={(isVisible) => draft.update({ isVisible })}
            hint="Hidden projects are visible only to you, in preview."
          />
        </Panel>

        <Panel title="Description">
          <LocalizedField
            label="Short summary"
            name="summary"
            value={f.summary}
            onChange={(summary) => draft.update({ summary })}
            lang={edit.lang}
            defaultLanguage={edit.defaultLanguage}
            hint="Shown on the card. Up to 200 characters."
          />
          <LocalizedField
            label="Details"
            name="description"
            multiline
            rows={6}
            value={f.description}
            onChange={(description) => draft.update({ description })}
            lang={edit.lang}
            defaultLanguage={edit.defaultLanguage}
            hint="Shown in the project window. Plain text; leave a blank line between paragraphs. Do not include private notes or secrets."
          />
          <TagInput label="Tags" name="tags" value={f.tags} onChange={(tags) => draft.update({ tags })} />
        </Panel>

        <Panel title="Link and image">
          <TextField
            label="External link (optional)"
            name="url"
            type="url"
            value={f.url}
            placeholder="https://"
            hint="Must start with https://"
            onChange={(url) => draft.update({ url })}
          />
          <ImageField label="Cover image" value={f.coverMediaId} onChange={setCover} hint="Without a cover, a generated geometric image is shown." />
          {f.coverMediaId && (
            <LocalizedField
              label="Cover image alt text"
              name="coverAlt"
              value={f.coverAlt}
              onChange={(coverAlt) => draft.update({ coverAlt })}
              lang={edit.lang}
              defaultLanguage={edit.defaultLanguage}
              hint="Describe the image for people using screen readers. It belongs to the image, so it applies everywhere the image is used."
            />
          )}
        </Panel>
      </FieldErrorsProvider>

      <SaveBar
        dirty={draft.dirty}
        saving={saver.saving}
        error={saver.error?.message}
        onDiscard={() => {
          draft.discard();
          saver.clearError();
        }}
        saveLabel={project ? 'Save project' : 'Create project'}
        extra={
          project && (
            <>
              <button type="button" className="a-btn" onClick={() => void duplicate()} disabled={saver.saving}>
                Duplicate
              </button>
              <button type="button" className="a-btn a-btn--danger-quiet" onClick={() => void remove()} disabled={saver.saving}>
                Delete
              </button>
            </>
          )
        }
      />
    </form>
  );
}
