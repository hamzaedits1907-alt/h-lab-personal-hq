import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_ID, MIGRATIONS_DIR, USER_ID, as, createDb, createUsers, failure, migrationFiles } from './harness';

let db: PGlite;

const P1 = '00000000-0000-4000-8000-000000000201';
const MEDIA_A = '33333333-3333-4333-8333-333333333333';
const MEDIA_B = '44444444-4444-4444-8444-444444444444';

const newProject = (slug: string) => `insert into public.projects (slug, title) values ('${slug}', 'Title')`;

beforeAll(async () => {
  db = await createDb();
  await createUsers(db);
});
afterAll(async () => {
  await db.close();
});

describe('migrations and seed', () => {
  it('applies every migration, in order, including the starter content', async () => {
    expect(migrationFiles()).toEqual([
      '0001_core_schema.sql',
      '0002_storage.sql',
      '0003_seed_starter_content.sql',
      '0004_project_repo_url.sql',
    ]);
    const s = await db.query<{ n: number }>('select count(*)::int n from public.projects');
    expect(s.rows[0]?.n).toBe(7);
    const b = await db.query<{ n: number }>('select count(*)::int n from public.content_blocks');
    expect(b.rows[0]?.n).toBe(5);
    const st = await db.query<{ n: number }>('select count(*)::int n from public.site_settings');
    expect(st.rows[0]?.n).toBe(1);
  });

  it('seed is non-destructive: re-running it never overwrites edited content', async () => {
    await db.exec(`update public.projects set title = 'Edited by owner' where id = '${P1}'`);
    await db.exec(`delete from public.projects where slug = 'edward'`);
    await db.exec(`update public.site_settings set site_name = 'Renamed'`);
    await db.exec(readFileSync(join(MIGRATIONS_DIR, '0003_seed_starter_content.sql'), 'utf8'));
    const p = await db.query<{ title: string }>(`select title from public.projects where id = '${P1}'`);
    expect(p.rows[0]?.title).toBe('Edited by owner');
    const n = await db.query<{ n: number }>(`select count(*)::int n from public.projects`);
    expect(n.rows[0]?.n).toBe(6); // the deleted one did NOT come back
    const s = await db.query<{ site_name: string }>(`select site_name from public.site_settings`);
    expect(s.rows[0]?.site_name).toBe('Renamed');
    // restore for later tests
    await db.exec(`update public.projects set title = 'Project Genius' where id = '${P1}'`);
    await db.exec(`update public.site_settings set site_name = 'H/LAB'`);
  });
});

describe('anonymous visitors', () => {
  beforeEach(async () => {
    await db.exec(`update public.projects set is_visible = true; update public.content_blocks set is_visible = true;`);
  });

  it('can read published projects, blocks and settings', async () => {
    const r = await as(db, 'anon', () => db.query('select count(*)::int n from public.projects'));
    expect((r.rows[0] as { n: number }).n).toBeGreaterThan(0);
    const s = await as(db, 'anon', () => db.query('select * from public.site_settings'));
    expect(s.rows).toHaveLength(1);
  });

  it('cannot see hidden projects or hidden blocks', async () => {
    await db.exec(`update public.projects set is_visible = false where id = '${P1}'`);
    await db.exec(`update public.content_blocks set is_visible = false where type = 'about'`);
    const p = await as(db, 'anon', () => db.query(`select id from public.projects where id = '${P1}'`));
    expect(p.rows).toHaveLength(0);
    const all = await as(db, 'anon', () => db.query(`select id from public.projects`));
    expect(all.rows).toHaveLength(5); // 6 left after the seed test deleted one, minus the hidden one
    const b = await as(db, 'anon', () => db.query(`select id from public.content_blocks where type = 'about'`));
    expect(b.rows).toHaveLength(0);
  });

  it('cannot write anything', async () => {
    expect(await failure(db, 'anon', newProject('hacked'))).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `update public.projects set title = 'x'`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `delete from public.projects`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `update public.site_settings set site_name = 'x'`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `insert into public.media (storage_path, mime_type, size_bytes) values ('a/b.png','image/png',1)`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `insert into public.content_blocks (type, anchor, admin_label) values ('text','x','x')`)).toMatch(/permission denied/i);
  });

  it('cannot read private tables or call admin RPCs', async () => {
    expect(await failure(db, 'anon', `select * from public.admins`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `select * from public.change_log`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `select public.reorder_projects(array[]::uuid[])`)).toMatch(/permission denied/i);
    expect(await failure(db, 'anon', `select * from public.media_usage('${MEDIA_A}')`)).toMatch(/permission denied/i);
    const r = await as(db, 'anon', () => db.query('select public.is_admin() as a'));
    expect((r.rows[0] as { a: boolean }).a).toBe(false);
  });
});

