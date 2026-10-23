import { describe, expect, it } from 'vitest';
import { LEGACY_ABOUT_BODY, LEGACY_VISIT_LABEL } from '@/content/legacy';
import { seedBlocks, seedProjects, seedSettings } from '@/content/seed';
import { DEMO_DATA_VERSION, DemoRepository, MemoryStorage } from '@/data/demoRepository';
import { ids, makeRepo } from './helpers';

const KEY = 'hlab-demo-data-v1';
const aboutSeed = seedBlocks.find((b) => b.type === 'about')!.content as { body: unknown; interests: unknown };

/** Rewrite stored demo data into what the FIRST release saved (the reason the site looked unchanged). */
function downgradeToFirstRelease(storage: MemoryStorage, edit?: (d: any) => void) {
  const d = JSON.parse(storage.getItem(KEY)!);
  delete d.version;
  for (const p of d.projects) {
    delete p.repoUrl;
    p.url = null;
  }
  const about = d.blocks.find((b: any) => b.type === 'about');
  about.content.body = LEGACY_ABOUT_BODY;
  about.content.interests = [{ en: 'AI tools' }, { en: 'Desktop software' }];
  d.settings.ui.labels.visitProject = LEGACY_VISIT_LABEL;
  delete d.settings.ui.labels.sourceCode;
  delete d.settings.ui.labels.newTab;
  edit?.(d);
  storage.setItem(KEY, JSON.stringify(d));
}

describe('upgrading demo data saved by the first release', () => {
  it('shows the new About copy, labels and verified starter links instead of the stale ones', async () => {
    const storage = new MemoryStorage();
    await new DemoRepository(storage).loadSite(); // first release would have saved its data here
    downgradeToFirstRelease(storage);

    const site = await new DemoRepository(storage).loadSite();
    const about = site.blocks.find((b) => b.type === 'about')!;
    expect(about.type === 'about' && about.content.body).toEqual(aboutSeed.body);
    expect(about.type === 'about' && about.content.interests).toEqual(aboutSeed.interests);
    expect(site.settings?.ui.labels.visitProject).toEqual(seedSettings.ui.labels.visitProject);
    expect(site.settings?.ui.labels.sourceCode).toEqual(seedSettings.ui.labels.sourceCode);
    expect(site.projects.find((p) => p.id === ids.genius)?.url).toBe('https://project-genius.netlify.app/');
    expect(site.projects.find((p) => p.title === 'Lufthansa Launcher')?.url).toBe('https://lufthansa-connect-ptfs.netlify.app/');
    expect(site.projects.every((p) => p.repoUrl === null)).toBe(true);
    expect(JSON.parse(storage.getItem(KEY)!).version).toBe(DEMO_DATA_VERSION); // upgraded once, persisted
  });

  it('NEVER overwrites text, labels or links the owner edited', async () => {
    const storage = new MemoryStorage();
    await new DemoRepository(storage).loadSite();
    downgradeToFirstRelease(storage, (d) => {
      d.blocks.find((b: any) => b.type === 'about').content.body = { en: 'My own words about me.', tr: 'Benim sözlerim.' };
      d.settings.ui.labels.visitProject = { en: 'Go and see it', tr: 'Git bak' };
      d.projects.find((p: any) => p.id === ids.genius).url = 'https://my-own-site.example/';
    });
    const site = await new DemoRepository(storage).loadSite();
    const about = site.blocks.find((b) => b.type === 'about')!;
    expect(about.type === 'about' && about.content.body).toEqual({ en: 'My own words about me.', tr: 'Benim sözlerim.' });
    expect(site.settings?.ui.labels.visitProject).toEqual({ en: 'Go and see it', tr: 'Git bak' });
    expect(site.projects.find((p) => p.id === ids.genius)?.url).toBe('https://my-own-site.example/');
    // the brand-new labels are still added
    expect(site.settings?.ui.labels.sourceCode).toBeDefined();
  });

  it('keeps the two languages independent: an edited English text does not block the Turkish upgrade rules', async () => {
    const storage = new MemoryStorage();
    await new DemoRepository(storage).loadSite();
    downgradeToFirstRelease(storage, (d) => {
      d.blocks.find((b: any) => b.type === 'about').content.body = { en: 'Edited English', tr: LEGACY_ABOUT_BODY.tr };
    });
    const about = (await new DemoRepository(storage).loadSite()).blocks.find((b) => b.type === 'about')!;
    // Mixed (partly edited) copy is treated as edited and left untouched.
    expect(about.type === 'about' && about.content.body).toEqual({ en: 'Edited English', tr: LEGACY_ABOUT_BODY.tr });
  });

  it('is idempotent and does not touch current data', async () => {
    const { repo, storage } = await makeRepo({ signedIn: true });
    await repo.updateProject(ids.genius, { url: 'https://edited.example/' });
    const before = storage.getItem(KEY);
    await repo.loadSite();
    await repo.loadSite();
    expect(storage.getItem(KEY)).toBe(before);
  });

  it('fresh data already has everything', async () => {
    const site = await new DemoRepository(new MemoryStorage()).loadSite();
    expect(site.projects.filter((p) => p.url).map((p) => p.title)).toEqual(['Project Genius', 'Lufthansa Launcher']);
    expect(seedProjects.filter((p) => p.repoUrl)).toHaveLength(0);
  });
});
