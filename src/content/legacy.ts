/**
 * Starter text shipped by earlier releases. Used ONLY to recognise copy that is still
 * exactly the old starter text, so it can be upgraded without ever overwriting
 * something the owner wrote. (Mirrors the guarded updates in migration 0004.)
 */
export const LEGACY_ABOUT_BODY = {
  en: 'H/LAB is where I keep my personal projects: AI tools, desktop software, games and simulations. Everything here is a work in progress.',
  tr: 'H/LAB, kişisel projelerimi topladığım yer: yapay zekâ araçları, masaüstü yazılımları, oyunlar ve simülasyonlar. Buradaki her şey yapım aşamasında.',
};

export const LEGACY_VISIT_LABEL = { en: 'Visit project', tr: 'Projeye git' };

export const sameLocalized = (a: unknown, b: Record<string, string>): boolean => {
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(b)]);
  return [...keys].every((k) => (x[k] ?? undefined) === (b[k] ?? undefined));
};
