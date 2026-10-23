import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANGS, type Lang, type LocalizedText } from '@/content/schema';
import { pick } from '@/content/localize';
import { useSiteData } from './SiteContext';

interface LanguageContextValue {
  lang: Lang;
  languages: Lang[];
  defaultLanguage: Lang;
  setLang: (l: Lang) => void;
  /** Resolve localized text for the current language, with fallback. */
  t: (text: LocalizedText | undefined | null) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'hlab-lang';

function readStored(): Lang | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return (LANGS as readonly string[]).includes(v ?? '') ? (v as Lang) : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const data = useSiteData();
  const languages = useMemo<Lang[]>(() => data?.settings?.languages ?? ['en'], [data]);
  const defaultLanguage: Lang = data?.settings?.defaultLanguage ?? 'en';
  const [chosen, setChosen] = useState<Lang | null>(readStored);

  const lang = useMemo<Lang>(() => {
    if (chosen && languages.includes(chosen)) return chosen;
    const browser = (typeof navigator !== 'undefined' ? navigator.language : '').slice(0, 2).toLowerCase();
    const match = languages.find((l) => l === browser);
    return match ?? defaultLanguage;
  }, [chosen, languages, defaultLanguage]);

  const setLang = useCallback((l: Lang) => {
    setChosen(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable: the choice just lasts for this visit */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((text: LocalizedText | undefined | null) => pick(text, lang, defaultLanguage), [lang, defaultLanguage]);
  const value = useMemo(() => ({ lang, languages, defaultLanguage, setLang, t }), [lang, languages, defaultLanguage, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}
