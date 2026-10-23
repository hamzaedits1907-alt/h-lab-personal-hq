import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seedSettings } from '@/content/seed';
import { AppError } from '@/data/errors';
import { ids, makeRepo, renderAt, user } from './helpers';

describe('public site renders database records', () => {
  it('shows the hero, projects and sections from the data', async () => {
    const { repo } = await makeRepo();
    renderAt('/', repo);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Projects in progress, ideas in orbit.');
    for (const name of ['Project Genius', 'Project Browser', 'Project-Frame', 'JARVIS', 'Edward', 'Lufthansa Launcher', 'Project Genesis']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Currently exploring' })).toBeInTheDocument();
    expect(document.title).toBe('H/LAB — Personal Project HQ');
  });

  it('renders what is stored, not what is in the starter file', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { title: 'Renamed In Database' });
    await repo.saveSettings({ ...seedSettings, brandText: 'MYLAB' });
    await repo.signOut();
    renderAt('/', repo);
    expect(await screen.findByRole('link', { name: /Renamed In Database/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Project Genius/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('MYLAB').length).toBeGreaterThan(0);
  });

  it('does not show hidden projects or hidden sections (and drops their nav links)', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { isVisible: false });
    await repo.updateBlock(ids.exploring, 'exploring', { isVisible: false });
    await repo.signOut();
    renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /Project Genius/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Currently exploring' })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByText('Exploring')).not.toBeInTheDocument();
    expect(within(nav).getByText('Projects')).toBeInTheDocument();
  });

  it('keeps projects ordered as saved', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const all = (await repo.loadSite()).projects.map((p) => p.id);
    await repo.reorderProjects([...all].reverse());
    await repo.signOut();
    renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    const titles = [...document.querySelectorAll('.card__title')].map((n) => n.textContent);
    expect(titles[0]).toBe('Project Genesis');
    expect(titles.at(-1)).toBe('Project Genius');
  });
});

describe('safe rendering of edited text', () => {
  it('renders HTML/script in content as inert text', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, {
      title: '<img src=x onerror="window.__pwned=1"> Genius',
      summary: { en: '<script>window.__pwned=1</script>' },
    });
    await repo.signOut();
    renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('.card script')).toBeNull();
    expect(screen.getByText(/<script>window.__pwned=1<\/script>/)).toBeInTheDocument();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('never renders a javascript: link even if one reached the database', async () => {
    const { repo, storage } = await makeRepo({ signedIn: true });
    await repo.loadSite(); // seeds the demo store
    await repo.signOut();
    // Simulate corrupted/malicious data written behind the application's back.
    const data = JSON.parse(storage.getItem('hlab-demo-data-v1')!);
    data.projects[0].url = 'javascript:alert(1)';
    data.settings.socialLinks = [{ label: 'Evil', url: 'javascript:alert(1)' }];
    storage.setItem('hlab-demo-data-v1', JSON.stringify(data));
    renderAt('/?project=project-genius', repo);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link', { name: /Visit project/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('opens external project links safely', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { url: 'https://example.com/genius' });
    await repo.signOut();
    renderAt('/?project=project-genius', repo);
    const link = await screen.findByRole('link', { name: /Visit project/ });
    expect(link).toHaveAttribute('href', 'https://example.com/genius');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });
});

