-- H/LAB core schema.
-- Run order: 0001 (this file) -> 0002 storage -> 0003 starter content.
-- Everything here is least-privilege: anon/authenticated start with NO table
-- privileges and are granted only what the app needs. Row-Level Security is the
-- real gate; the admin UI merely reflects it.
--
-- SHARED-PROJECT SAFE. Every object H/LAB creates is prefixed `hlab_` (tables, functions,
-- indexes, triggers) or `hlab:` (policies) or `hlab-media` (storage bucket), and admin rights
-- come from `hlab_admins` / `hlab_is_admin()`, independent of any other application's admin
-- tables. The guard below aborts, before changing anything, if any of those names already
-- exist, so it can never overwrite or alter another application's objects. Nothing here
-- touches auth settings, other tables, other functions or other buckets.

do $guard$
begin
  if exists (
       select 1
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p', 'v', 'm', 'f')
          and c.relname in ('hlab_admins', 'hlab_media', 'hlab_site_settings', 'hlab_content_blocks', 'hlab_projects', 'hlab_change_log')
     )
     or exists (
       select 1
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('hlab_is_admin', 'hlab_set_updated_at', 'hlab_text_array_ok', 'hlab_block_content_valid', 'hlab_log_change',
                            'hlab_reorder_projects', 'hlab_reorder_blocks', 'hlab_media_usage', 'hlab_delete_media')
     )
  then
    raise exception 'H/LAB migration aborted: this database already has tables or functions with the same names in the public schema (this migration already ran, or the names are taken). Nothing was changed.'
      using errcode = '42710';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.hlab_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- true when every element is a non-empty string no longer than p_max_len and
-- the array has at most p_max_items elements.
create or replace function public.hlab_text_array_ok(p_arr text[], p_max_items int, p_max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_arr), 0) <= p_max_items
     and not exists (
       select 1 from unnest(p_arr) as t(v)
       where v is null or char_length(btrim(v)) = 0 or char_length(v) > p_max_len
     );
$$;

-- ---------------------------------------------------------------------------
-- Admin identity. Separate from any profile data; clients can only read their
-- OWN row. There is deliberately no INSERT/UPDATE/DELETE policy or grant, so
-- nobody can grant themselves admin through the API. Rows are created by the
-- owner in the SQL editor (see docs/ADMIN_GUIDE.md).
-- ---------------------------------------------------------------------------

create table public.hlab_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.hlab_admins enable row level security;

revoke all on public.hlab_admins from anon, authenticated;
grant select on public.hlab_admins to authenticated;

create policy "hlab: admins can read their own row"
  on public.hlab_admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.hlab_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hlab_admins where user_id = (select auth.uid()));
$$;

revoke all on function public.hlab_is_admin() from public;
grant execute on function public.hlab_is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Media metadata (files live in the `hlab-media` storage bucket, see 0002)
-- ---------------------------------------------------------------------------

