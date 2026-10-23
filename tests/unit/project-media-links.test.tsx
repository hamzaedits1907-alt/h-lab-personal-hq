import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seedSettings } from '@/content/seed';
import { toAppError } from '@/data/supabaseRepository';
import { rowToProject } from '@/data/mappers';
import { ids, makeRepo, renderAt, tinyPng, user } from './helpers';

const LIVE = 'https://example.com/genius';
const REPO = 'https://github.com/example/genius';

/** Signed-out repo with Project Genius customised by `patch`. */
async function withGenius(patch: Record<string, unknown>, coverAlt?: string) {
  const { repo, storage } = await makeRepo({ signedIn: true });
  let coverMediaId: string | null = null;
  if (coverAlt !== undefined) coverMediaId = (await repo.uploadMedia(tinyPng(), { en: coverAlt })).id;
  await repo.updateProject(ids.genius, { ...patch, ...(coverMediaId ? { coverMediaId } : {}) });
  await repo.signOut();
  return { repo, storage, coverMediaId };
}

describe('About section (English and Turkish)', () => {
  it('shows the personal English copy, concise, with the new interests', async () => {
    const { repo } = await makeRepo();
    renderAt('/', repo);
    const about = (await screen.findByRole('heading', { name: 'About', level: 2 })).closest('section')!;
    expect(within(about).getByText(/curious builder who likes turning ambitious ideas into real software/)).toBeInTheDocument();
    expect(within(about).getByText(/H\/LAB is where I bring those experiments together\./)).toBeInTheDocument();
    for (const chip of ['AI assistants', 'Desktop apps', 'Browsers', 'Creative tools', 'Simulation worlds']) {
      expect(within(about).getByText(chip)).toBeInTheDocument();
    }
    expect(about.querySelectorAll('.prose p')).toHaveLength(2);
    expect((about.textContent ?? '').length).toBeLessThan(700);
  });

  it('shows the Turkish copy when Turkish is published and selected', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.saveSettings({ ...seedSettings, languages: ['en', 'tr'] });
    await repo.signOut();
    window.localStorage.setItem('hlab-lang', 'tr');
    renderAt('/', repo);
    const about = (await screen.findByRole('heading', { name: 'Hakkında', level: 2 })).closest('section')!;
    expect(within(about).getByText(/Yeni fikirleri çalışan ürünlere dönüştürmeyi seven meraklı bir geliştiriciyim/)).toBeInTheDocument();
    expect(within(about).getByText('Yapay zekâ asistanları')).toBeInTheDocument();
    expect(within(about).queryByText(/curious builder/)).not.toBeInTheDocument();
  });

  it('keeps the two languages independent when one is edited', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const about = (await repo.loadSite()).blocks.find((b) => b.type === 'about')!;
    if (about.type !== 'about') throw new Error('expected about');
    const tr = about.content.body.tr;
    await repo.updateBlock(about.id, 'about', { content: { ...about.content, body: { ...about.content.body, en: 'Edited English only.' } } });
    const after = (await repo.loadSite()).blocks.find((b) => b.id === about.id)!;
    expect(after.type === 'about' && after.content.body).toEqual({ en: 'Edited English only.', tr });
  });
});

describe('project cards: with and without a cover image', () => {
  it('shows the generated art when there is no cover', async () => {
    const { repo } = await makeRepo();
    renderAt('/', repo);
    const card = (await screen.findByRole('link', { name: /Project Genius/ }));
    expect(card.querySelector('.placeholder-art')).not.toBeNull();
    expect(card.querySelector('img')).toBeNull();
  });

  it('shows the cover image with its alt text and lazy loading', async () => {
    const { repo } = await withGenius({}, 'Genius workspace screenshot');
    renderAt('/', repo);
    const img = await screen.findByAltText('Genius workspace screenshot');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.closest('.card')).toHaveAttribute('data-status', 'active');
    expect(img.closest('.card')!.querySelector('.placeholder-art')).toBeNull();
  });

  it('falls back to the generated art if the image fails to load', async () => {
    const { repo } = await withGenius({}, 'Broken one');
    renderAt('/', repo);
    const img = await screen.findByAltText('Broken one');
    const card = img.closest('.card')!;
    fireEvent.error(img);
    await waitFor(() => expect(card.querySelector('.placeholder-art')).not.toBeNull());
    expect(card.querySelector('img')).toBeNull();
  });

  it('survives a cover that points at a media row that no longer exists', async () => {
    const { repo, storage } = await withGenius({}, 'Soon gone');
    const data = JSON.parse(storage.getItem('hlab-demo-data-v1')!);
    data.media = [];
    storage.setItem('hlab-demo-data-v1', JSON.stringify(data));
    renderAt('/', repo);
    const card = await screen.findByRole('link', { name: /Project Genius/ });
    expect(card.querySelector('.placeholder-art')).not.toBeNull();
  });

  it('cards are keyboard focusable links that open the dialog with Enter', async () => {
    const { repo } = await makeRepo();
    const u = user();
    renderAt('/', repo);
    const card = await screen.findByRole('link', { name: /JARVIS/ });
    card.focus();
    expect(card).toHaveFocus();
    await u.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'JARVIS' })).toBeInTheDocument();
  });
});

