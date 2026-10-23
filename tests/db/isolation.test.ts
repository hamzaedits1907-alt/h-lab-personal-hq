import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR, createDb } from './harness';

/**
 * H/LAB must never modify another application that shares the same Supabase
 * project. These tests simulate a database that already belongs to someone else.
 */
const FOREIGN = `
  create table public.projects (id int primary key, owner_note text);
  insert into public.projects values (1, 'belongs to the other app');
  create function public.is_admin() returns text language sql as $$ select 'foreign'::text $$;
`;

const sql = (file: string) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

describe('sharing a database with another application', () => {
  it('aborts before changing anything when same-named objects already exist', async () => {
    await expect(createDb({ before: FOREIGN })).rejects.toThrow(/aborted.*Nothing was changed/s);
  });

  it.each(['admins', 'media', 'site_settings', 'content_blocks', 'projects', 'change_log'])(
    'detects a pre-existing public.%s table',
    async (table) => {
      await expect(createDb({ before: `create table public.${table} (id int);` })).rejects.toThrow(/aborted/);
    },
  );

  it.each(['is_admin', 'set_updated_at', 'media_usage'])('detects a pre-existing public.%s() function', async (fn) => {
    await expect(
      createDb({ before: `create function public.${fn}() returns int language sql as $$ select 1 $$;` }),
    ).rejects.toThrow(/aborted/);
  });

  it('leaves the other application\'s table and function exactly as they were', async () => {
    // Run the guard directly on a database holding only the foreign objects.
    const db = await createDb({ before: FOREIGN, skip: ['0001', '0002', '0003', '0004'] });
    await expect(db.exec(sql('0001_core_schema.sql'))).rejects.toThrow(/aborted/);
    const cols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'projects' order by 1`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual(['id', 'owner_note']);
    expect((await db.query(`select * from public.projects`)).rows).toEqual([{ id: 1, owner_note: 'belongs to the other app' }]);
    expect((await db.query<{ v: string }>(`select public.is_admin() as v`)).rows[0]?.v).toBe('foreign');
    const created = await db.query(`select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('content_blocks', 'media', 'admins', 'site_settings', 'change_log')`);
    expect(created.rows).toHaveLength(0);
    await db.close();
  });

  it('0004 refuses to add a column to a projects table that is not H/LAB\'s', async () => {
    const db = await createDb({ before: FOREIGN, skip: ['0001', '0002', '0003', '0004'] });
    await expect(db.exec(sql('0004_project_repo_url.sql'))).rejects.toThrow(/not the H\/LAB table/);
    const col = await db.query(`select 1 from information_schema.columns where table_name = 'projects' and column_name = 'repo_url'`);
    expect(col.rows).toHaveLength(0);
    await db.close();
  });

  it('never alters an existing storage bucket named site-media', async () => {
    const db = await createDb({
      before: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('site-media', 'site-media', false, 1234, array['application/pdf']);`,
    });
    const b = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-media'`,
    );
    expect(b.rows[0]?.public).toBe(false);
    expect(Number(b.rows[0]?.file_size_limit)).toBe(1234);
    expect(b.rows[0]?.allowed_mime_types).toEqual(['application/pdf']);
    await db.close();
  });

  it('still installs cleanly into an empty database', async () => {
    const db = await createDb();
    expect((await db.query(`select 1 from public.site_settings`)).rows).toHaveLength(1);
    await db.close();
  });
});
