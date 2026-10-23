/**
 * Live end-to-end check against a deployed Supabase project, through the app's own
 * SupabaseRepository. Uses only the PUBLIC anon key plus the admin's sign-in.
 *
 *   npx tsx scripts/live-smoke.ts            (reads .env.local and supabase/.secrets.local/hlab-admin-login.txt)
 *
 * It creates one hidden test project + one tiny image, exercises edit / link / upload /
 * visibility, then deletes everything it created and restores the text it edited.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SupabaseRepository } from '../src/data/supabaseRepository';

const kv = (path: string) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
const env = kv('.env.local');
const login = Object.fromEntries(
  readFileSync('supabase/.secrets.local/hlab-admin-login.txt', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes(': '))
    .map((l) => [l.split(': ')[0], l.split(': ')[1]]),
) as { email: string; password: string };

const url = env.VITE_SUPABASE_URL!;
const key = env.VITE_SUPABASE_ANON_KEY!;
const bucket = env.VITE_SUPABASE_BUCKET ?? 'hlab-media';
const mk = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
};

// 1x1 PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function main() {
  // ---- anonymous visitor
  const anon = mk();
  const pub = await new SupabaseRepository(anon, bucket).loadSite();
  check('anon can load the public site', pub.projects.length >= 7 && pub.blocks.length >= 5, `${pub.projects.length} projects, ${pub.blocks.length} blocks`);
  for (const t of ['hlab_admins', 'hlab_change_log']) {
    const r = await anon.from(t).select('*');
    check(`anon cannot read ${t}`, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? 'no rows');
  }
  const w = await anon.from('hlab_projects').update({ title: 'pwn' }).eq('slug', 'jarvis').select('id');
  check('anon cannot write projects', !!w.error || (w.data ?? []).length === 0);
  const anonUpload = await anon.storage.from(bucket).upload(`uploads/anon-${Date.now()}.png`, png, { contentType: 'image/png' });
  check('anon cannot upload to storage', !!anonUpload.error, anonUpload.error?.message);
  const list = await anon.storage.from(bucket).list('uploads');
  check('anon cannot list the bucket', !!list.error || (list.data ?? []).length === 0);

  // ---- admin
  const admin = mk();
  const repo = new SupabaseRepository(admin, bucket);
  await repo.signIn(login.email, login.password);
  const auth = await repo.getAuthState();
  check('admin login works and is recognised as H/LAB admin', auth.status === 'signed-in' && auth.isAdmin, auth.status === 'signed-in' ? auth.email : '');

  // text edit + persistence (seen by a brand-new anonymous client)
  const hero = pub.blocks.find((b) => b.type === 'hero')!;
  const original = hero.content as Record<string, unknown>;
  const marker = `Live test ${Date.now()}`;
  await repo.updateBlock(hero.id, 'hero', { content: { ...original, headline: { en: marker, tr: 'Canlı test' } } } as never);
  const seen = await new SupabaseRepository(mk(), bucket).loadSite();
  const heroNow = seen.blocks.find((b) => b.id === hero.id)!.content as { headline: { en: string } };
  check('text edit persists and is publicly visible', heroNow.headline.en === marker);
  await repo.updateBlock(hero.id, 'hero', { content: original } as never);
  const restored = (await new SupabaseRepository(mk(), bucket).loadSite()).blocks.find((b) => b.id === hero.id)!.content as { headline: { en: string } };
  check('text restored', restored.headline.en === (original as { headline: { en: string } }).headline.en);

  // hidden project with links
  const slug = `live-test-${Date.now()}`;
  const proj = await repo.createProject({
    slug, title: 'Live test project', summary: { en: 's' }, description: { en: 'd' }, status: 'experiment', tags: ['test'],
    url: 'https://example.com/app', repoUrl: 'https://github.com/example/repo', coverMediaId: null, isVisible: false,
  });
  check('project link + source link saved', proj.url === 'https://example.com/app' && proj.repoUrl === 'https://github.com/example/repo');
  const hidden = (await new SupabaseRepository(mk(), bucket).loadSite()).projects.some((p) => p.id === proj.id);
  check('hidden project is NOT visible to the public', !hidden);

  // image upload
  const file = new File([png], 'x.png', { type: 'image/png' });
  const media = await repo.uploadMedia(file, { en: 'live test pixel' }, { width: 1, height: 1 });
  const objUrl = repo.mediaUrl(media);
  const pubBefore = await anon.from('hlab_media').select('id').eq('id', media.id);
  check('uploaded image row exists, unreferenced image is private to visitors', (pubBefore.data ?? []).length === 0);
  const head1 = await fetch(objUrl);
  check('uploaded file is served from storage (200, image/png)', head1.status === 200 && (head1.headers.get('content-type') ?? '').includes('image/png'), `${head1.status}`);

  await repo.updateProject(proj.id, { coverMediaId: media.id, isVisible: true });
  const site2 = await new SupabaseRepository(mk(), bucket).loadSite();
  const live = site2.projects.find((p) => p.id === proj.id);
  check('published project shows with its links and cover to the public', !!live && live.url === 'https://example.com/app' && live.repoUrl === 'https://github.com/example/repo' && live.coverMediaId === media.id, JSON.stringify({ found: !!live, url: live?.url, repoUrl: live?.repoUrl, cover: live?.coverMediaId === media.id }));
  check('published cover media is readable by visitors', media.id in site2.media);
  const inUse = await repo.getMediaUsage(media.id);
  check('media usage reports the project', inUse.length === 1);

  // cleanup
  await repo.updateProject(proj.id, { coverMediaId: null, isVisible: false });
  await repo.deleteMedia(media.id);
  await repo.deleteProject(proj.id);
  // The public CDN may keep serving a cached copy for a while, so verify against the bucket itself.
  const files = await admin.storage.from(bucket).list('uploads');
  check('image removed from the storage bucket on delete', !(files.data ?? []).some((f) => objUrl.endsWith(f.name)));
  const after = await new SupabaseRepository(mk(), bucket).loadSite();
  check('cleanup left the seeded content only', after.projects.length === pub.projects.length && Object.keys(after.media).length === Object.keys(pub.media).length);

  await repo.signOut();
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL LIVE CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('ERROR', e instanceof Error ? e.message : e);
  process.exit(2);
});
