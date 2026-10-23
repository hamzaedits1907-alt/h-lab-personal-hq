import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const LANGS = ['en', 'tr'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { en: 'English', tr: 'Türkçe' };

export const PROJECT_STATUSES = ['active', 'experiment', 'paused', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const BLOCK_TYPES = [
  'hero',
  'projects',
  'about',
  'tags',
  'exploring',
  'gallery',
  'contact',
  'text',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const ACCENTS = ['mint', 'lavender', 'sky', 'amber', 'rose'] as const;
export const THEMES = ['dark', 'black', 'light'] as const;
export const BACKGROUNDS = ['orbits', 'grid', 'plain'] as const;
export const ANIMATIONS = ['full', 'subtle', 'off'] as const;
export type Accent = (typeof ACCENTS)[number];
export type Theme = (typeof THEMES)[number];
export type Background = (typeof BACKGROUNDS)[number];
export type Animation = (typeof ANIMATIONS)[number];

/** Text that exists once per supported language. Missing languages fall back. */
export const localized = (max: number) =>
  z.object({
    en: z.string().max(max, `Keep it under ${max} characters`).optional(),
    tr: z.string().max(max, `Keep it under ${max} characters`).optional(),
  });
export type LocalizedText = { en?: string | undefined; tr?: string | undefined };

/** Same as `localized` but tolerant of a missing key (used for stored blocks). */
const L = (max: number) => localized(max).default({});

export function isHttpsUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}

const ANCHOR_TARGET = /^#[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAILTO_TARGET = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Safe link targets: in-page anchor, https URL or mailto. Never javascript:, data:, http:. */
export function isSafeTarget(value: string | null | undefined): value is string {
  if (!value) return false;
  return ANCHOR_TARGET.test(value) || MAILTO_TARGET.test(value) || isHttpsUrl(value);
}

export const httpsUrlSchema = z
  .string()
  .trim()
  .max(500, 'Keep it under 500 characters')
  .refine(isHttpsUrl, 'Must be a valid https:// address');

export const linkTargetSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || isSafeTarget(v), 'Use #section, an https:// link or mailto:');

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single hyphens only');

export const anchorSchema = slugSchema.max(48);

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid email address');

export const uuidSchema = z.uuid();

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export const tagsSchema = z
  .array(z.string().trim().min(1).max(30, 'Tags are limited to 30 characters'))
  .max(12, 'At most 12 tags')
  .transform((tags) => [...new Set(tags)]);

export const projectInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, 'A title is required').max(80, 'Keep the title under 80 characters'),
  summary: localized(200),
  description: localized(1200),
  status: z.enum(PROJECT_STATUSES),
  tags: tagsSchema,
  url: httpsUrlSchema.nullable(),
  /** Optional source-code link (GitHub, GitLab…). Independent of `url`; either, both or neither may exist. */
  repoUrl: httpsUrlSchema.nullable().default(null),
  coverMediaId: uuidSchema.nullable(),
  isVisible: z.boolean(),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export interface Project extends ProjectInput {
  id: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Block content, one schema per block type                            */
/* ------------------------------------------------------------------ */

const cta = z
  .object({ label: L(40), target: linkTargetSchema.default('') })
  .default({ label: {}, target: '' });

export const heroContentSchema = z.object({
  eyebrow: L(60),
  headline: L(120),
  description: L(320),
  primaryCta: cta,
  secondaryCta: cta,
});

export const projectsContentSchema = z.object({
  heading: L(80),
  intro: L(240),
  showFilters: z.boolean().default(true),
});

export const aboutContentSchema = z.object({
  heading: L(80),
  body: L(1500),
  interests: z.array(L(40)).max(16).default([]),
  showProfileImage: z.boolean().default(true),
});

export const tagsContentSchema = z.object({
  heading: L(80),
  tags: z.array(z.string().trim().min(1).max(30)).max(30).default([]),
});

export const exploringContentSchema = z.object({
  heading: L(80),
  intro: L(240),
  items: z.array(z.object({ title: L(80), note: L(240) })).max(10).default([]),
});

export const galleryContentSchema = z.object({
  heading: L(80),
  images: z.array(z.object({ mediaId: uuidSchema })).max(12).default([]),
});

export const contactContentSchema = z.object({
  heading: L(80),
  body: L(400),
  emailLabel: L(40),
  showSocial: z.boolean().default(true),
});

export const textContentSchema = z.object({
  heading: L(80),
  body: L(3000),
});

export const BLOCK_CONTENT_SCHEMAS = {
  hero: heroContentSchema,
  projects: projectsContentSchema,
  about: aboutContentSchema,
  tags: tagsContentSchema,
  exploring: exploringContentSchema,
  gallery: galleryContentSchema,
  contact: contactContentSchema,
  text: textContentSchema,
} as const satisfies Record<BlockType, z.ZodType>;

export type BlockContentMap = {
  [T in BlockType]: z.infer<(typeof BLOCK_CONTENT_SCHEMAS)[T]>;
};

interface BlockBase {
  id: string;
  anchor: string;
  adminLabel: string;
  position: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A block whose `content` has been validated for its `type`. */
export type ContentBlock = {
  [T in BlockType]: BlockBase & { type: T; content: BlockContentMap[T] };
}[BlockType];

export const BLOCK_TYPE_INFO: Record<BlockType, { label: string; description: string }> = {
  hero: { label: 'Hero', description: 'Headline, intro and two buttons with animated artwork.' },
  projects: { label: 'Project grid', description: 'Your visible projects as cards, with status filters.' },
  about: { label: 'About', description: 'A short introduction, interests and optional profile image.' },
  tags: { label: 'Tags / skills', description: 'A compact list of skills or interests.' },
  exploring: { label: 'Currently exploring', description: 'A short list of current focus areas.' },
  gallery: { label: 'Image gallery', description: 'A responsive set of images from the media library.' },
  contact: { label: 'Contact', description: 'Email and social links. No form.' },
  text: { label: 'Custom text', description: 'A heading with plain paragraphs.' },
};

export const blockMetaSchema = z.object({
  anchor: anchorSchema,
  adminLabel: z.string().trim().min(1, 'A label is required').max(80),
  isVisible: z.boolean(),
});

/** Validates `content` for `type` and returns the cleaned value, or throws a ZodError. */
export function parseBlockContent<T extends BlockType>(type: T, content: unknown): BlockContentMap[T] {
  return BLOCK_CONTENT_SCHEMAS[type].parse(content) as BlockContentMap[T];
}

export function safeParseBlockContent<T extends BlockType>(type: T, content: unknown) {
  return BLOCK_CONTENT_SCHEMAS[type].safeParse(content);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const UI_LABEL_KEYS = [
  'viewProject',
  'visitProject',
  'sourceCode',
  'newTab',
  'close',
  'allProjects',
  'skipToContent',
  'language',
  'menu',
  'noProjects',
  'emailMe',
  'noContact',
  'comingSoonTitle',
  'comingSoonBody',
  'previewBanner',
] as const;
export type UiLabelKey = (typeof UI_LABEL_KEYS)[number];

const uiLabelsShape = Object.fromEntries(UI_LABEL_KEYS.map((k) => [k, localized(160).optional()])) as Record<
  UiLabelKey,
  z.ZodOptional<ReturnType<typeof localized>>
>;
const statusLabelsShape = Object.fromEntries(
  PROJECT_STATUSES.map((s) => [s, localized(30).optional()]),
) as Record<ProjectStatus, z.ZodOptional<ReturnType<typeof localized>>>;

export const uiSchema = z.object({
  labels: z.object(uiLabelsShape).default({}),
  statusLabels: z.object(statusLabelsShape).default({}),
});
export type UiStrings = z.infer<typeof uiSchema>;

export const navItemSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: localized(30),
  target: linkTargetSchema.refine((v) => v !== '', 'A link target is required'),
});
export type NavItem = z.infer<typeof navItemSchema>;

export const socialLinkSchema = z.object({
  label: z.string().trim().min(1, 'Label required').max(30),
  url: httpsUrlSchema,
});
export type SocialLink = z.infer<typeof socialLinkSchema>;

export const settingsInputSchema = z
  .object({
    siteName: z.string().trim().min(1, 'Required').max(80),
    brandText: z.string().trim().min(1, 'Required').max(24),
    contactEmail: emailSchema.nullable(),
    socialLinks: z.array(socialLinkSchema).max(12),
    nav: z.array(navItemSchema).max(10),
    footer: z.object({ text: localized(240), copyright: localized(120) }),
    seo: z.object({ title: localized(70), description: localized(200) }),
    ui: uiSchema,
    languages: z.array(z.enum(LANGS)).min(1, 'Enable at least one language').max(2),
    defaultLanguage: z.enum(LANGS),
    isPublished: z.boolean(),
    accent: z.enum(ACCENTS),
    theme: z.enum(THEMES),
    background: z.enum(BACKGROUNDS),
    animation: z.enum(ANIMATIONS),
    profileMediaId: uuidSchema.nullable(),
    ogMediaId: uuidSchema.nullable(),
  })
  .refine((s) => s.languages.includes(s.defaultLanguage), {
    path: ['defaultLanguage'],
    message: 'The default language must be one of the enabled languages',
  });
export type SettingsInput = z.infer<typeof settingsInputSchema>;

export type SiteSettings = SettingsInput & { updatedAt: string };

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export interface MediaItem {
  id: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: LocalizedText;
  createdAt: string;
  updatedAt: string;
}

export const mediaAltSchema = localized(200);

export interface MediaUsage {
  kind: 'project' | 'block' | 'settings';
  refId: string;
  label: string;
}

export interface ChangeEntry {
  id: number;
  table: string;
  rowId: string | null;
  action: 'insert' | 'update' | 'delete';
  summary: string;
  at: string;
}

/* ------------------------------------------------------------------ */
/* Aggregate                                                           */
/* ------------------------------------------------------------------ */

/** A stored block whose content no longer matches its schema. Kept so the admin can repair or delete it. */
export interface InvalidBlock {
  id: string;
  type: string;
  adminLabel: string;
  isVisible: boolean;
}

export interface SiteData {
  /** null means the settings row does not exist yet (migrations not applied). */
  settings: SiteSettings | null;
  blocks: ContentBlock[];
  invalidBlocks: InvalidBlock[];
  projects: Project[];
  media: Record<string, MediaItem>;
}
