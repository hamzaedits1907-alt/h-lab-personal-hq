import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Runs the real migrations in an in-process Postgres (PGlite) with just enough
 * of Supabase stubbed to exercise Row-Level Security: the anon/authenticated
 * roles, auth.users/auth.uid() and storage.buckets/objects.
 *
 * What this does NOT cover: PostgREST, GoTrue (real JWT handling) and the real
 * Storage API. It tests the SQL policies, which are the security boundary.
 */

export const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  -- Supabase grants new public tables to these roles by default; reproduce that
  -- so the migrations' explicit REVOKEs are actually tested.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid default auth.uid()
  );
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function createDb(opts: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    if (file.includes('seed') && opts.seed === false) continue;
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

export const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID = '22222222-2222-4222-8222-222222222222';

export async function createUsers(db: PGlite): Promise<void> {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN_ID}', 'owner@example.com'),
      ('${USER_ID}', 'stranger@example.com');
    insert into public.admins (user_id) values ('${ADMIN_ID}');
  `);
}

export type Actor = 'anon' | 'user' | 'admin';

/** Run `fn` as an API role. Always resets to the superuser afterwards. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const role = actor === 'anon' ? 'anon' : 'authenticated';
  const sub = actor === 'admin' ? ADMIN_ID : actor === 'user' ? USER_ID : '';
  await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

/** Returns the error message when the query is rejected, or null when it succeeds. */
export async function failure(db: PGlite, actor: Actor, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await as(db, actor, () => db.query(sql, params));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
