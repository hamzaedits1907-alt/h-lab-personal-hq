import { describe, expect, it } from 'vitest';
import { defaultBlockContent } from '@/content/defaults';
import { seedSettings } from '@/content/seed';
import { AppError, MediaInUseError } from '@/data/errors';
import { formatBytes, sniffImageType, validateMediaFile, validateMediaUpload } from '@/data/validation';
import { ids, makeRepo, tinyPng } from './helpers';

const newProject = (slug: string) => ({
  slug,
  title: `Title ${slug}`,
  summary: { en: 's' },
  description: { en: 'd' },
  status: 'experiment' as const,
  tags: ['x'],
  url: null,
  repoUrl: null,
  coverMediaId: null,
  isVisible: true,
});

describe('authorization (demo repository mirrors the database rules)', () => {
  it('rejects every write when signed out', async () => {
    const { repo } = await makeRepo();
    const attempts: Promise<unknown>[] = [
      repo.createProject(newProject('a')),
      repo.updateProject(ids.genius, { title: 'x' }),
      repo.deleteProject(ids.genius),
      repo.reorderProjects([ids.genius]),
      repo.saveSettings(seedSettings),
      repo.createBlock({ type: 'text', anchor: 'x', adminLabel: 'x', isVisible: true, content: defaultBlockContent('text') }),
      repo.deleteBlock(ids.hero),
      repo.uploadMedia(tinyPng(), {}),
      repo.listChanges(),
    ];
    for (const a of attempts) await expect(a).rejects.toMatchObject({ code: 'unauthorized' });
    // and nothing changed
    const site = await repo.loadSite();
    expect(site.projects).toHaveLength(7);
  });

  it('only returns published rows to visitors but everything to the admin', async () => {
    const { repo, storage } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { isVisible: false });
    await repo.updateBlock(ids.exploring, 'exploring', { isVisible: false });
    expect((await repo.loadSite()).projects).toHaveLength(7);
    await repo.signOut();
    const visitor = await repo.loadSite();
    expect(visitor.projects).toHaveLength(6);
    expect(visitor.projects.some((p) => p.id === ids.genius)).toBe(false);
    expect(visitor.blocks.some((b) => b.id === ids.exploring)).toBe(false);
    expect(storage).toBeTruthy();
  });
});

describe('projects', () => {
  it('creates, updates, duplicates data and deletes', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const p = await repo.createProject(newProject('fresh'));
    expect(p.position).toBe(8);
    const up = await repo.updateProject(p.id, { title: 'Renamed', tags: ['a', 'b'], url: 'https://example.com' });
    expect(up).toMatchObject({ title: 'Renamed', tags: ['a', 'b'], url: 'https://example.com' });
    await repo.deleteProject(p.id);
    expect((await repo.loadSite()).projects.find((x) => x.id === p.id)).toBeUndefined();
  });

  it('rejects duplicate slugs and invalid input without changing anything', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await expect(repo.createProject(newProject('jarvis'))).rejects.toMatchObject({ code: 'conflict' });
    await expect(repo.updateProject(ids.genius, { url: 'http://insecure.example' })).rejects.toMatchObject({ code: 'validation' });
    await expect(repo.updateProject(ids.genius, { url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(AppError);
    await expect(repo.updateProject(ids.genius, { tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })).rejects.toMatchObject({ code: 'validation' });
    const site = await repo.loadSite();
    expect(site.projects.find((p) => p.id === ids.genius)?.url).toBe('https://project-genius.netlify.app/'); // unchanged
  });

  it('reports field-level errors', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const err = await repo.updateProject(ids.genius, { title: '' }).catch((e: AppError) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).fields).toHaveProperty('title');
  });

  it('persists ordering and visibility', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const order = (await repo.loadSite()).projects.map((p) => p.id);
    const reversed = [...order].reverse();
    await repo.reorderProjects(reversed);
    expect((await repo.loadSite()).projects.map((p) => p.id)).toEqual(reversed);
    await repo.updateProject(reversed[0]!, { isVisible: false });
    await repo.signOut();
    expect((await repo.loadSite()).projects.map((p) => p.id)).toEqual(reversed.slice(1));
  });

  it('keeps Turkish and English text independent', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const before = (await repo.loadSite()).projects.find((p) => p.id === ids.genius)!;
    await repo.updateProject(ids.genius, { summary: { ...before.summary, tr: 'Yeni Türkçe' } });
    const after = (await repo.loadSite()).projects.find((p) => p.id === ids.genius)!;
    expect(after.summary.en).toBe(before.summary.en);
    expect(after.summary.tr).toBe('Yeni Türkçe');
  });
});

