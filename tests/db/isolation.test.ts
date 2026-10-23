import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_ID, MIGRATIONS_DIR, USER_ID, as, createDb, failure } from './harness';

/**
 * H/LAB must coexist with another application that shares the same Supabase
 * project, without touching any of that application's objects. These tests build
 * a database that already belongs to someone else (same generic names H/LAB used
 * to use) and install H/LAB next to it.
 */
const FOREIGN = `
  create table public.profiles (id uuid primary key, display text);
  create table public.admin_users (user_id uuid primary key);
  create table public.projects (id int primary key, owner_note text);
  create table public.media (id int primary key, owner_note text);
  insert into public.projects values (1, 'belongs to the other app');
  insert into public.admin_users values ('${USER_ID}');
  create function public.is_admin() returns boolean language sql stable as $$ select exists (select 1 from public.admin_users where user_id = auth.uid()) $$;
  create function public.set_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('site-media', 'site-media', false, 1234, array['application/pdf']);
  insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);
`;

const sql = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

describe('sharing a database with another application', () => {
  it('installs next to same-named foreign tables and functions', async () => {
    const db = await createDb({ before: FOREIGN });
    expect((await db.query(`select 1 from public.hlab_site_settings`)).rows).toHaveLength(1);
    await db.close();
  });

  it('leaves every foreign object exactly as it was', async () => {
    const db = await createDb({ before: FOREIGN });
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'projects' order by 1`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(['id', 'owner_note']);
    expect((await db.query(`select * from public.projects`)).rows).toEqual([{ id: 1, owner_note: 'belongs to the other app' }]);
    const fn = await db.query<{ src: string }>(`select prosrc as src from pg_proc where proname = 'is_admin' and pronamespace = 'public'::regnamespace`);
    expect(fn.rows).toHaveLength(1);
    expect(fn.rows[0]?.src).toContain('admin_users');
    const b = await db.query<{ id: string; public: boolean; file_size_limit: string }>(
      `select id, public, file_size_limit from storage.buckets where id in ('site-media', 'attachments') order by id`,
    );
    expect(b.rows.map((r) => [r.id, r.public])).toEqual([['attachments', false], ['site-media', false]]);
    expect(Number(b.rows[1]?.file_size_limit)).toBe(1234);
    await db.close();
  });

  it('every object H/LAB creates is hlab-prefixed (tables, functions, bucket, storage policies)', async () => {
    const db = await createDb({ before: FOREIGN });
    const tables = await db.query<{ relname: string }>(
      `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('profiles', 'admin_users', 'projects', 'media') order by 1`,
    );
    expect(tables.rows.length).toBe(5 + 1);
    expect(tables.rows.every((r) => r.relname.startsWith('hlab_'))).toBe(true);
    const fns = await db.query<{ proname: string }>(
      `select proname from pg_proc where pronamespace = 'public'::regnamespace and proname not in ('is_admin', 'set_updated_at')`,
    );
    expect(fns.rows.length).toBeGreaterThan(5);
    expect(fns.rows.every((r) => r.proname.startsWith('hlab_'))).toBe(true);
    const pol = await db.query<{ policyname: string }>(`select policyname from pg_policies where tablename = 'objects'`);
    expect(pol.rows.length).toBe(4);
    expect(pol.rows.every((r) => r.policyname.startsWith('hlab: '))).toBe(true);
    const bucket = await db.query<{ id: string }>(`select id from storage.buckets where id = 'hlab-media'`);
    expect(bucket.rows).toHaveLength(1);
    await db.close();
  });

  it('the other app admin gets NO H/LAB admin rights, and the H/LAB admin gets none in the other app', async () => {
    const db = await createDb({ before: FOREIGN });
    await db.exec(
      `insert into auth.users (id, email) values ('${ADMIN_ID}', 'owner@example.com'), ('${USER_ID}', 'other-admin@example.com') on conflict do nothing; insert into public.hlab_admins (user_id) values ('${ADMIN_ID}');`,
    );
    // USER_ID is an admin of the other app (public.is_admin() = true) but not of H/LAB.
    expect((await as(db, 'user', () => db.query(`select public.is_admin() a`))).rows[0]).toEqual({ a: true });
    expect((await as(db, 'user', () => db.query(`select public.hlab_is_admin() a`))).rows[0]).toEqual({ a: false });
    const upd = await as(db, 'user', () => db.query(`update public.hlab_site_settings set site_name = 'pwn' returning id`));
    expect(upd.rows).toHaveLength(0);
    expect((await db.query<{ site_name: string }>(`select site_name from public.hlab_site_settings`)).rows[0]?.site_name).toBe('H/LAB');
    expect(await failure(db, 'user', `insert into public.hlab_projects (slug, title) values ('x', 'x')`)).toMatch(/row-level security/i);
    expect(await failure(db, 'user', `insert into storage.objects (bucket_id, name) values ('hlab-media', 'x/y.png')`)).toMatch(/row-level security/i);
    // The H/LAB admin is not an admin of the other app.
    expect((await as(db, 'admin', () => db.query(`select public.is_admin() a`))).rows[0]).toEqual({ a: false });
    expect((await as(db, 'admin', () => db.query(`select public.hlab_is_admin() a`))).rows[0]).toEqual({ a: true });
    await db.close();
  });

  it('keeps an unreferenced upload private, and reveals media only once it is published', async () => {
    const db = await createDb({ before: FOREIGN });
    const M = '33333333-3333-4333-8333-333333333333';
    await db.exec(`insert into public.hlab_media (id, storage_path, mime_type, size_bytes) values ('${M}', 'uploads/a.png', 'image/png', 10)`);
    const anon = () => as(db, 'anon', () => db.query(`select id from public.hlab_media`));
    expect((await anon()).rows).toHaveLength(0);
    await db.exec(`update public.hlab_projects set cover_media_id = '${M}', is_visible = false where slug = 'jarvis'`);
    expect((await anon()).rows).toHaveLength(0);
    await db.exec(`update public.hlab_projects set is_visible = true where slug = 'jarvis'`);
    expect((await anon()).rows).toHaveLength(1);
    await db.close();
  });

  it('a second install is refused by the guard without changing anything', async () => {
    const db = await createDb({ before: FOREIGN });
    await expect(db.exec(sql('0001_core_schema.sql'))).rejects.toThrow(/aborted.*Nothing was changed/s);
    await db.close();
  });

  it('0004 refuses to run when the H/LAB tables are missing (never touches a foreign projects table)', async () => {
    const db = await createDb({ before: FOREIGN, skip: ['0001', '0002', '0003', '0004'] });
    await expect(db.exec(sql('0004_project_repo_url.sql'))).rejects.toThrow(/not the H\/LAB table/);
    expect((await db.query(`select 1 from information_schema.columns where table_name = 'projects' and column_name = 'repo_url'`)).rows).toHaveLength(0);
    await db.close();
  });

  it('still installs cleanly into an empty database', async () => {
    const db = await createDb();
    expect((await db.query(`select 1 from public.hlab_site_settings`)).rows).toHaveLength(1);
    await db.close();
  });
});
