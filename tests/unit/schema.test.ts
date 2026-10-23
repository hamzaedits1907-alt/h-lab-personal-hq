import { describe, expect, it } from 'vitest';
import { defaultBlockContent } from '@/content/defaults';
import { formatCopyright, paragraphs, pick, slugify, uniqueSlug } from '@/content/localize';
import {
  BLOCK_TYPES,
  isHttpsUrl,
  isSafeTarget,
  parseBlockContent,
  projectInputSchema,
  safeParseBlockContent,
  settingsInputSchema,
} from '@/content/schema';
import { seedBlocks, seedProjects, seedSettings } from '@/content/seed';
import { buildSeedSql } from '../../scripts/generate-seed';
import { readFileSync } from 'node:fs';

const validProject = {
  slug: 'my-project',
  title: 'My project',
  summary: { en: 'Short' },
  description: { en: 'Longer' },
  status: 'active' as const,
  tags: ['a', 'b'],
  url: null,
  coverMediaId: null,
  isVisible: true,
};

describe('link safety', () => {
  it('accepts only https, mailto and in-page anchors', () => {
    expect(isSafeTarget('https://example.com/a?b=1')).toBe(true);
    expect(isSafeTarget('#projects')).toBe(true);
    expect(isSafeTarget('mailto:me@example.com')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'http://example.com', '//evil.com', 'vbscript:x', '', '#', '# bad']) {
      expect(isSafeTarget(bad), bad).toBe(false);
    }
  });
  it('isHttpsUrl rejects whitespace tricks and other schemes', () => {
    expect(isHttpsUrl('https://example.com')).toBe(true);
    expect(isHttpsUrl('https://exa mple.com')).toBe(false);
    expect(isHttpsUrl('ftp://example.com')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
  });
});

describe('project validation', () => {
  it('accepts a valid project', () => {
    expect(projectInputSchema.safeParse(validProject).success).toBe(true);
  });
  it.each([
    ['empty title', { title: '  ' }],
    ['long title', { title: 'x'.repeat(81) }],
    ['bad slug', { slug: 'Bad Slug' }],
    ['unknown status', { status: 'draft' }],
    ['http url', { url: 'http://example.com' }],
    ['javascript url', { url: 'javascript:alert(1)' }],
    ['too many tags', { tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }],
    ['long tag', { tags: ['x'.repeat(31)] }],
    ['long summary', { summary: { en: 'x'.repeat(201) } }],
    ['bad cover id', { coverMediaId: 'nope' }],
  ])('rejects %s', (_name, patch) => {
    expect(projectInputSchema.safeParse({ ...validProject, ...patch }).success).toBe(false);
  });
  it('de-duplicates and trims tags', () => {
    const r = projectInputSchema.parse({ ...validProject, tags: ['a', ' a ', 'b'] });
    expect(r.tags).toEqual(['a', 'b']);
  });
});

describe('block validation', () => {
  it('has a default that validates for every block type', () => {
    for (const type of BLOCK_TYPES) {
      expect(() => defaultBlockContent(type), type).not.toThrow();
    }
  });
  it('rejects an unsafe CTA target', () => {
    const c = defaultBlockContent('hero');
    const r = safeParseBlockContent('hero', { ...c, primaryCta: { label: { en: 'Go' }, target: 'javascript:alert(1)' } });
    expect(r.success).toBe(false);
  });
  it('rejects wrong shapes and strips unknown keys (no arbitrary HTML/script fields)', () => {
    expect(safeParseBlockContent('gallery', { images: [{ mediaId: 'not-a-uuid' }] }).success).toBe(false);
    expect(safeParseBlockContent('tags', { tags: 'a,b' }).success).toBe(false);
    const parsed = parseBlockContent('text', { heading: { en: 'x' }, body: { en: 'y' }, html: '<script>alert(1)</script>' });
    expect(parsed).not.toHaveProperty('html');
  });
  it('enforces length limits', () => {
    expect(safeParseBlockContent('text', { body: { en: 'x'.repeat(3001) } }).success).toBe(false);
  });
});

describe('settings validation', () => {
  it('accepts the seed settings', () => {
    expect(settingsInputSchema.safeParse(seedSettings).success).toBe(true);
  });
  it('requires the default language to be enabled and at least one language', () => {
    expect(settingsInputSchema.safeParse({ ...seedSettings, languages: ['en'], defaultLanguage: 'tr' }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...seedSettings, languages: [] }).success).toBe(false);
  });
  it('only allows listed appearance values', () => {
    for (const patch of [{ accent: '#ff0000' }, { theme: 'neon' }, { background: 'url(x)' }, { animation: 'wild' }]) {
      expect(settingsInputSchema.safeParse({ ...seedSettings, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });
  it('validates emails and social links', () => {
    expect(settingsInputSchema.safeParse({ ...seedSettings, contactEmail: 'nope' }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...seedSettings, socialLinks: [{ label: 'x', url: 'javascript:1' }] }).success).toBe(false);
    expect(settingsInputSchema.safeParse({ ...seedSettings, socialLinks: [{ label: 'GitHub', url: 'https://github.com/x' }] }).success).toBe(true);
  });
});

describe('localization helpers', () => {
  it('falls back: requested -> default -> any', () => {
    expect(pick({ en: 'Hello', tr: 'Merhaba' }, 'tr')).toBe('Merhaba');
    expect(pick({ en: 'Hello' }, 'tr')).toBe('Hello');
    expect(pick({ tr: 'Merhaba' }, 'en', 'en')).toBe('Merhaba');
    expect(pick({ en: '  ', tr: 'Merhaba' }, 'en')).toBe('Merhaba');
    expect(pick(undefined, 'en')).toBe('');
  });
  it('slugifies including Turkish characters', () => {
    expect(slugify('Çılgın Proje: Şimdi!')).toBe('cilgin-proje-simdi');
    expect(slugify('  Hello   World ')).toBe('hello-world');
  });
  it('makes unique slugs', () => {
    expect(uniqueSlug('a', ['a', 'a-2'])).toBe('a-3');
    expect(uniqueSlug('b', ['a'])).toBe('b');
  });
  it('splits paragraphs and formats the copyright line', () => {
    expect(paragraphs('One\n\nTwo\n\n\nThree')).toEqual(['One', 'Two', 'Three']);
    expect(formatCopyright('© {year} {site}', 'H/LAB', 2030)).toBe('© 2030 H/LAB');
  });
});

describe('starter content', () => {
  it('contains every requested project with valid data', () => {
    expect(seedProjects.map((p) => p.title)).toEqual([
      'Project Genius',
      'Project Browser',
      'Project-Frame',
      'JARVIS',
      'Edward',
      'Lufthansa Launcher',
      'Project Genesis',
    ]);
    for (const p of seedProjects) expect(projectInputSchema.safeParse(p).success, p.title).toBe(true);
    expect(seedProjects.find((p) => p.title === 'Project-Frame')?.status).toBe('paused');
  });
  it('has valid blocks', () => {
    for (const b of seedBlocks) expect(safeParseBlockContent(b.type, b.content).success, b.type).toBe(true);
  });
  it('keeps the committed seed migration in sync with src/content/seed.ts', () => {
    const committed = readFileSync('supabase/migrations/0003_seed_starter_content.sql', 'utf8');
    expect(committed.replaceAll('\r\n', '\n')).toBe(buildSeedSql().replaceAll('\r\n', '\n'));
  });
});