describe('project dialog', () => {
  it('shows title, summary, status, tags, cover and both link actions when both exist', async () => {
    const { repo } = await withGenius({ url: LIVE, repoUrl: REPO }, 'Cover alt');
    renderAt('/?project=project-genius', repo);
    const dialog = await screen.findByRole('dialog', { name: 'Project Genius' });
    expect(within(dialog).getByText('A personal AI workspace.')).toBeInTheDocument();
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    expect(within(dialog).getByText('Workspace')).toBeInTheDocument();
    expect(within(dialog).getByAltText('Cover alt')).toBeInTheDocument();
    const open = within(dialog).getByRole('link', { name: /Open project/ });
    const source = within(dialog).getByRole('link', { name: /Source code/ });
    expect(open).toHaveAttribute('href', LIVE);
    expect(source).toHaveAttribute('href', REPO);
    for (const a of [open, source]) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.getAttribute('rel')).toContain('noreferrer');
      expect(a).toHaveTextContent('opens in a new tab');
    }
  });

  it('shows only the buttons whose links exist', async () => {
    const live = await withGenius({ url: LIVE });
    const first = renderAt('/?project=project-genius', live.repo);
    await screen.findByRole('dialog');
    expect(screen.getByRole('link', { name: /Open project/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Source code/ })).not.toBeInTheDocument();
    first.unmount();

    const src = await withGenius({ repoUrl: REPO });
    renderAt('/?project=project-genius', src.repo);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link', { name: /Open project/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Source code/ })).toHaveAttribute('href', REPO);
  });

  it('is still complete and polished with no cover and no links (and has no dead links)', async () => {
    const { repo } = await makeRepo();
    renderAt('/?project=project-frame', repo);
    const dialog = await screen.findByRole('dialog', { name: 'Project-Frame' });
    expect(within(dialog).getByText('Paused')).toBeInTheDocument();
    expect(within(dialog).getByText('An AI-assisted video editor.')).toBeInTheDocument();
    expect(within(dialog).getByText('Video')).toBeInTheDocument();
    expect(dialog.querySelector('.placeholder-art')).not.toBeNull();
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
    expect(dialog.querySelector('a[href="#"], a:not([href])')).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });

  it('never renders unsafe links from corrupted data (javascript:, http:, data:)', async () => {
    const { repo, storage } = await withGenius({});
    const data = JSON.parse(storage.getItem('hlab-demo-data-v1')!);
    data.projects[0].url = 'javascript:alert(1)';
    data.projects[0].repoUrl = 'http://insecure.example/repo';
    storage.setItem('hlab-demo-data-v1', JSON.stringify(data));
    renderAt('/?project=project-genius', repo);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
    data.projects[0].repoUrl = 'data:text/html,<script>1</script>';
    storage.setItem('hlab-demo-data-v1', JSON.stringify(data));
  });

  it('link clicks work independently: they do not close the dialog or change the route', async () => {
    const { repo } = await withGenius({ url: LIVE, repoUrl: REPO });
    const { router } = renderAt('/?project=project-genius', repo);
    const dialog = await screen.findByRole('dialog');
    const before = router.state.location.search;
    for (const name of [/Open project/, /Source code/]) {
      const link = within(dialog).getByRole('link', { name });
      link.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
      fireEvent.click(link);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(router.state.location.search).toBe(before);
    }
  });

  it('uses Turkish labels for the actions when Turkish is selected', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.saveSettings({ ...seedSettings, languages: ['en', 'tr'] });
    await repo.updateProject(ids.genius, { url: LIVE, repoUrl: REPO });
    await repo.signOut();
    window.localStorage.setItem('hlab-lang', 'tr');
    renderAt('/?project=project-genius', repo);
    expect(await screen.findByRole('link', { name: /Projeyi aç/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kaynak kodu/ })).toBeInTheDocument();
  });
});

