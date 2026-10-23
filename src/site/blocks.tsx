import type { ReactNode } from 'react';
import { useLanguage } from '@/app/LanguageContext';
import { useSiteData } from '@/app/SiteContext';
import { paragraphs, uiLabel } from '@/content/localize';
import { isSafeTarget, type ContentBlock, type LocalizedText } from '@/content/schema';
import { ProjectGrid } from './projects';
import { ArrowIcon, ExternalIcon, MediaImage, OrbitalArt, Reveal, splitLastWord, useMedia } from './ui';

type BlockOf<T extends ContentBlock['type']> = Extract<ContentBlock, { type: T }>;

/* ----------------------------- primitives ---------------------------- */

/** Anchor, mailto or https link. External links open in a new tab and never leak the opener. */
export function SafeLink({
  target,
  className,
  children,
  onClick,
  current,
}: {
  target: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  current?: boolean;
}) {
  if (!isSafeTarget(target)) return null;
  const aria = current ? ('location' as const) : undefined;
  if (target.startsWith('#') || target.startsWith('mailto:')) {
    return (
      <a href={target} className={className} onClick={onClick} aria-current={aria}>
        {children}
      </a>
    );
  }
  return (
    <a href={target} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {children}
    </a>
  );
}

function Cta({ cta, primary }: { cta: { label: LocalizedText; target: string }; primary?: boolean }) {
  const { t } = useLanguage();
  const label = t(cta.label);
  if (!label || !isSafeTarget(cta.target)) return null;
  const external = cta.target.startsWith('https://');
  return (
    <SafeLink target={cta.target} className={`btn ${primary ? 'btn--primary' : ''}`}>
      {label}
      {external ? <ExternalIcon /> : <ArrowIcon />}
    </SafeLink>
  );
}

