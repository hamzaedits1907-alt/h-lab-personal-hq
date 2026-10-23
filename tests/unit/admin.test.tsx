import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_EMAIL, DEMO_PASSWORD, MemoryStorage } from '@/data/demoRepository';
import { AppError } from '@/data/errors';
import { NonAdminRepository, ids, makeRepo, renderAt, tinyPng, user } from './helpers';

const row = (name: string) => screen.getByText(name, { selector: 'a.a-row__title' }).closest('li')!;

describe('admin authentication and authorization', () => {
  it('sends signed-out visitors to the login page and shows no admin content', async () => {
    const { repo } = await makeRepo();
    const { router } = renderAt('/admin', repo);
    expect(await screen.findByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/login');
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('protects every admin route, including deep links', async () => {
    const { repo } = await makeRepo();
    for (const path of ['/admin/projects', '/admin/projects/new', `/admin/projects/${ids.genius}`, '/admin/sections', '/admin/media', '/admin/appearance', '/admin/text', '/admin/settings']) {
      const { router, unmount } = renderAt(path, repo);
      await screen.findByRole('heading', { name: 'Admin sign in' });
      expect(router.state.location.pathname, path).toBe('/admin/login');
      unmount();
    }
  });

  it('has no registration or sign-up option', async () => {
    const { repo } = await makeRepo();
    renderAt('/admin/login', repo);
    await screen.findByRole('heading', { name: 'Admin sign in' });
    expect(screen.queryByText(/sign up|register|create account/i)).not.toBeInTheDocument();
  });

  it('shows a generic error for wrong credentials and stays signed out', async () => {
    const { repo } = await makeRepo();
    const u = user();
    renderAt('/admin/login', repo);
    await u.type(await screen.findByLabelText('Email'), DEMO_EMAIL);
    await u.type(screen.getByLabelText('Password'), 'wrong');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect((await repo.getAuthState()).status).toBe('signed-out');
  });

  it('signs the admin in and shows the dashboard', async () => {
    const { repo } = await makeRepo();
    const u = user();
    renderAt('/admin/login', repo);
    await u.type(await screen.findByLabelText('Email'), DEMO_EMAIL);
    await u.type(screen.getByLabelText('Password'), DEMO_PASSWORD);
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('refuses an authenticated user who is not an administrator', async () => {
    const repo = new NonAdminRepository(new MemoryStorage());
    renderAt('/admin', repo);
    expect(await screen.findByRole('heading', { name: 'Not authorized' })).toBeInTheDocument();
    expect(screen.getByText(/stranger@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
  });

  it('signs out', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin', repo);
    await screen.findByRole('heading', { name: 'Dashboard' });
    await u.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('shows real counts, a setup checklist and an empty change log', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    renderAt('/admin', repo);
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByText('published projects').previousSibling).toHaveTextContent('7');
    expect(screen.getByText('visible sections').previousSibling).toHaveTextContent('5');
    expect(screen.getByText('Add a contact email')).toBeInTheDocument();
    expect(await screen.findByText('No changes recorded yet')).toBeInTheDocument();
  });

  it('lists recent changes after an edit', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { title: 'Edited title' });
    renderAt('/admin', repo);
    expect(await screen.findByText('Edited title')).toBeInTheDocument();
  });
});

describe('project editing', () => {
  it('saves edits to the database and only then reports success', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    const title = await screen.findByLabelText(/^Title/);
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    await u.clear(title);
    await u.type(title, 'Genius Reborn');
    expect(screen.getAllByRole('status').some((s) => /Unsaved changes/.test(s.textContent ?? ''))).toBe(true);
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    expect(await screen.findByText('Project saved')).toBeInTheDocument();
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)?.title).toBe('Genius Reborn');
  });

  it('does NOT claim success when the database rejects the save', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    vi.spyOn(repo, 'updateProject').mockRejectedValue(new AppError('unauthorized', 'You are not allowed to do that.'));
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    const title = await screen.findByLabelText(/^Title/);
    await u.type(title, ' X');
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    expect((await screen.findAllByText('You are not allowed to do that.')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Project saved')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').some((s) => /Not saved/.test(s.textContent ?? ''))).toBe(true);
    // the draft is kept so nothing the owner typed is lost
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Project Genius X');
  });

  it('shows inline validation errors and saves nothing', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    const url = await screen.findByLabelText(/Project link/);
    await u.type(url, 'http://insecure.example');
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    expect(await screen.findByText('Must be a valid https:// address')).toBeInTheDocument();
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)?.url).toBeNull();
    expect(screen.queryByText('Project saved')).not.toBeInTheDocument();
  });

  it('creates a project (hidden by default) with an auto-generated address', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    const { router } = renderAt('/admin/projects/new', repo);
    await u.type(await screen.findByLabelText(/^Title/), 'Brand New Thing');
    expect(screen.getByLabelText(/Address/)).toHaveValue('brand-new-thing');
    await u.type(screen.getByLabelText('Short summary'), 'A summary');
    await u.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Project created')).toBeInTheDocument();
    const created = (await repo.loadSite()).projects.find((p) => p.slug === 'brand-new-thing');
    expect(created).toMatchObject({ title: 'Brand New Thing', isVisible: false, summary: { en: 'A summary' } });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/projects/${created!.id}`));
  });

  it('reports a duplicate address', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/projects/new', repo);
    await u.type(await screen.findByLabelText(/^Title/), 'JARVIS');
    await u.click(screen.getByRole('button', { name: 'Create project' }));
    expect((await screen.findAllByText(/project address is already in use/)).length).toBeGreaterThan(0);
  });

  it('edits tags', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    const input = await screen.findByLabelText('Tags', { selector: 'input' });
    await u.type(input, 'Fresh{Enter}');
    await u.click(screen.getByRole('button', { name: 'Remove Workspace' }));
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    expect((await repo.loadSite()).projects.find((p) => p.id === ids.genius)?.tags).toEqual(['AI', 'Fresh']);
  });

  it('warns before leaving with unsaved changes', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    const { router } = renderAt(`/admin/projects/${ids.genius}`, repo);
    await u.type(await screen.findByLabelText(/^Title/), ' changed');
    await u.click(screen.getByRole('link', { name: 'Sections' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await u.click(within(dialog).getByRole('button', { name: /Stay/ }));
    expect(router.state.location.pathname).toBe(`/admin/projects/${ids.genius}`);
    await u.click(screen.getByRole('link', { name: 'Sections' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/sections'));
  });

  it('shows "not found" for an unknown project', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    renderAt(`/admin/projects/${crypto.randomUUID()}`, repo);
    expect(await screen.findByText('Project not found')).toBeInTheDocument();
  });
});

describe('project manager list', () => {
  it('reorders with the move buttons and persists the order', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/projects', repo);
    await screen.findByRole('heading', { name: 'Projects' });
    await u.click(screen.getByRole('button', { name: 'Move Project Browser up' }));
    expect(await screen.findByText('Order saved')).toBeInTheDocument();
    expect((await repo.loadSite()).projects.slice(0, 2).map((p) => p.title)).toEqual(['Project Browser', 'Project Genius']);
  });

  it('toggles visibility and changes status', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/projects', repo);
    await screen.findByRole('heading', { name: 'Projects' });
    await u.click(screen.getByRole('switch', { name: 'Show Project Genius on the site' }));
    expect(await screen.findByText('Project hidden')).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Status of JARVIS'), 'completed');
    await screen.findByText('Status updated');
    const site = await repo.loadSite();
    expect(site.projects.find((p) => p.id === ids.genius)?.isVisible).toBe(false);
    expect(site.projects.find((p) => p.title === 'JARVIS')?.status).toBe('completed');
  });

  it('asks for confirmation before deleting, and deletes only when confirmed', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/projects', repo);
    await screen.findByRole('heading', { name: 'Projects' });
    await u.click(within(row('Edward')).getByRole('button', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: /Delete “Edward”/ });
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect((await repo.loadSite()).projects.some((p) => p.title === 'Edward')).toBe(true);

    await u.click(within(row('Edward')).getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: /Delete “Edward”/ });
    await u.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    expect(await screen.findByText('Project deleted')).toBeInTheDocument();
    expect((await repo.loadSite()).projects.some((p) => p.title === 'Edward')).toBe(false);
  });

  it('duplicates a project as a hidden copy', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/projects', repo);
    await screen.findByRole('heading', { name: 'Projects' });
    await u.click(within(row('JARVIS')).getByRole('button', { name: 'Duplicate' }));
    await screen.findByText(/Project duplicated|Edit project/);
    const copy = (await repo.loadSite()).projects.find((p) => p.title === 'JARVIS (copy)');
    expect(copy).toMatchObject({ isVisible: false, slug: 'jarvis-copy' });
  });

  it('does not report success for a failed reorder', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    vi.spyOn(repo, 'reorderProjects').mockRejectedValue(new AppError('network', 'Could not reach the database.'));
    const u = user();
    renderAt('/admin/projects', repo);
    await screen.findByRole('heading', { name: 'Projects' });
    await u.click(screen.getByRole('button', { name: 'Move Project Browser up' }));
    expect(await screen.findByText('Could not reach the database.')).toBeInTheDocument();
    expect(screen.queryByText('Order saved')).not.toBeInTheDocument();
  });
});

describe('sections editor', () => {
  it('adds a section, edits it, shows it and removes it', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/sections', repo);
    await screen.findByRole('heading', { name: 'Sections' });
    await u.click(screen.getByRole('button', { name: 'Add section' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a section' });
    await u.selectOptions(within(dialog).getByLabelText('Type'), 'text');
    await u.type(within(dialog).getByLabelText(/Name/), 'Field notes');
    await u.click(within(dialog).getByRole('button', { name: 'Add section' }));
    expect(await screen.findByRole('heading', { name: 'Edit section: Field notes' })).toBeInTheDocument();

    const created = (await repo.loadSite()).blocks.find((b) => b.adminLabel === 'Field notes')!;
    expect(created).toMatchObject({ type: 'text', anchor: 'field-notes', isVisible: false });

    const heading = screen.getByLabelText('Heading');
    await u.clear(heading);
    await u.type(heading, 'Notes from the lab');
    await u.click(screen.getByRole('switch', { name: 'Show on the site' }));
    await u.click(screen.getByRole('button', { name: 'Save section' }));
    expect(await screen.findByText('Section saved')).toBeInTheDocument();
    const saved = (await repo.loadSite()).blocks.find((b) => b.id === created.id)!;
    expect(saved.isVisible).toBe(true);
    expect(saved.content).toMatchObject({ heading: { en: 'Notes from the lab' } });

    await u.click(screen.getByRole('link', { name: '← All sections' }));
    await screen.findByRole('heading', { name: 'Sections' });
    await u.click(within(row('Field notes')).getByRole('button', { name: 'Delete' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete section' }));
    expect(await screen.findByText('Section deleted')).toBeInTheDocument();
    expect((await repo.loadSite()).blocks.some((b) => b.id === created.id)).toBe(false);
  });

  it('hides, shows and reorders sections', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/sections', repo);
    await screen.findByRole('heading', { name: 'Sections' });
    await u.click(screen.getByRole('switch', { name: 'Show Currently exploring on the site' }));
    await screen.findByText('Section hidden');
    await u.click(screen.getByRole('button', { name: 'Move About up' }));
    await screen.findByText('Order saved');
    const blocks = (await repo.loadSite()).blocks;
    expect(blocks.find((b) => b.id === ids.exploring)?.isVisible).toBe(false);
    expect(blocks.map((b) => b.adminLabel).slice(0, 3)).toEqual(['Hero', 'About', 'Projects']);
  });

  it('validates section content (unsafe button link is rejected)', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/sections/${ids.hero}`, repo);
    const link = await screen.findByLabelText('Button link', { selector: 'input[name="primaryCta.target"]' });
    await u.clear(link);
    await u.type(link, 'javascript:alert(1)');
    await u.click(screen.getByRole('button', { name: 'Save section' }));
    expect(await screen.findByText('Use #section, an https:// link or mailto:')).toBeInTheDocument();
    const hero = (await repo.loadSite()).blocks.find((b) => b.id === ids.hero)!;
    expect(hero.content).toMatchObject({ primaryCta: { target: '#projects' } });
  });

  it('edits list items inside a section (exploring)', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt(`/admin/sections/${ids.exploring}`, repo);
    await screen.findByRole('heading', { name: /Edit section/ });
    await u.click(screen.getByRole('button', { name: 'Remove Items 1' }));
    await u.click(screen.getByRole('button', { name: 'Add item' }));
    const title = screen.getByLabelText('Item 3 title');
    await u.type(title, 'A brand new idea');
    await u.click(screen.getByRole('button', { name: 'Save section' }));
    await screen.findByText('Section saved');
    const block = (await repo.loadSite()).blocks.find((b) => b.id === ids.exploring)!;
    expect(block.type === 'exploring' && block.content.items.map((i) => i.title.en)).toEqual(['Fast, light software', 'Immersive worlds', 'A brand new idea']);
  });
});

