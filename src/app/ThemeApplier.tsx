import { useEffect } from 'react';
import { useSiteData } from './SiteContext';

export const APPEARANCE_CACHE_KEY = 'hlab-appearance';

/**
 * Reflects the validated appearance settings onto <html> as data attributes.
 * CSS only ever sees values from fixed allow-lists. The last values are cached
 * so public/boot.js can apply them before first paint (no theme flash).
 */
export function ThemeApplier() {
  const settings = useSiteData()?.settings;

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.accent = settings.accent;
    root.dataset.bg = settings.background;
    root.dataset.motion = settings.animation;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', settings.theme === 'light' ? '#f6f6f2' : settings.theme === 'black' ? '#000000' : '#0a0b0d');
    try {
      window.localStorage.setItem(
        APPEARANCE_CACHE_KEY,
        JSON.stringify({ theme: settings.theme, accent: settings.accent, bg: settings.background, motion: settings.animation }),
      );
    } catch {
      /* ignore */
    }
  }, [settings]);

  return null;
}
