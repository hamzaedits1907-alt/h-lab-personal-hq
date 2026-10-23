import { z } from 'zod';
import {
  BLOCK_TYPES,
  LANGS,
  navItemSchema,
  safeParseBlockContent,
  socialLinkSchema,
  uiSchema,
  localized,
  type BlockType,
  type ContentBlock,
  type InvalidBlock,
  type Lang,
  type MediaItem,
  type Project,
  type ProjectStatus,
  type SettingsInput,
  type SiteSettings,
} from '@/content/schema';

/** Row shapes exactly as stored in Postgres (snake_case). */
export interface SettingsRow {
  id: number;
  site_name: string;
  brand_text: string;
  contact_email: string | null;
  social_links: unknown;
  nav: unknown;
  footer: unknown;
  seo: unknown;
  ui: unknown;
  languages: string[];
  default_language: string;
  is_published: boolean;
  accent: string;
  theme: string;
  background: string;
  animation: string;
  profile_media_id: string | null;
  og_media_id: string | null;
  updated_at: string;
}

export interface BlockRow {
  id: string;
  type: string;
  anchor: string;
  admin_label: string;
  content: unknown;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  slug: string;
  title: string;
  summary: unknown;
  description: unknown;
  status: string;
  tags: string[] | null;
  url: string | null;
  cover_media_id: string | null;
  position: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface MediaRow {
  id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt: unknown;
  created_at: string;
  updated_at: string;
}

/** Use the stored value if it validates, otherwise a safe default. Reading never throws on one bad field. */
function lenient<S extends z.ZodType>(schema: S, value: unknown, fallback: z.output<S>): z.output<S> {
  const r = schema.safeParse(value);
  return r.success ? r.data : fallback;
}

const looseLocalized = localized(5000);
const footerSchema = z.object({ text: looseLocalized.default({}), copyright: looseLocalized.default({}) });
const seoSchema = z.object({ title: looseLocalized.default({}), description: looseLocalized.default({}) });

const oneOf = <T extends string>(allowed: readonly T[], value: string, fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export function rowToSettings(r: SettingsRow): SiteSettings {
  const languages = r.languages.filter((l): l is Lang => (LANGS as readonly string[]).includes(l));
  const defaultLanguage = oneOf(LANGS, r.default_language, 'en');
  return {
    siteName: r.site_name,
    brandText: r.brand_text,
    contactEmail: r.contact_email,
    socialLinks: lenient(z.array(socialLinkSchema), r.social_links, []),
    nav: lenient(z.array(navItemSchema), r.nav, []),
    footer: lenient(footerSchema, r.footer, { text: {}, copyright: {} }),
    seo: lenient(seoSchema, r.seo, { title: {}, description: {} }),
    ui: lenient(uiSchema, r.ui, { labels: {}, statusLabels: {} }),
    languages: languages.length ? languages : ['en'],
    defaultLanguage,
    isPublished: r.is_published,
    accent: oneOf(['mint', 'lavender', 'sky', 'amber', 'rose'], r.accent, 'mint'),
    theme: oneOf(['dark', 'black', 'light'], r.theme, 'dark'),
    background: oneOf(['orbits', 'grid', 'plain'], r.background, 'orbits'),
    animation: oneOf(['full', 'subtle', 'off'], r.animation, 'full'),
    profileMediaId: r.profile_media_id,
    ogMediaId: r.og_media_id,
    updatedAt: r.updated_at,
  };
}

export function settingsToRow(s: SettingsInput) {
  return {
    site_name: s.siteName,
    brand_text: s.brandText,
    contact_email: s.contactEmail,
    social_links: s.socialLinks,
    nav: s.nav,
    footer: s.footer,
    seo: s.seo,
    ui: s.ui,
    languages: s.languages,
    default_language: s.defaultLanguage,
    is_published: s.isPublished,
    accent: s.accent,
    theme: s.theme,
    background: s.background,
    animation: s.animation,
    profile_media_id: s.profileMediaId,
    og_media_id: s.ogMediaId,
  };
}

/** Returns the typed block, or null when the stored content does not match its type. */
export function rowToBlock(r: BlockRow): ContentBlock | null {
  if (!(BLOCK_TYPES as readonly string[]).includes(r.type)) return null;
  const type = r.type as BlockType;
  const parsed = safeParseBlockContent(type, r.content ?? {});
  if (!parsed.success) return null;
  return {
    id: r.id,
    type,
    anchor: r.anchor,
    adminLabel: r.admin_label,
    position: r.position,
    isVisible: r.is_visible,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    content: parsed.data,
  } as ContentBlock;
}

export function rowToInvalidBlock(r: BlockRow): InvalidBlock {
  return { id: r.id, type: r.type, adminLabel: r.admin_label, isVisible: r.is_visible };
}

export function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: lenient(looseLocalized, r.summary, {}),
    description: lenient(looseLocalized, r.description, {}),
    status: oneOf<ProjectStatus>(['active', 'experiment', 'paused', 'completed'], r.status, 'active'),
    tags: r.tags ?? [],
    url: r.url,
    coverMediaId: r.cover_media_id,
    isVisible: r.is_visible,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function projectToRow(p: Partial<Omit<Project, 'id' | 'position' | 'createdAt' | 'updatedAt'>>) {
  const row: Record<string, unknown> = {};
  if (p.slug !== undefined) row.slug = p.slug;
  if (p.title !== undefined) row.title = p.title;
  if (p.summary !== undefined) row.summary = p.summary;
  if (p.description !== undefined) row.description = p.description;
  if (p.status !== undefined) row.status = p.status;
  if (p.tags !== undefined) row.tags = p.tags;
  if (p.url !== undefined) row.url = p.url;
  if (p.coverMediaId !== undefined) row.cover_media_id = p.coverMediaId;
  if (p.isVisible !== undefined) row.is_visible = p.isVisible;
  return row;
}

export function rowToMedia(r: MediaRow): MediaItem {
  return {
    id: r.id,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    width: r.width,
    height: r.height,
    alt: lenient(looseLocalized, r.alt, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