describe('admin project editor: images and links', () => {
  it('picks an uploaded image, previews it BEFORE saving, sets alt text, saves and restores it', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const media = await repo.uploadMedia(tinyPng(), { en: 'Old alt' });
    const u = user();
    const first = renderAt(`/admin/projects/${ids.genius}`, repo);
    expect(document.querySelector('.a-imagefield img')).toBeNull(); // no cover yet
    await u.click(await screen.findByRole('button', { name: 'Choose image' }));
    const picker = await screen.findByRole('dialog', { name: 'Cover image' });
    await u.click(within(picker).getByRole('button', { name: /Select image Old alt/ }));
    // preview is visible while the project is still unsaved
    const preview = document.querySelector<HTMLImageElement>('.a-imagefield img')!;
    expect(preview.getAttribute('src')).toMatch(/^data:image\/png/);
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)?.coverMediaId).toBeNull();
    const alt = await screen.findByLabelText('Cover image alt text');
    await u.clear(alt);
    await u.type(alt, 'Fresh description');
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    first.unmount();

    // restored on a fresh load
    renderAt(`/admin/projects/${ids.genius}`, repo);
    expect(await screen.findByRole('button', { name: 'Change image' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cover image alt text')).toHaveValue('Fresh description');
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)?.coverMediaId).toBe(media.id);
  });

  it('uploads a new image from the picker, replaces the cover, then removes it', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const first = await repo.uploadMedia(tinyPng('one.png'), { en: 'First' });
    await repo.updateProject(ids.genius, { coverMediaId: first.id });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    await u.click(await screen.findByRole('button', { name: 'Change image' }));
    const picker = await screen.findByRole('dialog', { name: 'Cover image' });
    await u.upload(within(picker).getByLabelText('Upload a new image'), tinyPng('two.png'));
    await waitFor(async () => expect(Object.keys((await repo.loadSite()).media)).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cover image' })).not.toBeInTheDocument());
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    const stored = (await repo.loadSite()).projects.find((p) => p.id === ids.genius)!;
    expect(stored.coverMediaId).not.toBe(first.id);
    expect(stored.coverMediaId).not.toBeNull();

    await u.click(screen.getByRole('button', { name: 'Remove' }));
    expect(document.querySelector('.a-imagefield img')).toBeNull();
    expect(screen.queryByLabelText('Cover image alt text')).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findAllByText('Project saved');
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)?.coverMediaId).toBeNull();
  });

  it('rejects a non-image upload from the picker without changing the project', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    await u.click(await screen.findByRole('button', { name: 'Choose image' }));
    const picker = await screen.findByRole('dialog', { name: 'Cover image' });
    await u.upload(within(picker).getByLabelText('Upload a new image'), new File(['hello'], 'x.txt', { type: 'text/plain' }));
    expect(await within(picker).findByRole('alert')).toHaveTextContent('Unsupported file type');
    expect(Object.keys((await repo.loadSite()).media)).toHaveLength(0);
  });

  it('saves and restores the live and source-code links', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    const first = renderAt(`/admin/projects/${ids.genius}`, repo);
    await u.type(await screen.findByLabelText(/Project link/), LIVE);
    await u.type(screen.getByLabelText(/Source code link/), REPO);
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    const stored = (await repo.loadSite()).projects.find((p) => p.id === ids.genius)!;
    expect(stored).toMatchObject({ url: LIVE, repoUrl: REPO });
    first.unmount();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    expect(await screen.findByLabelText(/Project link/)).toHaveValue(LIVE);
    expect(screen.getByLabelText(/Source code link/)).toHaveValue(REPO);
  });

  it('clearing a link removes it (stored as null, not an empty string)', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { url: LIVE, repoUrl: REPO });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    await u.clear(await screen.findByLabelText(/Source code link/));
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)).toMatchObject({ url: LIVE, repoUrl: null });
  });

  it.each([
    ['Project link', 'http://insecure.example', 'url'],
    ['Source code link', 'javascript:alert(1)', 'repoUrl'],
    ['Source code link', 'git@github.com:me/repo.git', 'repoUrl'],
  ])('validates %s = %s and saves nothing', async (label, value, field) => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    const input = await screen.findByLabelText(new RegExp(label));
    await u.type(input, value);
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    expect(await screen.findByText('Must be a valid https:// address')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const stored = (await repo.loadSite()).projects.find((p) => p.id === ids.genius)!;
    expect(stored[field as 'url' | 'repoUrl']).toBeNull();
    expect(screen.queryByText('Project saved')).not.toBeInTheDocument();
  });

  it('duplicating a project carries its links and cover over (as a hidden copy)', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const m = await repo.uploadMedia(tinyPng(), { en: 'x' });
    await repo.updateProject(ids.genius, { url: LIVE, repoUrl: REPO, coverMediaId: m.id });
    const u = user();
    renderAt('/admin/projects', repo);
    const row = (await screen.findByText('Project Genius', { selector: 'a.a-row__title' })).closest('li')!;
    await u.click(within(row).getByRole('button', { name: 'Duplicate' }));
    await waitFor(async () => expect((await repo.loadSite()).projects.some((p) => p.title === 'Project Genius (copy)')).toBe(true));
    const copy = (await repo.loadSite()).projects.find((p) => p.title === 'Project Genius (copy)')!;
    expect(copy).toMatchObject({ url: LIVE, repoUrl: REPO, coverMediaId: m.id, isVisible: false });
  });
});

