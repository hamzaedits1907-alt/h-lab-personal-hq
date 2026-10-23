-- Storage bucket for uploaded images.
-- The bucket is public-read BY URL (so <img> tags work without signing), but
-- there is no SELECT policy for anon, so visitors cannot list the bucket. Only
-- admins may upload, replace or delete objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "admins read site-media objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and public.is_admin());

create policy "admins upload site-media objects"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.is_admin());

create policy "admins update site-media objects"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.is_admin())
  with check (bucket_id = 'site-media' and public.is_admin());

create policy "admins delete site-media objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.is_admin());
