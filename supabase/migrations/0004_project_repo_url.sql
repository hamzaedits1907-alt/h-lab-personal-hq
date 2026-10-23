-- 0004: optional source-code link for projects, and personal About copy.
--
-- Backward compatible and non-destructive:
--   * repo_url is a NEW NULLABLE column. Existing rows keep working (NULL = no source link).
--   * Starter copy is only replaced where it is still EXACTLY the old starter text, so anything
--     the owner has edited is never overwritten. Safe to run more than once.
-- Apply this BEFORE deploying a build that saves the source-code link.

-- Guard: only touch the `hlab_projects` table that is H/LAB's own (never another application's).
do $guard$
begin
  if not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'hlab_projects' and column_name = 'cover_media_id'
     )
     or not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'hlab_content_blocks' and column_name = 'admin_label'
     )
  then
    raise exception 'H/LAB migration 0004 aborted: public.hlab_projects is not the H/LAB table (apply 0001-0003 first). Nothing was changed.'
      using errcode = '42710';
  end if;
end
$guard$;

alter table public.hlab_projects
  add column if not exists repo_url text
  check (repo_url is null or (repo_url ~ '^https://[^[:space:]]+$' and char_length(repo_url) <= 500));

-- About section: replace the original starter copy (only if unedited).
update public.hlab_content_blocks
   set content = content || jsonb_build_object('body', $j${"en":"I'm a curious builder who likes turning ambitious ideas into real software. I explore AI assistants, desktop apps, browsers, creative tools and simulation worlds. I enjoy figuring out how things work, testing ideas and improving each version until it becomes something useful.\n\nH/LAB is where I bring those experiments together.","tr":"Yeni fikirleri çalışan ürünlere dönüştürmeyi seven meraklı bir geliştiriciyim. Yapay zekâ asistanları, masaüstü uygulamaları, tarayıcılar, yaratıcı araçlar ve simülasyon dünyaları üzerine denemeler yapıyorum. Benim için en eğlenceli kısım yalnızca fikir bulmak değil; onu geliştirmek, test etmek ve her sürümde daha iyi hale getirmektir.\n\nH/LAB, bu denemeleri bir araya getirdiğim yer."}$j$::jsonb, 'interests', $j$[{"en":"AI assistants","tr":"Yapay zekâ asistanları"},{"en":"Desktop apps","tr":"Masaüstü uygulamaları"},{"en":"Browsers","tr":"Tarayıcılar"},{"en":"Creative tools","tr":"Yaratıcı araçlar"},{"en":"Simulation worlds","tr":"Simülasyon dünyaları"}]$j$::jsonb)
 where type = 'about'
   and content -> 'body' = $j${"en":"H/LAB is where I keep my personal projects: AI tools, desktop software, games and simulations. Everything here is a work in progress.","tr":"H/LAB, kişisel projelerimi topladığım yer: yapay zekâ araçları, masaüstü yazılımları, oyunlar ve simülasyonlar. Buradaki her şey yapım aşamasında."}$j$::jsonb;

-- Interface labels: "Visit project" -> "Open project" (only if unedited), and add the new labels if absent.
update public.hlab_site_settings
   set ui = jsonb_set(
         ui,
         '{labels}',
         coalesce(ui -> 'labels', '{}'::jsonb)
           || case when ui -> 'labels' -> 'visitProject' = $j${"en":"Visit project","tr":"Projeye git"}$j$::jsonb
                   then jsonb_build_object('visitProject', $j${"en":"Open project","tr":"Projeyi aç"}$j$::jsonb) else '{}'::jsonb end
           || case when ui -> 'labels' -> 'sourceCode' is null
                   then jsonb_build_object('sourceCode', $j${"en":"Source code","tr":"Kaynak kodu"}$j$::jsonb) else '{}'::jsonb end
           || case when ui -> 'labels' -> 'newTab' is null
                   then jsonb_build_object('newTab', $j${"en":"opens in a new tab","tr":"yeni sekmede açılır"}$j$::jsonb) else '{}'::jsonb end,
         true
       )
 where id = 1;

-- Verified live links for two starter projects (only where no link has been set).
update public.hlab_projects set url = 'https://project-genius.netlify.app/'
 where id = '00000000-0000-4000-8000-000000000201' and url is null;
update public.hlab_projects set url = 'https://lufthansa-connect-ptfs.netlify.app/'
 where id = '00000000-0000-4000-8000-000000000206' and url is null;
