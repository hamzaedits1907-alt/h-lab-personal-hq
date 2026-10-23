import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedBlocks, seedSettings } from '@/content/seed';
import { MIGRATIONS_DIR, as, createDb, createUsers, failure } from './harness';

const migration = () => readFileSync(join(MIGRATIONS_DIR, '0004_project_repo_url.sql'), 'utf8');
const ABOUT = '00000000-0000-4000-8000-000000000103';
const GENIUS = '00000000-0000-4000-8000-000000000201';

// The starter copy that shipped in the first release (before this change).
const OLD_ABOUT_BODY = {
  en: 'H/LAB is where I keep my personal projects: AI tools, desktop software, games and simulations. Everything here is a work in progress.',
  tr: 'H/LAB, kişisel projelerimi topladığım yer: yapay zekâ araçları, masaüstü yazılımları, oyunlar ve simülasyonlar. Buradaki her şey yapım aşamasında.',
};
const OLD_VISIT = { en: 'Visit project', tr: 'Projeye git' };

describe('migration 0004: project source-code link', () => {
  describe('upgrading a database created by the previous release', () => {
    let db: PGlite;
    beforeAll(async () => {
      db = await createDb({ skip: ['0004'] }); // 0001-0003 only
      await createUsers(db);
    });
    afterAll(async () => db.close());

    it('has no repo_url column before the migration', async () => {
      const cols = await db.query(`select 1 from information_schema.columns where table_name = 'projects' and column_name = 'repo_url'`);
      expect(cols.rows).toHaveLength(0);
    });

    it('keeps every existing project readable and unchanged, with repo_url NULL', async () => {
      const before = await db.query<{ id: string; title: string }>(`select id, title from public.hlab_projects order by position`);
      await db.exec(migration());
      const after = await db.query<{ id: string; title: string; repo_url: string | null }>(
        `select id, title, repo_url from public.hlab_projects order by position`,
      );
      expect(after.rows.map(({ id, title }) => ({ id, title }))).toEqual(before.rows);
      expect(after.rows.every((r) => r.repo_url === null)).toBe(true);
    });

    it('sets the verified live links for two starter projects, only where none exists', async () => {
      const urls = await db.query<{ title: string; url: string | null }>(`select title, url from public.hlab_projects where url is not null order by position`);
      expect(urls.rows).toEqual([
        { title: 'Project Genius', url: 'https://project-genius.netlify.app/' },
        { title: 'Lufthansa Launcher', url: 'https://lufthansa-connect-ptfs.netlify.app/' },
      ]);
      // an owner-set link is never replaced
      await db.exec(`update public.hlab_projects set url = 'https://mine.example/' where title = 'Project Genius'`);
      await db.exec(migration());
      const g = await db.query<{ url: string }>(`select url from public.hlab_projects where title = 'Project Genius'`);
      expect(g.rows[0]?.url).toBe('https://mine.example/');
    });

    it('is idempotent', async () => {
      await db.exec(migration());
      await db.exec(migration());
    });
  });

  describe('constraints and access', () => {
    let db: PGlite;
    beforeAll(async () => {
      db = await createDb();
      await createUsers(db);
    });
    afterAll(async () => db.close());

    it('accepts https links and NULL', async () => {
      expect(await failure(db, 'admin', `update public.hlab_projects set repo_url = 'https://github.com/example/repo' where id = '${GENIUS}'`)).toBeNull();
      expect(await failure(db, 'admin', `update public.hlab_projects set repo_url = null where id = '${GENIUS}'`)).toBeNull();
    });

    it('rejects non-https, script and malformed links', async () => {
      const bad = ['http://github.com/x', 'javascript:alert(1)', 'git@github.com:x/y.git', 'https://exa mple.com', 'ftp://x.example', `https://${'a'.repeat(500)}.com`];
      for (const value of bad) {
        const err = await failure(db, 'admin', `update public.hlab_projects set repo_url = '${value}' where id = '${GENIUS}'`);
        expect(err, value).toMatch(/check constraint/i);
      }
    });

    it('only the admin can change it; visitors can read it for published projects only', async () => {
      await db.exec(`update public.hlab_projects set repo_url = 'https://github.com/example/repo' where id = '${GENIUS}'`);
      expect(await failure(db, 'anon', `update public.hlab_projects set repo_url = 'https://evil.example'`)).toMatch(/permission denied/i);
      const user = await as(db, 'user', () => db.query(`update public.hlab_projects set repo_url = 'https://evil.example' returning id`));
      expect(user.rows).toHaveLength(0);
      const seen = await as(db, 'anon', () => db.query<{ repo_url: string }>(`select repo_url from public.hlab_projects where id = '${GENIUS}'`));
      expect(seen.rows[0]?.repo_url).toBe('https://github.com/example/repo');
      await db.exec(`update public.hlab_projects set is_visible = false where id = '${GENIUS}'`);
      const hidden = await as(db, 'anon', () => db.query(`select repo_url from public.hlab_projects where id = '${GENIUS}'`));
      expect(hidden.rows).toHaveLength(0);
      await db.exec(`update public.hlab_projects set is_visible = true where id = '${GENIUS}'`);
    });
  });

  describe('starter copy', () => {
    const about = seedBlocks.find((b) => b.type === 'about')!;

    /** A database as the previous release left it: old About copy, old label, no new labels. */
    const previousRelease = async () => {
      const db = await createDb({ skip: ['0004'] });
      await db.exec(`
        update public.hlab_content_blocks
           set content = jsonb_set(content, '{body}', $j$${JSON.stringify(OLD_ABOUT_BODY)}$j$::jsonb)
         where id = '${ABOUT}';
        update public.hlab_site_settings
           set ui = jsonb_set(ui, '{labels}', ((ui->'labels') - 'sourceCode'::text - 'newTab'::text) || jsonb_build_object('visitProject', $j$${JSON.stringify(OLD_VISIT)}$j$::jsonb));
      `);
      return db;
    };

    it('upgrades unedited starter copy to the new About text and labels', async () => {
      const db = await previousRelease();
      await db.exec(migration());
      const r = await db.query<{ content: unknown }>(`select content from public.hlab_content_blocks where id = '${ABOUT}'`);
      expect(r.rows[0]?.content).toEqual(about.content); // exactly what seed.ts defines: no drift
      const s = await db.query<{ ui: { labels: Record<string, unknown> } }>(`select ui from public.hlab_site_settings`);
      expect(s.rows[0]?.ui.labels).toMatchObject({
        visitProject: seedSettings.ui.labels.visitProject,
        sourceCode: seedSettings.ui.labels.sourceCode,
        newTab: seedSettings.ui.labels.newTab,
      });
      await db.close();
    });

    it('never overwrites copy the owner has edited', async () => {
      const db = await previousRelease();
      await db.exec(`
        update public.hlab_content_blocks set content = jsonb_set(content, '{body}', '{"en":"My own words.","tr":"Kendi sözlerim."}') where id = '${ABOUT}';
        update public.hlab_site_settings set ui = jsonb_set(ui, '{labels,visitProject}', '{"en":"Go see it","tr":"Git bak"}');
      `);
      const snapshot = async () =>
        (await db.query(`select content from public.hlab_content_blocks where id = '${ABOUT}'`)).rows[0];
      const before = await snapshot();
      await db.exec(migration());
      expect(await snapshot()).toEqual(before); // the whole About block is untouched
      expect((before as { content: { body: unknown } }).content.body).toEqual({ en: 'My own words.', tr: 'Kendi sözlerim.' });
      const s = await db.query<{ v: unknown }>(`select ui -> 'labels' -> 'visitProject' as v from public.hlab_site_settings`);
      expect(s.rows[0]?.v).toEqual({ en: 'Go see it', tr: 'Git bak' });
      await db.close();
    });

    it('fresh installs get the new copy straight from the seed', async () => {
      const db = await createDb();
      const r = await db.query<{ content: unknown }>(`select content from public.hlab_content_blocks where id = '${ABOUT}'`);
      expect(r.rows[0]?.content).toEqual(about.content);
      await db.close();
    });
  });
});
