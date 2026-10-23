import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { useRepository } from '@/app/RepositoryContext';
import { useSiteData } from '@/app/SiteContext';
import { useLanguage } from '@/app/LanguageContext';
import type { MediaItem } from '@/content/schema';

/* ------------------------------ icons ------------------------------ */

export function ArrowIcon({ className = 'arrow' }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ----------------------------- brand mark ---------------------------- */

/** Original H/LAB mark: an H whose crossbar is a slash, with a small orbiting node. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="brand-mark">
      <rect x="6" y="7" width="3.2" height="18" rx="1.2" fill="currentColor" />
      <rect x="22.8" y="7" width="3.2" height="18" rx="1.2" fill="currentColor" />
      <path d="M10.5 22.5L21.5 9.5" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="27" cy="5" r="2" fill="var(--accent-2)" />
    </svg>
  );
}

/* --------------------------- animated artwork ------------------------- */

/** Layered orbits and geometry. Pure SVG + CSS transforms; paused by motion preferences. */
export function OrbitalArt() {
  const ref = useRef<HTMLDivElement>(null);

  // Gentle pointer parallax (only when motion is allowed). Writes two CSS variables.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia?.('(hover: hover)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (document.documentElement.dataset.motion !== 'full') return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        el.style.setProperty('--py', ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="art" ref={ref} aria-hidden="true">
      <svg viewBox="0 0 400 400" className="art__svg" focusable="false">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="200" cy="200" r="150" fill="url(#core)" opacity="0.5" />

        <g className="art__layer art__layer--far">
          <circle cx="200" cy="200" r="188" className="art__ring art__ring--dash" />
          <g className="art__spin art__spin--slow">
            <circle cx="388" cy="200" r="3" fill="var(--accent-2)" />
            <circle cx="12" cy="200" r="1.6" fill="var(--text-faint)" />
          </g>
        </g>

        <g className="art__layer art__layer--mid">
          <circle cx="200" cy="200" r="140" className="art__ring" />
          <g className="art__spin art__spin--rev">
            <circle cx="340" cy="200" r="5" fill="var(--accent)" />
            <circle cx="340" cy="200" r="11" className="art__halo" />
          </g>
          <rect x="108" y="108" width="184" height="184" className="art__shape art__shape--lav art__rotate-slow" />
        </g>

        <g className="art__layer art__layer--near">
          <circle cx="200" cy="200" r="92" className="art__ring art__ring--strong" />
          <g className="art__spin">
            <circle cx="292" cy="200" r="3.5" fill="var(--text)" />
          </g>
          <polygon points="200,128 262,236 138,236" className="art__shape art__shape--mint art__rotate" />
          <circle cx="200" cy="200" r="5" fill="var(--accent)" />
        </g>

        <g className="art__ticks">
          {Array.from({ length: 24 }, (_, i) => (
            <line key={i} x1="200" y1="6" x2="200" y2={i % 6 === 0 ? 20 : 13} transform={`rotate(${i * 15} 200 200)`} />
          ))}
        </g>
        <g className="art__plus">
          <path d="M60 80h12M66 74v12" />
          <path d="M338 330h12M344 324v12" />
          <path d="M338 70h8M342 66v8" />
        </g>
      </svg>
    </div>
  );
}

/** Deterministic abstract cover used when a project has no image. */
export function PlaceholderArt({ seed }: { seed: string }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const cx = 28 + (h % 44);
  const cy = 26 + ((h >> 3) % 12);
  const r = 9 + ((h >> 6) % 7);
  return (
    <svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice" className="placeholder-art" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.35">
        <circle cx={cx} cy={cy} r={r} />
        <circle cx={cx} cy={cy} r={r * 1.8} opacity="0.55" />
        <circle cx={cx} cy={cy} r={r * 2.8} opacity="0.3" />
        <rect x={cx - r * 0.7} y={cy - r * 0.7} width={r * 1.4} height={r * 1.4} transform={`rotate(${a % 90} ${cx} ${cy})`} stroke="var(--accent-2)" />
        <path d={`M0 ${cy}H100M${cx} 0V62`} opacity="0.18" />
      </g>
      <circle cx={cx + r} cy={cy} r="1.3" fill="var(--accent)" />
    </svg>
  );
}

/* ------------------------------ reveal ----------------------------- */

interface RevealProps {
  as?: ElementType;
  className?: string;
  delay?: number;
  children: ReactNode;
}

/** Fades content in once when it scrolls into view. Content stays visible if observers are unavailable. */
export function Reveal({ as: Tag = 'div', className = '', delay = 0, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  const style: CSSProperties | undefined = delay ? ({ '--delay': `${delay}ms` } as CSSProperties) : undefined;
  return (
    <Tag ref={ref} className={`reveal ${shown ? 'is-in' : ''} ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}

/* ------------------------------- media ----------------------------- */

export function useMedia(id: string | null | undefined): { item: MediaItem; url: string; alt: string } | null {
  const repo = useRepository();
  const data = useSiteData();
  const { t } = useLanguage();
  if (!id || !data) return null;
  const item = data.media[id];
  if (!item) return null;
  return { item, url: repo.mediaUrl(item), alt: t(item.alt) };
}

interface MediaImageProps {
  mediaId: string | null | undefined;
  className?: string;
  eager?: boolean;
  sizes?: string;
  fallback?: ReactNode;
}

/** An <img> for a media-library item, with intrinsic size (no layout shift) and a graceful fallback. */
export function MediaImage({ mediaId, className, eager = false, sizes, fallback = null }: MediaImageProps) {
  const media = useMedia(mediaId);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [media?.url]);
  if (!media || broken) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={media.url}
      alt={media.alt}
      width={media.item.width ?? undefined}
      height={media.item.height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      sizes={sizes}
      onError={() => setBroken(true)}
    />
  );
}

/** Split the final word off a headline so it can be set in the accent style. */
export function splitLastWord(text: string): [string, string] {
  const trimmed = text.trim();
  const m = /^(.*\s)(\S+)$/s.exec(trimmed);
  return m ? [m[1] ?? '', m[2] ?? ''] : ['', trimmed];
}
