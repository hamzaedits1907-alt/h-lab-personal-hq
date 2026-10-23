import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/LanguageContext';
import { useRepository } from '@/app/RepositoryContext';
import { useSeo } from '@/app/seo';
import { useSite } from '@/app/SiteContext';
import { formatCopyright, uiLabel } from '@/content/localize';
import { LANG_NAMES, isSafeTarget } from '@/content/schema';
import { BlockView, SafeLink } from './blocks';
import { useVisibleContent } from './content';
import { ProjectDialog } from './projects';
import { BrandMark, ExternalIcon } from './ui';

/* ------------------------------ scroll spy --------------------------- */

function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) return;
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

/* -------------------------------- header ----------------------------- */

function Header() {
  const { settings, blocks } = useVisibleContent();
  const { t, lang, languages, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const anchors = useMemo(() => new Set(blocks.map((b) => b.anchor)), [blocks]);
  // Never show a nav link that points at a section that is not on the page.
  const items = useMemo(
    () =>
      (settings?.nav ?? []).filter((n) => {
        if (!isSafeTarget(n.target) || !t(n.label)) return false;
        return n.target.startsWith('#') ? anchors.has(n.target.slice(1)) : true;
      }),
    [settings, anchors, t],
  );
  const active = useScrollSpy(items.filter((i) => i.target.startsWith('#')).map((i) => i.target.slice(1)));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!settings) return null;
  const menuLabel = uiLabel(settings, 'menu', lang);

  return (
    <header className={`header ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
      <div className="container header__inner">
        <Link to="/" className="brand" onClick={() => window.scrollTo({ top: 0 })} aria-label={settings.siteName}>
          <BrandMark />
          <span className="brand__text">{settings.brandText}</span>
        </Link>

        <nav className="nav" aria-label="Main">
          <ul id="site-nav" className="nav__list">
            {items.map((n) => (
              <li key={n.id}>
                <SafeLink
                  target={n.target}
                  className={`nav__link ${n.target === `#${active}` ? 'is-active' : ''}`}
                  current={n.target === `#${active}`}
                  onClick={() => setOpen(false)}
                >
                  {t(n.label)}
                  {n.target.startsWith('https://') && <ExternalIcon />}
                </SafeLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="header__tools">
          {languages.length > 1 && (
            <div className="lang" role="group" aria-label={uiLabel(settings, 'language', lang)}>
              {languages.map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} lang={l} onClick={() => setLang(l)} title={LANG_NAMES[l]}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="visually-hidden">{menuLabel}</span>
            <span className="menu-btn__bars" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id="mobile-nav" className="mobile-nav" hidden={!open}>
        <ul className="container mobile-nav__list">
          {items.map((n) => (
            <li key={n.id}>
              <SafeLink target={n.target} className="mobile-nav__link" onClick={() => setOpen(false)}>
                {t(n.label)}
              </SafeLink>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

/* -------------------------------- footer ----------------------------- */

function Footer() {
  const { settings } = useVisibleContent();
  const { t } = useLanguage();
  if (!settings) return null;
  const copyright = formatCopyright(t(settings.footer.copyright), settings.siteName);
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <BrandMark size={22} />
          <div>
            <p className="footer__name">{settings.brandText}</p>
            {t(settings.footer.text) && <p className="footer__text">{t(settings.footer.text)}</p>}
          </div>
        </div>
        {settings.socialLinks.length > 0 && (
          <ul className="footer__links">
            {settings.socialLinks.map((l) => (
              <li key={`${l.label}-${l.url}`}>
                <SafeLink target={l.url} className="footer__link">
                  {l.label} <ExternalIcon />
                </SafeLink>
              </li>
            ))}
          </ul>
        )}
        {copyright && <p className="footer__copy mono">{copyright}</p>}
      </div>
    </footer>
  );
}

/* -------------------------------- states ----------------------------- */

export function LoadingState() {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>Loading…</p>
    </div>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <h1>{title}</h1>
      <p>{message}</p>
      {onRetry && (
        <p>
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="state">
      <h1>Page not found</h1>
      <p>That page does not exist.</p>
      <p>
        <Link className="btn" to="/">
          Back to the home page
        </Link>
      </p>
    </div>
  );
}

/* --------------------------------- page ------------------------------ */

export function SitePage() {
  const { state, reload } = useSite();
  const repo = useRepository();
  const { settings, blocks, preview } = useVisibleContent();
  const { t, lang } = useLanguage();

  const ogMedia = useSiteMediaUrl(settings?.ogMediaId ?? null);
  useSeo(
    settings
      ? {
          title: t(settings.seo.title) || settings.siteName,
          description: t(settings.seo.description),
          image: ogMedia,
          siteName: settings.siteName,
          lang,
          noindex: !settings.isPublished,
        }
      : null,
  );

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') {
    return (
      <ErrorState
        title={state.error.code === 'config' ? 'Not configured yet' : 'We could not load this site'}
        message={
          state.error.code === 'config'
            ? state.error.message
            : 'The content is temporarily unavailable. Nothing has been lost. Please try again in a moment.'
        }
        onRetry={state.error.code === 'config' ? undefined : () => void reload()}
      />
    );
  }
  if (!settings) {
    return (
      <ErrorState
        title="This site isn't set up yet"
        message="The database is reachable but has no site settings. The owner needs to run the database migrations (see docs/DEPLOYMENT.md)."
      />
    );
  }
  if (!settings.isPublished && !preview) {
    return (
      <main className="state" id="content">
        <BrandMark size={44} />
        <h1>{t(settings.ui.labels.comingSoonTitle) || uiLabel(settings, 'comingSoonTitle', lang)}</h1>
        <p>{t(settings.ui.labels.comingSoonBody) || uiLabel(settings, 'comingSoonBody', lang)}</p>
      </main>
    );
  }

  return (
    <>
      <a href="#content" className="skip-link">
        {uiLabel(settings, 'skipToContent', lang)}
      </a>
      <Background />
      {preview && (
        <div className="preview-banner" role="status">
          <span>{uiLabel(settings, 'previewBanner', lang)}</span>
          <Link to="/admin">Back to admin</Link>
        </div>
      )}
      <Header />
      <main id="content" data-source={repo.kind}>
        {blocks.length === 0 ? (
          <div className="state">
            <h1>{settings.siteName}</h1>
            <p>Nothing to show yet.</p>
          </div>
        ) : (
          blocks.map((b) => (
            <div key={b.id} className={b.isVisible ? undefined : 'is-hidden-preview'} data-block={b.type}>
              <BlockView block={b} />
            </div>
          ))
        )}
      </main>
      <Footer />
      <ProjectDialog />
    </>
  );
}

function useSiteMediaUrl(id: string | null): string | null {
  const { state } = useSite();
  const repo = useRepository();
  if (!id || state.status !== 'ready') return null;
  const m = state.data.media[id];
  if (!m) return null;
  const url = repo.mediaUrl(m);
  // Social crawlers need an absolute URL.
  return url.startsWith('http') ? url : null;
}

export function Background() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="bg__glow" />
      <div className="bg__glow bg__glow--2" />
      <div className="bg__grid" />
      <svg className="bg__rings" viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="0.4">
        {[60, 100, 140, 180, 220, 260].map((r) => (
          <circle key={r} cx="200" cy="200" r={r / 1.4} />
        ))}
      </svg>
    </div>
  );
}