describe('authenticated but NOT an admin', () => {
  it('sees only published content', async () => {
    await db.exec(`update public.projects set is_visible = false where id = '${P1}'`);
    const r = await as(db, 'user', () => db.query(`select id from public.projects where id = '${P1}'`));
    expect(r.rows).toHaveLength(0);
    await db.exec(`update public.projects set is_visible = true where id = '${P1}'`);
  });

  it('cannot insert (RLS) and updates/deletes silently affect zero rows', async () => {
    expect(await failure(db, 'user', newProject('sneaky'))).toMatch(/row-level security/i);
    const up = await as(db, 'user', () => db.query(`update public.projects set title = 'owned' returning id`));
    expect(up.rows).toHaveLength(0);
    const del = await as(db, 'user', () => db.query(`delete from public.projects returning id`));
    expect(del.rows).toHaveLength(0);
    const su = await as(db, 'user', () => db.query(`update public.site_settings set site_name = 'owned' returning id`));
    expect(su.rows).toHaveLength(0);
    const t = await db.query<{ title: string }>(`select title from public.projects where id = '${P1}'`);
    expect(t.rows[0]?.title).toBe('Project Genius');
  });

  it('cannot grant themselves admin', async () => {
    expect(await failure(db, 'user', `insert into public.admins (user_id) values ('${USER_ID}')`)).toMatch(/permission denied/i);
    expect(await failure(db, 'user', `update public.admins set user_id = '${USER_ID}'`)).toMatch(/permission denied/i);
    expect(await failure(db, 'user', `delete from public.admins`)).toMatch(/permission denied/i);
    const r = await as(db, 'user', () => db.query('select public.is_admin() as a'));
    expect((r.rows[0] as { a: boolean }).a).toBe(false);
    const own = await as(db, 'user', () => db.query('select * from public.admins'));
    expect(own.rows).toHaveLength(0);
  });

  it('cannot read the change log, use admin RPCs, or touch media', async () => {
    const log = await as(db, 'user', () => db.query('select * from public.change_log'));
    expect(log.rows).toHaveLength(0);
    expect(await failure(db, 'user', `select public.reorder_projects(array['${P1}']::uuid[])`)).toMatch(/not authorized/i);
    expect(await failure(db, 'user', `select public.reorder_blocks(array[]::uuid[])`)).toMatch(/not authorized/i);
    expect(await failure(db, 'user', `select public.delete_media('${MEDIA_A}')`)).toMatch(/not authorized/i);
    expect(await failure(db, 'user', `insert into public.media (storage_path, mime_type, size_bytes) values ('a/b.png','image/png',1)`)).toMatch(/row-level security/i);
  });
});

describe('the admin', () => {
  it('is recognised, and can read their own admin row only', async () => {
    const r = await as(db, 'admin', () => db.query('select public.is_admin() as a'));
    expect((r.rows[0] as { a: boolean }).a).toBe(true);
    const own = await as(db, 'admin', () => db.query('select user_id from public.admins'));
    expect(own.rows).toEqual([{ user_id: ADMIN_ID }]);
  });

  it('can still not create admins through the API', async () => {
    expect(await failure(db, 'admin', `insert into public.admins (user_id) values ('${USER_ID}')`)).toMatch(/permission denied/i);
  });

  it('sees hidden items', async () => {
    await db.exec(`update public.projects set is_visible = false where id = '${P1}'`);
    const r = await as(db, 'admin', () => db.query(`select id from public.projects where id = '${P1}'`));
    expect(r.rows).toHaveLength(1);
    await db.exec(`update public.projects set is_visible = true where id = '${P1}'`);
  });

  it('can create, update and delete projects', async () => {
    const created = await as(db, 'admin', () => db.query(`${newProject('my-new-one')} returning id`));
    const id = (created.rows[0] as { id: string }).id;
    const up = await as(db, 'admin', () => db.query(`update public.projects set title = 'Renamed' where id = '${id}' returning title`));
    expect(up.rows[0]).toEqual({ title: 'Renamed' });
    const del = await as(db, 'admin', () => db.query(`delete from public.projects where id = '${id}' returning id`));
    expect(del.rows).toHaveLength(1);
  });

  it('can update settings but not insert or delete the singleton', async () => {
    const up = await as(db, 'admin', () => db.query(`update public.site_settings set accent = 'lavender' returning accent`));
    expect(up.rows[0]).toEqual({ accent: 'lavender' });
    await db.exec(`update public.site_settings set accent = 'mint'`);
    expect(await failure(db, 'admin', `insert into public.site_settings (id) values (2)`)).toMatch(/permission denied/i);
    expect(await failure(db, 'admin', `delete from public.site_settings`)).toMatch(/permission denied/i);
  });

  it('can persist ordering atomically via reorder_projects', async () => {
    const ids = (await db.query<{ id: string }>(`select id from public.projects order by position`)).rows.map((r) => r.id);
    const reversed = [...ids].reverse();
    await as(db, 'admin', () => db.query(`select public.reorder_projects($1::uuid[])`, [reversed]));
    const after = (await db.query<{ id: string }>(`select id from public.projects order by position`)).rows.map((r) => r.id);
    expect(after).toEqual(reversed);
    await db.query(`select public.reorder_projects($1::uuid[])`, [ids]);
  });

  it('records changes in the private change log', async () => {
    await as(db, 'admin', () => db.query(`update public.projects set title = 'Logged' where id = '${P1}'`));
    await db.exec(`update public.projects set title = 'Project Genius' where id = '${P1}'`);
    const log = await as(db, 'admin', () => db.query(`select table_name, action, summary, actor from public.change_log order by id desc limit 3`));
    const rows = log.rows as { table_name: string; action: string; summary: string; actor: string | null }[];
    const mine = rows.find((r) => r.summary === 'Logged');
    expect(mine).toMatchObject({ table_name: 'projects', action: 'update', actor: ADMIN_ID });
  });
});

