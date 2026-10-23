import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { seedSettings } from '@/content/seed';
import { AppError, MediaInUseError } from '@/data/errors';
import { SupabaseRepository, toAppError } from '@/data/supabaseRepository';

/**
 * These tests use a hand-written fake of the Supabase client. They check OUR code
 * (row mapping, error translation, "never claim success") but are NOT a substitute
 * for running against a real project; see docs/DEPLOYMENT.md for the smoke test.
 */
type Result = { data: unknown; error: { message: string; code?: string } | null };

function fakeClient(tables: Record<string, Result>, rpc: Record<string, Result> = {}) {
  const calls: string[] = [];
  const chain = (name: string, res: Result) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete']) {
      c[m] = (...args: unknown[]) => {
        calls.push(`${name}.${m}(${args.length})`);
        return c;
      };
    }
    c.single = () => Promise.resolve(res);
    c.maybeSingle = () => Promise.resolve(res);
    c.then = (resolve: (r: Result) => unknown) => resolve(res);
    return c;
  };
  const client = {
    from: (t: string) => chain(t, tables[t] ?? { data: [], error: null }),
    rpc: (name: string) => {
      calls.push(`rpc:${name}`);
      return Promise.resolve(rpc[name] ?? { data: null, error: null });
    },
    storage: {
      from: () => ({
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/hlab-media/${p}` } }),
        remove: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const settingsRow = {
  id: 1,
  site_name: 'H/LAB',
  brand_text: 'H/LAB',
  contact_email: null,
  social_links: 'garbage',
  nav: [],
  footer: {},
  seo: {},
  ui: {},
  languages: ['en'],
  default_language: 'en',
  is_published: true,
  accent: 'neon',
  theme: 'dark',
  background: 'orbits',
  animation: 'full',
  profile_media_id: null,
  og_media_id: null,
  updated_at: '2026-01-01T00:00:00Z',
};

describe('SupabaseRepository.loadSite', () => {
  it('maps rows, tolerates bad stored values, and keeps invalid blocks aside', async () => {
    const { client } = fakeClient({
      hlab_site_settings: { data: settingsRow, error: null },
      hlab_content_blocks: {
        data: [
          { id: 'b1', type: 'text', anchor: 'a', admin_label: 'A', content: { heading: { en: 'Hi' } }, position: 1, is_visible: true, created_at: '', updated_at: '' },
          { id: 'b2', type: 'gallery', anchor: 'g', admin_label: 'G', content: { images: [{ mediaId: 'nope' }] }, position: 2, is_visible: true, created_at: '', updated_at: '' },
          { id: 'b3', type: 'unknown-type', anchor: 'u', admin_label: 'U', content: {}, position: 3, is_visible: true, created_at: '', updated_at: '' },
        ],
        error: null,
      },
      hlab_projects: {
        data: [{ id: 'p1', slug: 's', title: 'T', summary: { en: 'x' }, description: {}, status: 'bogus', tags: null, url: null, cover_media_id: null, position: 1, is_visible: true, created_at: '', updated_at: '' }],
        error: null,
      },
      hlab_media: { data: [], error: null },
    });
    const site = await new SupabaseRepository(client, 'hlab-media').loadSite();
    expect(site.blocks.map((b) => b.id)).toEqual(['b1']);
    expect(site.invalidBlocks.map((b) => b.id)).toEqual(['b2', 'b3']);
    // bad appearance value falls back to a safe default rather than reaching CSS
    expect(site.settings?.accent).toBe('mint');
    expect(site.settings?.socialLinks).toEqual([]);
    expect(site.projects[0]).toMatchObject({ status: 'active', tags: [] });
  });

  it('reports "no settings row" as null instead of inventing starter data', async () => {
    const { client } = fakeClient({ hlab_site_settings: { data: null, error: null } });
    expect((await new SupabaseRepository(client).loadSite()).settings).toBeNull();
  });

  it('throws a network AppError when the database is unreachable', async () => {
    const { client } = fakeClient({ hlab_site_settings: { data: null, error: { message: 'TypeError: Failed to fetch' } } });
    await expect(new SupabaseRepository(client).loadSite()).rejects.toMatchObject({ code: 'network' });
  });

  it('builds public image URLs from the bucket', () => {
    const { client } = fakeClient({});
    expect(new SupabaseRepository(client).mediaUrl({ storagePath: 'uploads/a.webp' })).toBe(
      'https://abc.supabase.co/storage/v1/object/public/hlab-media/uploads/a.webp',
    );
  });
});

describe('SupabaseRepository writes never report success on failure', () => {
  it('turns "zero rows updated" (RLS denial) into an error', async () => {
    const { client } = fakeClient({ hlab_site_settings: { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } } });
    await expect(new SupabaseRepository(client).saveSettings({ ...seedSettings })).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('validates before sending anything to the database', async () => {
    const { client, calls } = fakeClient({});
    await expect(new SupabaseRepository(client).saveSettings({ ...seedSettings, accent: 'x' as never })).rejects.toMatchObject({ code: 'validation' });
    await expect(new SupabaseRepository(client).createProject({ slug: 'A B', title: '', summary: {}, description: {}, status: 'active', tags: [], url: null, repoUrl: null, coverMediaId: null, isVisible: true })).rejects.toBeInstanceOf(AppError);
    expect(calls.filter((c) => /update|insert/.test(c))).toEqual([]);
  });

  it('refuses to delete an image that is still referenced, without calling delete', async () => {
    const { client, calls } = fakeClient({}, { hlab_media_usage: { data: [{ kind: 'project', ref_id: 'p', label: 'Proj' }], error: null } });
    await expect(new SupabaseRepository(client).deleteMedia('m')).rejects.toBeInstanceOf(MediaInUseError);
    expect(calls).not.toContain('rpc:hlab_delete_media');
  });

  it('treats a delete that removed nothing as a failure', async () => {
    const { client } = fakeClient({ hlab_projects: { data: [], error: null } });
    await expect(new SupabaseRepository(client).deleteProject('p')).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

describe('toAppError', () => {
  it.each([
    [{ code: '23505', message: 'duplicate key value violates unique constraint "projects_slug_key"' }, 'conflict'],
    [{ code: '23503', message: 'fk' }, 'in-use'],
    [{ code: '23514', message: 'check' }, 'validation'],
    [{ code: '42501', message: 'permission denied for table projects' }, 'unauthorized'],
    [{ code: '', message: 'new row violates row-level security policy' }, 'unauthorized'],
    [{ code: '', message: 'Failed to fetch' }, 'network'],
    [{ code: 'XX000', message: 'boom' }, 'unknown'],
  ])('maps %j to %s', (error, code) => {
    expect(toAppError(error, 'testing').code).toBe(code);
  });

  it('names what collided on duplicates', () => {
    expect(toAppError({ code: '23505', message: 'violates "content_blocks_anchor_key"' }, 'x').message).toMatch(/section address/);
    expect(toAppError({ code: '23505', message: 'violates "projects_slug_key"' }, 'x').message).toMatch(/project address/);
  });
});

describe('SupabaseRepository sign-in', () => {
  it('does not reveal whether an email exists', async () => {
    const { client } = fakeClient({});
    (client as unknown as { auth: Record<string, unknown> }).auth.signInWithPassword = vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(new SupabaseRepository(client).signIn('a@b.c', 'x')).rejects.toThrow('Incorrect email or password.');
  });
});