function SectionHead({ id, heading, intro }: { id: string; heading: string; intro?: string }) {
  if (!heading && !intro) return null;
  return (
    <Reveal className="section__head">
      {heading && (
        <h2 id={`${id}-heading`} className="section__title">
          {heading}
        </h2>
      )}
      {intro && <p className="section__intro">{intro}</p>}
    </Reveal>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

/* -------------------------------- hero ------------------------------- */

function Hero({ block }: { block: BlockOf<'hero'> }) {
  const { t } = useLanguage();
  const c = block.content;
  const [lead, last] = splitLastWord(t(c.headline));
  return (
    <section id={block.anchor} className="hero" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container hero__inner">
        <div className="hero__copy">
          {t(c.eyebrow) && (
            <p className="mono hero__eyebrow">
              <span className="hero__eyebrow-dot" aria-hidden="true" />
              {t(c.eyebrow)}
            </p>
          )}
          <h1 id={`${block.anchor}-heading`} className="hero__title">
            {lead}
            {last && <em>{last}</em>}
          </h1>
          {t(c.description) && <p className="hero__lead">{t(c.description)}</p>}
          <div className="hero__actions">
            <Cta cta={c.primaryCta} primary />
            <Cta cta={c.secondaryCta} />
          </div>
        </div>
        <OrbitalArt />
      </div>
    </section>
  );
}

/* ------------------------------ projects ----------------------------- */

function ProjectsSection({ block }: { block: BlockOf<'projects'> }) {
  const { t } = useLanguage();
  return (
    <section id={block.anchor} className="section" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container">
        <SectionHead id={block.anchor} heading={t(block.content.heading)} intro={t(block.content.intro)} />
        <ProjectGrid showFilters={block.content.showFilters} />
      </div>
    </section>
  );
}

/* -------------------------------- about ------------------------------ */

function About({ block }: { block: BlockOf<'about'> }) {
  const { t } = useLanguage();
  const data = useSiteData();
  const profile = useMedia(data?.settings?.profileMediaId);
  const c = block.content;
  const showImage = c.showProfileImage && profile;
  return (
    <section id={block.anchor} className="section" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container">
        <div className={`about ${showImage ? 'about--with-image' : ''}`}>
          <div>
            <SectionHead id={block.anchor} heading={t(c.heading)} />
            <Reveal className="prose" delay={60}>
              <Prose text={t(c.body)} />
            </Reveal>
            {c.interests.length > 0 && (
              <Reveal delay={120}>
                <ul className="chips" aria-label={t(c.heading)}>
                  {c.interests.map((it, i) => (
                    <li key={i} className="chip">
                      {t(it)}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>
          {showImage && (
            <Reveal className="about__image" delay={100}>
              <MediaImage mediaId={data?.settings?.profileMediaId} sizes="(min-width: 800px) 320px, 60vw" />
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- tags ------------------------------ */

function Tags({ block }: { block: BlockOf<'tags'> }) {
  const { t } = useLanguage();
  if (block.content.tags.length === 0 && !t(block.content.heading)) return null;
  return (
    <section id={block.anchor} className="section section--tight" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container">
        <SectionHead id={block.anchor} heading={t(block.content.heading)} />
        <Reveal>
          <ul className="chips">
            {block.content.tags.map((tag) => (
              <li key={tag} className="chip">
                {tag}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------ exploring ---------------------------- */

function Exploring({ block }: { block: BlockOf<'exploring'> }) {
  const { t } = useLanguage();
  const c = block.content;
  return (
    <section id={block.anchor} className="section" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container">
        <SectionHead id={block.anchor} heading={t(c.heading)} intro={t(c.intro)} />
        <ol className="explore">
          {c.items.map((item, i) => (
            <Reveal as="li" key={i} className="explore__item" delay={i * 70}>
              <span className="mono explore__index" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="explore__title">{t(item.title)}</h3>
                {t(item.note) && <p className="explore__note">{t(item.note)}</p>}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------- gallery ----------------------------- */

function Gallery({ block }: { block: BlockOf<'gallery'> }) {
  const { t } = useLanguage();
  const data = useSiteData();
  const images = block.content.images.filter((img) => data?.media[img.mediaId]);
  if (images.length === 0) return null;
  return (
    <section id={block.anchor} className="section" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container">
        <SectionHead id={block.anchor} heading={t(block.content.heading)} />
        <ul className="gallery">
          {images.map((img, i) => (
            <Reveal as="li" key={img.mediaId} className="gallery__item" delay={i * 50}>
              <MediaImage mediaId={img.mediaId} sizes="(min-width: 800px) 33vw, 50vw" />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------- contact ----------------------------- */

function Contact({ block }: { block: BlockOf<'contact'> }) {
  const { t, lang } = useLanguage();
  const data = useSiteData();
  const settings = data?.settings ?? null;
  const c = block.content;
  const email = settings?.contactEmail ?? null;
  const links = c.showSocial ? (settings?.socialLinks ?? []) : [];
  const emailLabel = t(c.emailLabel) || uiLabel(settings, 'emailMe', lang);
  return (
    <section id={block.anchor} className="section" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container">
        <Reveal className="contact">
          <div>
            {t(c.heading) && (
              <h2 id={`${block.anchor}-heading`} className="section__title">
                {t(c.heading)}
              </h2>
            )}
            {t(c.body) && <p className="section__intro">{t(c.body)}</p>}
          </div>
          <ul className="contact__links">
            {!email && links.length === 0 && <li className="contact__empty">{uiLabel(settings, 'noContact', lang)}</li>}
            {email && (
              <li>
                <a className="contact__link contact__link--primary" href={`mailto:${email}`}>
                  <span className="mono">{emailLabel}</span>
                  <span className="contact__value">{email}</span>
                  <ArrowIcon />
                </a>
              </li>
            )}
            {links.map((l) => (
              <li key={`${l.label}-${l.url}`}>
                <SafeLink target={l.url} className="contact__link">
                  <span className="mono">{l.label}</span>
                  <span className="contact__value">{new URL(l.url).hostname.replace(/^www\./, '')}</span>
                  <ExternalIcon />
                </SafeLink>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------- text -------------------------------- */

function TextBlock({ block }: { block: BlockOf<'text'> }) {
  const { t } = useLanguage();
  return (
    <section id={block.anchor} className="section" aria-labelledby={`${block.anchor}-heading`}>
      <div className="container container--narrow">
        <SectionHead id={block.anchor} heading={t(block.content.heading)} />
        <Reveal className="prose" delay={60}>
          <Prose text={t(block.content.body)} />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------ dispatcher --------------------------- */

export function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'hero':
      return <Hero block={block} />;
    case 'projects':
      return <ProjectsSection block={block} />;
    case 'about':
      return <About block={block} />;
    case 'tags':
      return <Tags block={block} />;
    case 'exploring':
      return <Exploring block={block} />;
    case 'gallery':
      return <Gallery block={block} />;
    case 'contact':
      return <Contact block={block} />;
    case 'text':
      return <TextBlock block={block} />;
  }
}