describe('data validation constraints (even for the admin)', () => {
  const reject = async (sql: string, re: RegExp = /violates check constraint/i) =>
    expect(await failure(db, 'admin', sql)).toMatch(re);

  it('rejects unknown project statuses', () => reject(`insert into public.projects (slug, title, status) values ('s1', 't', 'bogus')`));
  it('rejects bad slugs', () => reject(newProject('Bad Slug!')));
  it('rejects non-https and script project URLs', async () => {
    await reject(`insert into public.projects (slug,title,url) values ('u1','t','http://example.com')`);
    await reject(`insert into public.projects (slug,title,url) values ('u2','t','javascript:alert(1)')`);
    await reject(`insert into public.projects (slug,title,url) values ('u3','t','https://exa mple.com')`);
  });
  it('accepts https project URLs', async () => {
    const e = await failure(db, 'admin', `insert into public.projects (slug,title,url) values ('u-ok','t','https://example.com/x?y=1')`);
    expect(e).toBeNull();
    await db.exec(`delete from public.projects where slug = 'u-ok'`);
  });
  it('rejects too many or empty tags', async () => {
    await reject(`insert into public.projects (slug,title,tags) values ('t1','t', array['1','2','3','4','5','6','7','8','9','10','11','12','13'])`);
    await reject(`insert into public.projects (slug,title,tags) values ('t2','t', array[' '])`);
  });
  it('rejects unknown block types and unknown content keys', async () => {
    await reject(`insert into public.content_blocks (type, anchor, admin_label) values ('script','x1','x')`);
    await reject(`insert into public.content_blocks (type, anchor, admin_label, content) values ('text','x2','x','{"html":"<script>1</script>"}')`);
    await reject(`insert into public.content_blocks (type, anchor, admin_label, content) values ('text','x3','x','[]')`);
    await reject(`insert into public.content_blocks (type, anchor, admin_label, content) values ('text','Bad Anchor','x','{}')`);
  });
  it('accepts valid block content', async () => {
    const e = await failure(db, 'admin', `insert into public.content_blocks (type, anchor, admin_label, content) values ('text','ok-block','Ok','{"heading":{"en":"Hi"},"body":{"en":"Text"}}')`);
    expect(e).toBeNull();
    await db.exec(`delete from public.content_blocks where anchor = 'ok-block'`);
  });
  it('rejects invalid appearance values and an un-enabled default language', async () => {
    await reject(`update public.site_settings set accent = 'hotpink'`);
    await reject(`update public.site_settings set theme = 'url(javascript:1)'`);
    await reject(`update public.site_settings set languages = array['en'], default_language = 'tr'`);
    await reject(`update public.site_settings set languages = array['de']`);
    await reject(`update public.site_settings set contact_email = 'not-an-email'`);
  });
});