describe('settings, appearance and text', () => {
  it('saves contact details and shows them on the public site', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    const { unmount } = renderAt('/admin/settings', repo);
    await u.type(await screen.findByLabelText('Contact email'), 'hello@example.com');
    await u.click(screen.getByRole('button', { name: 'Add link' }));
    await u.type(screen.getByLabelText('Link 1 name'), 'GitHub');
    await u.clear(screen.getByLabelText('Link 1 address'));
    await u.type(screen.getByLabelText('Link 1 address'), 'https://github.com/example');
    await u.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    unmount();
    await repo.signOut();
    renderAt('/', repo);
    expect(await screen.findByRole('link', { name: /hello@example.com/ })).toHaveAttribute('href', 'mailto:hello@example.com');
    expect(screen.getAllByRole('link', { name: /GitHub/ })[0]).toHaveAttribute('href', 'https://github.com/example');
  });

  it('rejects an invalid email', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/settings', repo);
    await u.type(await screen.findByLabelText('Contact email'), 'not-an-email');
    await u.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect((await repo.loadSite()).settings?.contactEmail).toBeNull();
  });

  it('keeps pages from overwriting each other (merge onto the latest settings)', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/appearance', repo);
    await screen.findByRole('heading', { name: 'Appearance' });
    // another session changes the site name after this page loaded
    const current = (await repo.loadSite()).settings!;
    const { updatedAt: _u, ...input } = current;
    void _u;
    await repo.saveSettings({ ...input, siteName: 'Changed elsewhere' });
    await u.click(screen.getByRole('radio', { name: 'Lavender' }));
    await u.click(screen.getByRole('button', { name: 'Save appearance' }));
    await screen.findByText('Saved');
    expect((await repo.loadSite()).settings).toMatchObject({ accent: 'lavender', siteName: 'Changed elsewhere' });
  });

  it('enables Turkish, edits it independently and never loses English', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    const { unmount } = renderAt('/admin/settings', repo);
    await u.click(await screen.findByRole('switch', { name: 'Türkçe' }));
    await u.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Saved');
    unmount();

    renderAt(`/admin/projects/${ids.genius}`, repo);
    const tabs = await screen.findByRole('group', { name: 'Editing language' });
    await u.click(within(tabs).getByRole('button', { name: 'Türkçe' }));
    const summary = screen.getByLabelText('Short summary (Türkçe)');
    expect(summary).toHaveValue('Kişisel bir yapay zekâ çalışma alanı.');
    await u.clear(summary);
    await u.type(summary, 'Yeni özet');
    await u.click(within(tabs).getByRole('button', { name: 'English' }));
    expect(screen.getByLabelText('Short summary (English)')).toHaveValue('A personal AI workspace.');
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    const p = (await repo.loadSite()).projects.find((x) => x.id === ids.genius)!;
    expect(p.summary).toEqual({ en: 'A personal AI workspace.', tr: 'Yeni özet' });
  });

  it('confirms before unpublishing the site', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/settings', repo);
    await u.click(await screen.findByRole('switch', { name: 'Site is published' }));
    await u.click(screen.getByRole('button', { name: 'Save settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unpublish the site?' });
    await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect((await repo.loadSite()).settings?.isPublished).toBe(true);
  });

  it('edits navigation, labels and footer text', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/text', repo);
    const label = await screen.findByLabelText('Label 1');
    await u.clear(label);
    await u.type(label, 'Work');
    const footer = screen.getByLabelText('Footer text');
    await u.clear(footer);
    await u.type(footer, 'Made with care.');
    await u.click(screen.getByRole('button', { name: 'Save site text' }));
    await screen.findByText('Saved');
    const s = (await repo.loadSite()).settings!;
    expect(s.nav[0]?.label.en).toBe('Work');
    expect(s.footer.text.en).toBe('Made with care.');
  });
});