create table public.hlab_media (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique
               check (storage_path ~ '^[a-z0-9][a-z0-9/_.-]{2,198}$' and storage_path !~ '\.\.'),
  mime_type    text not null
               check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  size_bytes   integer not null check (size_bytes between 1 and 5242880),
  width        integer check (width is null or width between 1 and 20000),
  height       integer check (height is null or height between 1 and 20000),
  alt          jsonb not null default '{}'::jsonb
               check (jsonb_typeof(alt) = 'object' and pg_column_size(alt) <= 2048),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger hlab_media_set_updated_at before update on public.hlab_media
  for each row execute function public.hlab_set_updated_at();

-- ---------------------------------------------------------------------------
-- Site settings (singleton row, id = 1)
-- ---------------------------------------------------------------------------

create table public.hlab_site_settings (
  id               smallint primary key default 1 check (id = 1),
  site_name        text not null default 'H/LAB' check (char_length(btrim(site_name)) between 1 and 80),
  brand_text       text not null default 'H/LAB' check (char_length(btrim(brand_text)) between 1 and 24),
  contact_email    text check (contact_email is null or
                     (char_length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  social_links     jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 12
                          and pg_column_size(social_links) <= 8192),
  nav              jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(nav) = 'array' and jsonb_array_length(nav) <= 10
                          and pg_column_size(nav) <= 8192),
  footer           jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(footer) = 'object' and pg_column_size(footer) <= 4096),
  seo              jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(seo) = 'object' and pg_column_size(seo) <= 4096),
  ui               jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(ui) = 'object' and pg_column_size(ui) <= 16384),
  languages        text[] not null default array['en']
                   check (languages <@ array['en', 'tr'] and cardinality(languages) between 1 and 2),
  default_language text not null default 'en' check (default_language in ('en', 'tr')),
  is_published     boolean not null default true,
  accent           text not null default 'mint' check (accent in ('mint', 'lavender', 'sky', 'amber', 'rose')),
  theme            text not null default 'dark' check (theme in ('dark', 'black', 'light')),
  background       text not null default 'orbits' check (background in ('orbits', 'grid', 'plain')),
  animation        text not null default 'full' check (animation in ('full', 'subtle', 'off')),
  profile_media_id uuid references public.hlab_media (id) on delete restrict,
  og_media_id      uuid references public.hlab_media (id) on delete restrict,
  updated_at       timestamptz not null default now(),
  constraint default_language_enabled check (default_language = any (languages))
);

create trigger hlab_site_settings_set_updated_at before update on public.hlab_site_settings
  for each row execute function public.hlab_set_updated_at();

-- ---------------------------------------------------------------------------
-- Page blocks (hero, project grid, about, ...). `content` is jsonb validated
-- in depth by the app (Zod, on write and again on read) and structurally here.
-- ---------------------------------------------------------------------------

create or replace function public.hlab_block_content_valid(p_type text, p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_content) = 'object'
     and pg_column_size(p_content) <= 65536
     and (p_content - (case p_type
            when 'hero'      then array['eyebrow', 'headline', 'description', 'primaryCta', 'secondaryCta']
            when 'projects'  then array['heading', 'intro', 'showFilters']
            when 'about'     then array['heading', 'body', 'interests', 'showProfileImage']
            when 'tags'      then array['heading', 'tags']
            when 'exploring' then array['heading', 'intro', 'items']
            when 'gallery'   then array['heading', 'images']
            when 'contact'   then array['heading', 'body', 'emailLabel', 'showSocial']
            when 'text'      then array['heading', 'body']
            else array[]::text[]
          end)) = '{}'::jsonb;
$$;

create table public.hlab_content_blocks (
  id          uuid primary key default gen_random_uuid(),
  type        text not null
              check (type in ('hero', 'projects', 'about', 'tags', 'exploring', 'gallery', 'contact', 'text')),
  anchor      text not null unique check (anchor ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(anchor) <= 48),
  admin_label text not null check (char_length(btrim(admin_label)) between 1 and 80),
  content     jsonb not null default '{}'::jsonb check (public.hlab_block_content_valid(type, content)),
  position    integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index hlab_content_blocks_position_idx on public.hlab_content_blocks (position, created_at);

create trigger hlab_content_blocks_set_updated_at before update on public.hlab_content_blocks
  for each row execute function public.hlab_set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table public.hlab_projects (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  summary        jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 2048),
  description    jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(description) = 'object' and pg_column_size(description) <= 8192),
  status         text not null default 'active' check (status in ('active', 'experiment', 'paused', 'completed')),
  tags           text[] not null default '{}' check (public.hlab_text_array_ok(tags, 12, 30)),
  url            text check (url is null or (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500)),
  cover_media_id uuid references public.hlab_media (id) on delete restrict,
  position       integer not null default 0,
  is_visible     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index hlab_projects_position_idx on public.hlab_projects (position, created_at);
create index hlab_projects_visible_idx on public.hlab_projects (is_visible, position);
create index hlab_projects_cover_media_idx on public.hlab_projects (cover_media_id) where cover_media_id is not null;

create trigger hlab_projects_set_updated_at before update on public.hlab_projects
  for each row execute function public.hlab_set_updated_at();