describe('sections (blocks)', () => {
  it('adds, edits, reorders and removes a block', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const b = await repo.createBlock({ type: 'text', anchor: 'notes', adminLabel: 'Notes', isVisible: false, content: defaultBlockContent('text') });
    expect(b).toMatchObject({ type: 'text', anchor: 'notes', isVisible: false });
    const edited = await repo.updateBlock(b.id, 'text', { content: { heading: { en: 'Hi' }, body: { en: 'Body' } }, isVisible: true });
    expect(edited.isVisible).toBe(true);
    const order = (await repo.loadSite()).blocks.map((x) => x.id);
    await repo.reorderBlocks([b.id, ...order.filter((i) => i !== b.id)]);
    expect((await repo.loadSite()).blocks[0]?.id).toBe(b.id);
    await repo.deleteBlock(b.id);
    expect((await repo.loadSite()).blocks.find((x) => x.id === b.id)).toBeUndefined();
  });

  it('validates block content and addresses', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const badCta = { ...defaultBlockContent('hero'), primaryCta: { label: { en: 'x' }, target: 'javascript:alert(1)' } };
    await expect(repo.updateBlock(ids.hero, 'hero', { content: badCta })).rejects.toMatchObject({ code: 'validation' });
    await expect(
      repo.createBlock({ type: 'text', anchor: 'projects', adminLabel: 'dup', isVisible: true, content: defaultBlockContent('text') }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      repo.createBlock({ type: 'text', anchor: 'Bad Anchor', adminLabel: 'x', isVisible: true, content: defaultBlockContent('text') }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('settings', () => {
  it('saves and returns the stored values', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const saved = await repo.saveSettings({ ...seedSettings, siteName: 'My Lab', accent: 'lavender', contactEmail: 'me@example.com' });
    expect(saved).toMatchObject({ siteName: 'My Lab', accent: 'lavender', contactEmail: 'me@example.com' });
    expect((await repo.loadSite()).settings?.siteName).toBe('My Lab');
  });
  it('rejects invalid appearance values and languages', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await expect(repo.saveSettings({ ...seedSettings, accent: 'hotpink' as never })).rejects.toMatchObject({ code: 'validation' });
    await expect(repo.saveSettings({ ...seedSettings, languages: ['en'], defaultLanguage: 'tr' })).rejects.toMatchObject({ code: 'validation' });
    expect((await repo.loadSite()).settings?.accent).toBe('mint');
  });
});

describe('media', () => {
  it('validates declared type and size', () => {
    expect(() => validateMediaFile({ type: 'image/svg+xml', size: 10 })).toThrow(/Unsupported/);
    expect(() => validateMediaFile({ type: 'application/pdf', size: 10 })).toThrow(/Unsupported/);
    expect(() => validateMediaFile({ type: 'image/png', size: 6 * 1024 * 1024 })).toThrow(/limit/);
    expect(() => validateMediaFile({ type: 'image/png', size: 0 })).toThrow(/empty/);
    expect(() => validateMediaFile({ type: 'image/png', size: 1000 })).not.toThrow();
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('checks the real file signature, not the claimed type or extension', async () => {
    expect(await sniffImageType(tinyPng())).toBe('image/png');
    const fake = new File([new TextEncoder().encode('<svg onload=alert(1)>')], 'evil.png', { type: 'image/png' });
    expect(await sniffImageType(fake)).toBeNull();
    await expect(validateMediaUpload(fake)).rejects.toThrow(/does not look like/);
    const mismatched = new File([await tinyPng().arrayBuffer()], 'a.jpg', { type: 'image/jpeg' });
    await expect(validateMediaUpload(mismatched)).rejects.toThrow(/do not match/);
  });

  it('uploads, edits alt text, and refuses to delete images that are still used', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    const m = await repo.uploadMedia(tinyPng(), { en: 'A pixel' });
    expect(m.alt.en).toBe('A pixel');
    await repo.updateMediaAlt(m.id, { en: 'Changed' });

    await repo.updateProject(ids.genius, { coverMediaId: m.id });
    expect(await repo.getMediaUsage(m.id)).toEqual([{ kind: 'project', refId: ids.genius, label: 'Project Genius' }]);
    await expect(repo.deleteMedia(m.id)).rejects.toBeInstanceOf(MediaInUseError);
    expect((await repo.loadSite()).media[m.id]).toBeDefined();

    // referenced from a gallery block as well
    const g = await repo.createBlock({ type: 'gallery', anchor: 'gal', adminLabel: 'Gal', isVisible: true, content: { heading: {}, images: [{ mediaId: m.id }] } });
    await repo.updateProject(ids.genius, { coverMediaId: null });
    await expect(repo.deleteMedia(m.id)).rejects.toMatchObject({ usages: [{ kind: 'block', label: 'Gal' }] });

    await repo.deleteBlock(g.id);
    await repo.deleteMedia(m.id);
    expect((await repo.loadSite()).media[m.id]).toBeUndefined();
  });

  it('refuses to upload disallowed files', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await expect(repo.uploadMedia(new File(['hello'], 'a.txt', { type: 'text/plain' }), {})).rejects.toMatchObject({ code: 'validation' });
    await expect(repo.uploadMedia(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), {})).rejects.toMatchObject({ code: 'validation' });
    expect(Object.keys((await repo.loadSite()).media)).toHaveLength(0);
  });

  it('refuses a cover that does not exist', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await expect(repo.updateProject(ids.genius, { coverMediaId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('change log', () => {
  it('records edits for the dashboard', async () => {
    const { repo } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { title: 'Logged' });
    const log = await repo.listChanges(5);
    expect(log[0]).toMatchObject({ table: 'projects', action: 'update', summary: 'Logged' });
  });
});