describe('media library', () => {
  it('rejects non-image and oversized uploads with a clear message', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    renderAt('/admin/media', repo);
    const input = await screen.findByLabelText('Image file');
    await u.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    await u.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findAllByText(/Unsupported file type/)).length).toBeGreaterThan(0);
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    await u.upload(input, big);
    await u.click(screen.getByRole('button', { name: 'Upload' }));
    expect((await screen.findAllByText(/The limit is 5\.0 MB/)).length).toBeGreaterThan(0);
    expect(Object.keys((await repo.loadSite()).media)).toHaveLength(0);
  });

  it('uploads an image with alt text, then protects it while in use', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const u = user();
    const { unmount } = renderAt('/admin/media', repo);
    await u.upload(await screen.findByLabelText('Image file'), tinyPng());
    await u.type(screen.getAllByLabelText('Alt text')[0]!, 'A tiny pixel');
    await u.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Image uploaded')).toBeInTheDocument();
    const [media] = Object.values((await repo.loadSite()).media);
    expect(media?.alt.en).toBe('A tiny pixel');
    expect(media?.storagePath.startsWith('data:image/png')).toBe(true);

    await repo.updateProject(ids.genius, { coverMediaId: media!.id });
    unmount();
    renderAt('/admin/media', repo);
    await u.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'This image is still in use' });
    expect(within(dialog).getByRole('link', { name: /Project: Project Genius/ })).toBeInTheDocument();
    expect(Object.keys((await repo.loadSite()).media)).toHaveLength(1);
  });

  it('flags images that have no alt text', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.uploadMedia(tinyPng(), {});
    renderAt('/admin', repo);
    expect(await screen.findByText('1 image without alt text')).toBeInTheDocument();
  });

  it('lets the owner pick an uploaded image as a project cover and set its alt text', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const media = await repo.uploadMedia(tinyPng(), { en: 'Old alt' });
    const u = user();
    renderAt(`/admin/projects/${ids.genius}`, repo);
    await u.click(await screen.findByRole('button', { name: 'Choose image' }));
    const picker = await screen.findByRole('dialog', { name: 'Cover image' });
    await u.click(within(picker).getByRole('button', { name: /Select image Old alt/ }));
    const alt = await screen.findByLabelText('Cover image alt text');
    await u.clear(alt);
    await u.type(alt, 'New alt');
    await u.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText('Project saved');
    const site = await repo.loadSite();
    expect(site.projects.find((p) => p.id === ids.genius)?.coverMediaId).toBe(media.id);
    expect(site.media[media.id]?.alt.en).toBe('New alt');
  });
});
