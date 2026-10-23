import { LANGS, type Lang, type LocalizedText, type SiteSettings, type UiLabelKey, type ProjectStatus } from './schema';

/**
 * Resolve localized text: requested language -> default language -> any other
 * language that has text. Returns '' when nothing is available.
 */
export function pick(text: LocalizedText | undefined | null, lang: Lang, defaultLang: Lang = 'en'): string {
  if (!text) return '';
  const order: Lang[] = [lang, defaultLang, ...LANGS];
  for (const l of order) {
    const v = text[l]?.trim();
    if (v) return v;
  }
  return '';
}

/** True when the text has content for this exact language (no fallback). */
export function hasText(text: LocalizedText | undefined | null, lang: Lang): boolean {
  return Boolean(text?.[lang]?.trim());
}

/** Plain-text paragraphs: blank line separated. Never interpreted as HTML. */
export function paragraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Last-resort strings so the interface stays usable if a label was cleared. */
export const FALLBACK_LABELS: Record<UiLabelKey, string> = {
  viewProject: 'View project',
  visitProject: 'Open project',
  sourceCode: 'Source code',
  newTab: 'opens in a new tab',
  close: 'Close',
  allProjects: 'All',
  skipToContent: 'Skip to content',
  language: 'Language',
  menu: 'Menu',
  noProjects: 'No projects to show yet.',
  emailMe: 'Email',
  noContact: 'Contact details will appear here soon.',
  comingSoonTitle: 'Coming soon',
  comingSoonBody: 'This site is being prepared. Please check back shortly.',
  previewBanner: 'Preview: unpublished changes and hidden items are visible only to you.',
};

export const FALLBACK_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  experiment: 'Experiment',
  paused: 'Paused',
  completed: 'Completed',
};

export function uiLabel(settings: SiteSettings | null, key: UiLabelKey, lang: Lang): string {
  const fromDb = pick(settings?.ui.labels[key], lang, settings?.defaultLanguage);
  return fromDb || FALLBACK_LABELS[key];
}

export function statusLabel(settings: SiteSettings | null, status: ProjectStatus, lang: Lang): string {
  const fromDb = pick(settings?.ui.statusLabels[status], lang, settings?.defaultLanguage);
  return fromDb || FALLBACK_STATUS_LABELS[status];
}

/** Lowercase url-safe slug. Handles Turkish characters. */
export function slugify(input: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  return input
    .replace(/[çğıöşüİ]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Return `base`, or `base-2`, `base-3`... so the result is not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const root = base || 'item';
  if (!set.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root.slice(0, 60)}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export function formatCopyright(template: string, siteName: string, year = new Date().getFullYear()): string {
  return template.replaceAll('{year}', String(year)).replaceAll('{site}', siteName);
}