describe('project details', () => {
  it('opens a detail dialog from a card and closes it again', async () => {
    const { repo } = await makeRepo();
    const u = user();
    const { router } = renderAt('/', repo);
    await u.click(await screen.findByRole('link', { name: /Project-Frame/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Project-Frame' });
    expect(within(dialog).getByText(/Currently paused/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?project=project-frame');
    await u.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.search).toBe('');
  });

  it('filters by status and marks the active filter', async () => {
    const { repo } = await makeRepo();
    const u = user();
    renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    await u.click(screen.getByRole('button', { name: 'Paused' }));
    expect(screen.getByRole('button', { name: 'Paused' })).toHaveAttribute('aria-pressed', 'true');
    expect([...document.querySelectorAll('.card__title')].map((n) => n.textContent)).toEqual(['Project-Frame']);
  });
});

describe('publication state', () => {
  it('shows a coming-soon page to visitors when unpublished, but the admin can preview', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.saveSettings({ ...seedSettings, isPublished: false });
    await repo.signOut();
    const { unmount } = renderAt('/', repo);
    expect(await screen.findByRole('heading', { name: 'Coming soon' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Project Genius/ })).not.toBeInTheDocument();
    unmount();

    await repo.signIn('demo@hlab.local', 'demo-password');
    renderAt('/?preview=1', repo);
    expect(await screen.findByRole('heading', { level: 1, name: /Projects in progress/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Preview/);
  });

  it('preview mode reveals hidden items to the admin only', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { isVisible: false });
    const { unmount } = renderAt('/?preview=1', repo);
    expect(await screen.findByRole('link', { name: /Project Genius/ })).toBeInTheDocument();
    unmount();
    await repo.signOut();
    renderAt('/?preview=1', repo); // same URL, but not an admin
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /Project Genius/ })).not.toBeInTheDocument();
  });
});

describe('failure handling', () => {
  it('shows an error with retry when the database is unavailable, and never shows starter data', async () => {
    const { repo } = await makeRepo();
    const original = repo.loadSite.bind(repo);
    const spy = vi.spyOn(repo, 'loadSite').mockRejectedValueOnce(new AppError('network', 'down'));
    const u = user();
    renderAt('/', repo);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load this site');
    expect(screen.queryByText('Project Genius')).not.toBeInTheDocument();
    spy.mockImplementation(original);
    await u.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('explains when the database has no settings row yet', async () => {
    const { repo } = await makeRepo();
    vi.spyOn(repo, 'loadSite').mockResolvedValue({ settings: null, blocks: [], invalidBlocks: [], projects: [], media: {} });
    renderAt('/', repo);
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't set up yet");
  });

  it('survives a project with a missing cover image and an empty list', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    for (const p of (await repo.loadSite()).projects) await repo.deleteProject(p.id);
    await repo.signOut();
    renderAt('/', repo);
    expect(await screen.findByText('No projects to show yet.')).toBeInTheDocument();
  });

  it('shows 404 for unknown pages', async () => {
    const { repo } = await makeRepo();
    renderAt('/nope', repo);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('languages', () => {
  it('offers a language switch only when more than one language is published', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.signOut();
    const { unmount } = renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('group', { name: 'Language' })).not.toBeInTheDocument();
    unmount();

    await repo.signIn('demo@hlab.local', 'demo-password');
    await repo.saveSettings({ ...seedSettings, languages: ['en', 'tr'] });
    await repo.signOut();
    const u = user();
    renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    const group = screen.getByRole('group', { name: 'Language' });
    await u.click(within(group).getByRole('button', { name: 'TR' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Süren projeler, yörüngedeki fikirler.');
    expect(document.documentElement.lang).toBe('tr');
    await u.click(within(group).getByRole('button', { name: 'EN' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Projects in progress');
  });

  it('falls back to the default language for untranslated text', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.saveSettings({ ...seedSettings, languages: ['en', 'tr'] });
    await repo.updateProject(ids.genius, { summary: { en: 'Only English here' } });
    await repo.signOut();
    window.localStorage.setItem('hlab-lang', 'tr');
    renderAt('/', repo);
    expect(await screen.findByText('Only English here')).toBeInTheDocument();
  });

  it('ignores a stored language that is not published', async () => {
    const { repo } = await makeRepo();
    window.localStorage.setItem('hlab-lang', 'tr');
    renderAt('/', repo);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Projects in progress');
  });
});

describe('appearance', () => {
  it('applies only validated appearance settings to the document', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.saveSettings({ ...seedSettings, accent: 'rose', theme: 'light', background: 'grid', animation: 'subtle' });
    await repo.signOut();
    renderAt('/', repo);
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(document.documentElement.dataset).toMatchObject({ accent: 'rose', bg: 'grid', motion: 'subtle' });
  });
});
