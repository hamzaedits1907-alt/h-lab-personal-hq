import { useEffect } from 'react';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export interface SeoValues {
  title: string;
  description: string;
  image?: string | null;
  siteName: string;
  lang: string;
  noindex?: boolean;
}

/** Client-side meta updates. Crawlers that do not run JavaScript see the static tags in index.html. */
export function useSeo(v: SeoValues | null) {
  const { title, description, image, siteName, lang, noindex } = v ?? {
    title: '',
    description: '',
    image: null,
    siteName: '',
    lang: 'en',
    noindex: false,
  };
  const active = v !== null;

  useEffect(() => {
    if (!active) return;
    if (title) document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:site_name', siteName);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:locale', lang === 'tr' ? 'tr_TR' : 'en_US');
    setMeta('property', 'og:image', image ?? '');
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', image ?? '');
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
  }, [active, title, description, image, siteName, lang, noindex]);
}