-- ---------------------------------------------------------------------------
-- Change log (private). Written only by trigger; readable only by admins.
-- ---------------------------------------------------------------------------

create table public.hlab_change_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text,
  action     text not null check (action in ('insert', 'update', 'delete')),
  summary    text not null,
  actor      uuid,
  at         timestamptz not null default now()
);

create index hlab_change_log_at_idx on public.hlab_change_log (at desc);

create or replace function public.hlab_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  j jsonb;
begin
  j := to_jsonb(case when tg_op = 'DELETE' then old else new end);

  insert into public.hlab_change_log (table_name, row_id, action, summary, actor)
  values (
    tg_table_name,
    j ->> 'id',
    lower(tg_op),
    left(coalesce(j ->> 'title', j ->> 'admin_label', j ->> 'storage_path', 'site settings'), 120),
    (select auth.uid())
  );

  -- keep the log small
  delete from public.hlab_change_log
  where id <= (select coalesce(max(id), 0) from public.hlab_change_log) - 500;

  return null;
end;
$$;

revoke all on function public.hlab_log_change() from public, anon, authenticated;

create trigger hlab_projects_log after insert or update or delete on public.hlab_projects
  for each row execute function public.hlab_log_change();
create trigger hlab_content_blocks_log after insert or update or delete on public.hlab_content_blocks
  for each row execute function public.hlab_log_change();
create trigger hlab_media_log after insert or update or delete on public.hlab_media
  for each row execute function public.hlab_log_change();
create trigger hlab_site_settings_log after update on public.hlab_site_settings
  for each row execute function public.hlab_log_change();

-- ---------------------------------------------------------------------------
-- Row-Level Security + grants
-- ---------------------------------------------------------------------------

alter table public.hlab_media          enable row level security;
alter table public.hlab_site_settings  enable row level security;
alter table public.hlab_content_blocks enable row level security;
alter table public.hlab_projects       enable row level security;
alter table public.hlab_change_log     enable row level security;

revoke all on public.hlab_media, public.hlab_site_settings, public.hlab_content_blocks, public.hlab_projects, public.hlab_change_log
  from anon, authenticated;

-- Public reads
grant select on public.hlab_media, public.hlab_site_settings, public.hlab_content_blocks, public.hlab_projects to anon, authenticated;
-- Admin writes (still gated by is_admin() in the policies below)
grant insert, update, delete on public.hlab_media, public.hlab_content_blocks, public.hlab_projects to authenticated;
grant update on public.hlab_site_settings to authenticated;
grant select on public.hlab_change_log to authenticated;

-- media: visitors can read a file's metadata only while something PUBLISHED references it
-- (a visible project cover, a visible block, or the site settings). Unreferenced or
-- hidden uploads stay private to admins.
create policy "hlab: published media is public" on public.hlab_media for select to anon, authenticated using (
  exists (select 1 from public.hlab_projects p where p.cover_media_id = hlab_media.id and p.is_visible)
  or exists (select 1 from public.hlab_site_settings s where s.profile_media_id = hlab_media.id or s.og_media_id = hlab_media.id)
  or exists (select 1 from public.hlab_content_blocks b where b.is_visible and position(hlab_media.id::text in b.content::text) > 0)
);
create policy "hlab: admins read all media" on public.hlab_media for select to authenticated using (public.hlab_is_admin());
create policy "hlab: admins insert media" on public.hlab_media for insert to authenticated with check (public.hlab_is_admin());
create policy "hlab: admins update media" on public.hlab_media for update to authenticated
  using (public.hlab_is_admin()) with check (public.hlab_is_admin());
create policy "hlab: admins delete media" on public.hlab_media for delete to authenticated using (public.hlab_is_admin());

-- site_settings: readable by everyone (contains only public site config); only admins update; no insert/delete.
create policy "hlab: settings are publicly readable" on public.hlab_site_settings for select to anon, authenticated using (true);
create policy "hlab: admins update settings" on public.hlab_site_settings for update to authenticated
  using (public.hlab_is_admin()) with check (public.hlab_is_admin());