describe('compatibility with existing project records', () => {
  it('loads records saved before repoUrl existed, and they stay editable', async () => {
    const { repo, storage } = await makeRepo({ signedIn: true });
    await repo.loadSite();
    const data = JSON.parse(storage.getItem('hlab-demo-data-v1')!);
    for (const p of data.projects) delete p.repoUrl; // the previous release's shape
    storage.setItem('hlab-demo-data-v1', JSON.stringify(data));

    const site = await repo.loadSite();
    expect(site.projects).toHaveLength(7);
    expect(site.projects.every((p) => p.repoUrl === null)).toBe(true);

    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    expect(await screen.findByLabelText(/Source code link/)).toHaveValue('');
    await u.type(screen.getByLabelText(/^Title/), ' v2');
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)).toMatchObject({ title: 'Project Genius v2', repoUrl: null });
  });

  it('accepts create/update inputs from older callers that omit repoUrl', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const legacy = { slug: 'legacy', title: 'Legacy', summary: {}, description: {}, status: 'active', tags: [], url: null, coverMediaId: null, isVisible: true };
    const p = await repo.createProject(legacy as never);
    expect(p.repoUrl).toBeNull();
    expect(await repo.updateProject(p.id, { title: 'Legacy 2' })).toMatchObject({ repoUrl: null });
  });

  it('rejects an insecure source link at the repository level', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await expect(repo.updateProject(ids.genius, { repoUrl: 'http://x.example' })).rejects.toMatchObject({ code: 'validation' });
    await expect(repo.updateProject(ids.genius, { repoUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'validation' });
  });

  it('maps database rows with and without the repo_url column', () => {
    const base = {
      id: 'p', slug: 's', title: 'T', summary: {}, description: {}, status: 'active', tags: [], url: null,
      cover_media_id: null, position: 1, is_visible: true, created_at: '', updated_at: '',
    };
    expect(rowToProject(base).repoUrl).toBeNull(); // database that has not applied 0004 yet
    expect(rowToProject({ ...base, repo_url: null }).repoUrl).toBeNull();
    expect(rowToProject({ ...base, repo_url: REPO }).repoUrl).toBe(REPO);
  });

  it('explains a missing migration instead of failing mysteriously', () => {
    const e = toAppError({ code: 'PGRST204', message: "Could not find the 'repo_url' column of 'projects' in the schema cache" }, 'saving the project');
    expect(e.code).toBe('config');
    expect(e.message).toMatch(/0004_project_repo_url\.sql/);
  });
});