describe('media protection', () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.media (id, storage_path, mime_type, size_bytes) values
        ('${MEDIA_A}', 'uploads/a.webp', 'image/webp', 1000),
        ('${MEDIA_B}', 'uploads/b.webp', 'image/webp', 1000);
    `);
  });

  it('rejects bad file metadata', async () => {
    const bad = (path: string, mime: string, size: number) =>
      failure(db, 'admin', `insert into public.media (storage_path, mime_type, size_bytes) values ('${path}', '${mime}', ${size})`);
    expect(await bad('uploads/x.svg', 'image/svg+xml', 10)).toMatch(/check constraint/i);
    expect(await bad('uploads/x.png', 'image/png', 6 * 1024 * 1024)).toMatch(/check constraint/i);
    expect(await bad('../etc/passwd', 'image/png', 10)).toMatch(/check constraint/i);
    expect(await bad('Uploads/UPPER.png', 'image/png', 10)).toMatch(/check constraint/i);
  });

  it('refuses to delete media still used as a project cover (and says so)', async () => {
    await db.exec(`update public.projects set cover_media_id = '${MEDIA_A}' where id = '${P1}'`);
    const usage = await as(db, 'admin', () => db.query(`select * from public.media_usage('${MEDIA_A}')`));
    expect(usage.rows).toEqual([{ kind: 'project', ref_id: P1, label: 'Project Genius' }]);
    expect(await failure(db, 'admin', `select public.delete_media('${MEDIA_A}')`)).toMatch(/still in use/i);
    expect(await failure(db, 'admin', `delete from public.media where id = '${MEDIA_A}'`)).toMatch(/foreign key/i);
  });

  it('refuses to delete media referenced from block content (no FK exists for that)', async () => {
    await db.exec(`update public.projects set cover_media_id = null where id = '${P1}'`);
    await db.exec(`insert into public.content_blocks (type, anchor, admin_label, content) values ('gallery','gal','Gallery','{"images":[{"mediaId":"${MEDIA_B}"}]}')`);
    const usage = await as(db, 'admin', () => db.query(`select kind, label from public.media_usage('${MEDIA_B}')`));
    expect(usage.rows).toEqual([{ kind: 'block', label: 'Gallery' }]);
    expect(await failure(db, 'admin', `select public.delete_media('${MEDIA_B}')`)).toMatch(/still in use/i);
  });

  it('refuses to delete media used by settings', async () => {
    await db.exec(`update public.site_settings set og_media_id = '${MEDIA_A}'`);
    expect(await failure(db, 'admin', `select public.delete_media('${MEDIA_A}')`)).toMatch(/still in use/i);
    await db.exec(`update public.site_settings set og_media_id = null`);
  });

  it('deletes unreferenced media and returns the path to remove from storage', async () => {
    await db.exec(`delete from public.content_blocks where anchor = 'gal'`);
    const r = await as(db, 'admin', () => db.query(`select public.delete_media('${MEDIA_B}') as p`));
    expect((r.rows[0] as { p: string }).p).toBe('uploads/b.webp');
    const left = await db.query(`select id from public.media where id = '${MEDIA_B}'`);
    expect(left.rows).toHaveLength(0);
  });
});

describe('storage policies for the site-media bucket', () => {
  const insert = (bucket: string) => `insert into storage.objects (bucket_id, name) values ('${bucket}', 'uploads/file-${Math.random().toString(36).slice(2)}.webp')`;

  it('creates a public bucket limited to 5 MB images', async () => {
    const r = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-media'`,
    );
    expect(r.rows[0]?.public).toBe(true);
    expect(Number(r.rows[0]?.file_size_limit)).toBe(5 * 1024 * 1024);
    expect(r.rows[0]?.allowed_mime_types).not.toContain('image/svg+xml');
  });

  it('blocks uploads from anonymous visitors and ordinary signed-in users', async () => {
    expect(await failure(db, 'anon', insert('site-media'))).toMatch(/row-level security/i);
    expect(await failure(db, 'user', insert('site-media'))).toMatch(/row-level security/i);
  });

  it('allows the admin to upload to site-media only', async () => {
    expect(await failure(db, 'admin', insert('site-media'))).toBeNull();
    await db.exec(`insert into storage.buckets (id, name) values ('other', 'other')`);
    expect(await failure(db, 'admin', insert('other'))).toMatch(/row-level security/i);
  });

  it('only lets the admin replace and delete objects', async () => {
    const touched = async (actor: 'anon' | 'user' | 'admin', sql: string) =>
      (await as(db, actor, () => db.query(sql))).rows.length;
    // anon has no SELECT policy, so it cannot enumerate (list) the bucket
    expect(await touched('anon', `select * from storage.objects`)).toBe(0);
    expect(await touched('user', `select * from storage.objects`)).toBe(0);
    expect(await touched('user', `update storage.objects set name = 'uploads/x.webp' returning id`)).toBe(0);
    expect(await touched('user', `delete from storage.objects returning id`)).toBe(0);
    expect(await touched('admin', `select * from storage.objects`)).toBeGreaterThan(0);
    expect(await touched('admin', `delete from storage.objects where bucket_id = 'site-media' returning id`)).toBeGreaterThan(0);
  });
});

describe('sanity', () => {
  it('has the expected users', () => {
    expect(ADMIN_ID).not.toBe(USER_ID);
  });
});