-- content_blocks: visitors see visible blocks; admins see and change everything
create policy "hlab: visible blocks are public" on public.hlab_content_blocks for select to anon, authenticated
  using (is_visible);
create policy "hlab: admins read all blocks" on public.hlab_content_blocks for select to authenticated using (public.hlab_is_admin());
create policy "hlab: admins insert blocks" on public.hlab_content_blocks for insert to authenticated with check (public.hlab_is_admin());
create policy "hlab: admins update blocks" on public.hlab_content_blocks for update to authenticated
  using (public.hlab_is_admin()) with check (public.hlab_is_admin());
create policy "hlab: admins delete blocks" on public.hlab_content_blocks for delete to authenticated using (public.hlab_is_admin());

-- projects: same shape as blocks
create policy "hlab: visible projects are public" on public.hlab_projects for select to anon, authenticated
  using (is_visible);
create policy "hlab: admins read all projects" on public.hlab_projects for select to authenticated using (public.hlab_is_admin());
create policy "hlab: admins insert projects" on public.hlab_projects for insert to authenticated with check (public.hlab_is_admin());
create policy "hlab: admins update projects" on public.hlab_projects for update to authenticated
  using (public.hlab_is_admin()) with check (public.hlab_is_admin());
create policy "hlab: admins delete projects" on public.hlab_projects for delete to authenticated using (public.hlab_is_admin());

-- change_log: admins read only
create policy "hlab: admins read change log" on public.hlab_change_log for select to authenticated using (public.hlab_is_admin());

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: they run with the caller's rights, so RLS still applies)
-- ---------------------------------------------------------------------------

create or replace function public.hlab_reorder_projects(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.hlab_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.hlab_projects p
     set position = o.ord::integer
    from unnest(p_ids) with ordinality as o(id, ord)
   where p.id = o.id;
end;
$$;

create or replace function public.hlab_reorder_blocks(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.hlab_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.hlab_content_blocks b
     set position = o.ord::integer
    from unnest(p_ids) with ordinality as o(id, ord)
   where b.id = o.id;
end;
$$;

-- Where is a media item referenced? Blocks reference media ids inside jsonb, so
-- there is no foreign key for them; this function is what the admin UI consults.
create or replace function public.hlab_media_usage(p_media_id uuid)
returns table (kind text, ref_id text, label text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.hlab_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select 'project'::text, p.id::text, p.title
      from public.hlab_projects p where p.cover_media_id = p_media_id
    union all
    select 'block'::text, b.id::text, b.admin_label
      from public.hlab_content_blocks b where position(p_media_id::text in b.content::text) > 0
    union all
    select 'settings'::text, s.id::text, 'Profile image'::text
      from public.hlab_site_settings s where s.profile_media_id = p_media_id
    union all
    select 'settings'::text, s.id::text, 'Share image'::text
      from public.hlab_site_settings s where s.og_media_id = p_media_id;
end;
$$;

-- Deletes the metadata row only if nothing references it, and returns the storage
-- path so the client can then remove the file. Foreign keys already protect
-- project covers and settings images; this also protects block references.
create or replace function public.hlab_delete_media(p_media_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text;
begin
  if not public.hlab_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (select 1 from public.hlab_media_usage(p_media_id)) then
    raise exception 'media is still in use' using errcode = '23503';
  end if;

  delete from public.hlab_media where id = p_media_id returning storage_path into v_path;
  if v_path is null then
    raise exception 'media not found' using errcode = 'P0002';
  end if;
  return v_path;
end;
$$;

revoke all on function public.hlab_reorder_projects(uuid[]), public.hlab_reorder_blocks(uuid[]),
  public.hlab_media_usage(uuid), public.hlab_delete_media(uuid) from public, anon;
grant execute on function public.hlab_reorder_projects(uuid[]), public.hlab_reorder_blocks(uuid[]),
  public.hlab_media_usage(uuid), public.hlab_delete_media(uuid) to authenticated;
