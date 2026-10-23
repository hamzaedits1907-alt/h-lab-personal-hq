import type { ReactNode } from 'react';
import { PlaceholderArt } from './ui';

/**
 * Original cover artwork for the starter projects. Pure SVG (a few hundred bytes each),
 * bundled with the app: no image requests, no external services. Colors come from the
 * site's theme variables so the art follows the owner's accent/theme choices.
 *
 * It is only the FALLBACK: a cover uploaded through the media library always wins,
 * and projects whose address is not listed here get the generic geometric placeholder.
 */

const A = 'var(--accent)';
const B = 'var(--accent-2)';
const F = 'var(--text-faint)';
const L = 'var(--line-strong)';

function Frame({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className="cover-art" data-art={slug} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`glow-${slug}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={A} stopOpacity="0.22" />
          <stop offset="100%" stopColor={A} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="100" fill={`url(#glow-${slug})`} />
      {children}
    </svg>
  );
}

/* Project Genius: an AI workspace as a connected constellation of ideas around a core. */
function Genius() {
  const nodes: [number, number, number, boolean][] = [
    [34, 28, 3, false], [52, 72, 2.5, true], [118, 26, 3.2, true], [132, 66, 2.6, false], [100, 80, 2, false], [70, 18, 2, true],
  ];
  return (
    <Frame slug="project-genius">
      <g stroke={L} strokeWidth="0.6" fill="none">
        {nodes.map(([x, y], i) => (
          <line key={i} x1="80" y1="50" x2={x} y2={y} />
        ))}
        <line x1="34" y1="28" x2="52" y2="72" opacity="0.5" />
        <line x1="118" y1="26" x2="132" y2="66" opacity="0.5" />
        <line x1="100" y1="80" x2="132" y2="66" opacity="0.5" />
      </g>
      <g className="cover-art__spin">
        <circle cx="80" cy="50" r="17" fill="none" stroke={B} strokeWidth="0.7" strokeDasharray="1.5 3" />
        <circle cx="97" cy="50" r="1.8" fill={B} />
      </g>
      {nodes.map(([x, y, r, alt], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={alt ? B : A} opacity="0.9" />
      ))}
      <circle cx="80" cy="50" r="7" fill={A} />
      <circle cx="80" cy="50" r="11" fill="none" stroke={A} strokeWidth="0.8" opacity="0.6" />
      <g fill="none" stroke={F} strokeWidth="0.7" strokeLinecap="round">
        <rect x="10" y="10" width="26" height="14" rx="2" opacity="0.5" />
        <path d="M14 15h14M14 19h9" opacity="0.7" />
        <rect x="124" y="76" width="26" height="14" rx="2" opacity="0.5" />
        <path d="M128 81h14M128 85h9" opacity="0.7" />
      </g>
    </Frame>
  );
}

/* Project Browser: a window with tabs and a speed gauge. */
function Browser() {
  return (
    <Frame slug="project-browser">
      <rect x="24" y="18" width="112" height="66" rx="5" fill="none" stroke={L} strokeWidth="0.9" />
      <path d="M24 32h112" stroke={L} strokeWidth="0.8" />
      <g fill={F}>
        <circle cx="31" cy="25" r="1.4" />
        <circle cx="37" cy="25" r="1.4" />
        <circle cx="43" cy="25" r="1.4" />
      </g>
      <rect x="52" y="22" width="30" height="7" rx="3.5" fill="none" stroke={A} strokeWidth="0.8" />
      <rect x="86" y="22" width="22" height="7" rx="3.5" fill="none" stroke={F} strokeWidth="0.6" opacity="0.6" />
      <path d="M62 62a20 20 0 0 1 40 0" fill="none" stroke={L} strokeWidth="3" strokeLinecap="round" />
      <path d="M62 62a20 20 0 0 1 30.5-17" fill="none" stroke={A} strokeWidth="3" strokeLinecap="round" />
      <path d="M82 62L95 48" stroke={B} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="82" cy="62" r="3" fill={B} />
      <g stroke={A} strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <path d="M112 44h14M108 52h22M114 60h12" />
      </g>
    </Frame>
  );
}

/* Project-Frame: a film strip with a timeline; the playhead is paused. */
function Frames() {
  return (
    <Frame slug="project-frame">
      <rect x="14" y="14" width="132" height="44" rx="3" fill="none" stroke={L} strokeWidth="0.9" />
      <g fill={L}>
        {Array.from({ length: 14 }, (_, i) => (
          <g key={i}>
            <rect x={18 + i * 9.3} y="16.5" width="4" height="3" rx="0.8" />
            <rect x={18 + i * 9.3} y="52.5" width="4" height="3" rx="0.8" />
          </g>
        ))}
      </g>
      <rect x="20" y="23" width="36" height="26" rx="2" fill="none" stroke={F} strokeWidth="0.7" />
      <rect x="62" y="23" width="36" height="26" rx="2" fill="none" stroke={A} strokeWidth="1" />
      <rect x="104" y="23" width="36" height="26" rx="2" fill="none" stroke={F} strokeWidth="0.7" />
      <path d="M70 43l8-9 7 6 6-4" fill="none" stroke={A} strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx="87" cy="30" r="2" fill={B} />
      <g strokeLinecap="round">
        <path d="M14 76h132" stroke={L} strokeWidth="1" />
        <path d="M20 76h38" stroke={B} strokeWidth="4" opacity="0.8" />
        <path d="M62 76h50" stroke={A} strokeWidth="4" opacity="0.8" />
      </g>
      <path d="M80 66v20" stroke={A} strokeWidth="1" />
      <g fill={A}>
        <rect x="76.5" y="86" width="2" height="6" rx="0.6" />
        <rect x="81.5" y="86" width="2" height="6" rx="0.6" />
      </g>
    </Frame>
  );
}

/* JARVIS: a desktop command-center HUD. */
function Jarvis() {
  return (
    <Frame slug="jarvis">
      <g className="cover-art__spin" fill="none">
        <circle cx="80" cy="50" r="36" stroke={L} strokeWidth="0.8" strokeDasharray="2 4" />
        <circle cx="116" cy="50" r="2" fill={B} />
      </g>
      <g fill="none" strokeLinecap="round">
        <path d="M80 18a32 32 0 0 1 27 15" stroke={A} strokeWidth="2.4" />
        <path d="M53 33a32 32 0 0 1 14-12" stroke={B} strokeWidth="1.4" opacity="0.8" />
        <circle cx="80" cy="50" r="22" stroke={L} strokeWidth="0.8" />
        <circle cx="80" cy="50" r="12" stroke={A} strokeWidth="1" opacity="0.7" />
      </g>
      <g stroke={F} strokeWidth="0.6" opacity="0.7">
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1="80" y1="9" x2="80" y2={i % 6 === 0 ? 14 : 12} transform={`rotate(${i * 15} 80 50)`} />
        ))}
      </g>
      <circle cx="80" cy="50" r="3.2" fill={A} />
      <g fill={L}>
        <rect x="12" y="30" width="20" height="3" rx="1.5" />
        <rect x="12" y="38" width="14" height="3" rx="1.5" />
        <rect x="12" y="46" width="18" height="3" rx="1.5" />
        <rect x="128" y="54" width="20" height="3" rx="1.5" />
        <rect x="134" y="62" width="14" height="3" rx="1.5" />
        <rect x="130" y="70" width="18" height="3" rx="1.5" />
      </g>
      <rect x="12" y="30" width="12" height="3" rx="1.5" fill={A} />
      <rect x="136" y="54" width="12" height="3" rx="1.5" fill={B} />
    </Frame>
  );
}

/* Edward: an attentive companion: an orb with an eye, orbited by context. */
function Edward() {
  return (
    <Frame slug="edward">
      <ellipse cx="80" cy="50" rx="48" ry="17" fill="none" stroke={L} strokeWidth="0.8" transform="rotate(-18 80 50)" />
      <g className="cover-art__spin" fill="none">
        <circle cx="80" cy="50" r="26" stroke={B} strokeWidth="0.7" strokeDasharray="1 3.5" />
        <circle cx="106" cy="50" r="2.2" fill={B} />
        <circle cx="54" cy="50" r="1.5" fill={A} />
      </g>
      <circle cx="80" cy="50" r="17" fill="none" stroke={A} strokeWidth="1.2" />
      <circle cx="80" cy="50" r="17" fill={A} opacity="0.08" />
      <path d="M62 50c6-9 12-12 18-12s12 3 18 12c-6 9-12 12-18 12s-12-3-18-12z" fill="none" stroke={A} strokeWidth="1" strokeLinejoin="round" />
      <circle cx="80" cy="50" r="5.5" fill={A} />
      <circle cx="82" cy="48" r="1.8" fill="var(--bg)" opacity="0.8" />
      <g fill="none" stroke={F} strokeWidth="0.7" strokeLinejoin="round">
        <path d="M118 18h26a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-17l-5 5v-5h-4a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3z" opacity="0.7" />
      </g>
      <path d="M122 24h20M122 29h12" stroke={F} strokeWidth="0.7" strokeLinecap="round" opacity="0.6" />
    </Frame>
  );
}

/* Lufthansa Launcher: a game library grid with a launch action and a community row. */
function Launcher() {
  const tiles = [0, 1, 2, 3].flatMap((c) => [0, 1].map((r) => ({ c, r })));
  return (
    <Frame slug="lufthansa-launcher">
      {tiles.map(({ c, r }) => {
        const hot = c === 1 && r === 0;
        return (
          <rect
            key={`${c}-${r}`}
            x={22 + c * 31}
            y={16 + r * 27}
            width="27"
            height="23"
            rx="3.5"
            fill={hot ? A : 'none'}
            fillOpacity={hot ? 0.16 : 0}
            stroke={hot ? A : L}
            strokeWidth={hot ? 1.2 : 0.8}
          />
        );
      })}
      <path d="M59 22.5l9 5.5-9 5.5z" fill={A} />
      <g fill="none" stroke={F} strokeWidth="0.6" opacity="0.7">
        <path d="M28 27l8 4 8-4M28 54l8 4 8-4M121 27l8 4 8-4M90 54l8 4 8-4" />
      </g>
      <path d="M116 66l8 4-8 4M124 66l8 4-8 4" fill="none" stroke={B} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <g>
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={34 + i * 9} cy="80" r="3.2" fill="none" stroke={i % 2 ? B : A} strokeWidth="1" />
        ))}
        <circle cx="34" cy="80" r="1.4" fill={A} />
        <circle cx="52" cy="80" r="1.4" fill={A} />
        <circle cx="70" cy="80" r="1.4" fill={A} />
      </g>
    </Frame>
  );
}

/* Project Genesis: a wireframe world with a terrain mesh. */
function Genesis() {
  return (
    <Frame slug="project-genesis">
      <g fill="none" stroke={L} strokeWidth="0.7">
        <circle cx="80" cy="46" r="30" stroke={A} strokeWidth="1.1" />
        <ellipse cx="80" cy="46" rx="30" ry="9" />
        <ellipse cx="80" cy="46" rx="30" ry="19" opacity="0.7" />
        <ellipse cx="80" cy="46" rx="11" ry="30" />
        <ellipse cx="80" cy="46" rx="21" ry="30" opacity="0.7" />
        <path d="M80 16v60" opacity="0.6" />
      </g>
      <g className="cover-art__spin">
        <ellipse cx="80" cy="46" rx="48" ry="12" fill="none" stroke={B} strokeWidth="0.6" strokeDasharray="1 3" transform="rotate(-22 80 46)" />
        <circle cx="122" cy="36" r="3" fill={B} />
      </g>
      <g stroke={F} strokeWidth="0.6" fill="none" opacity="0.8">
        <path d="M10 88l24-7 26 6 28-8 24 7 28-6" />
        <path d="M10 94l24-6 26 5 28-7 24 6 28-5" opacity="0.6" />
        <path d="M34 81v7M60 87v6M88 79v7M112 86v6" opacity="0.5" />
      </g>
      <g fill={A}>
        <circle cx="18" cy="20" r="0.9" />
        <circle cx="140" cy="16" r="1.1" />
        <circle cx="30" cy="50" r="0.8" />
        <circle cx="146" cy="60" r="0.9" />
        <circle cx="52" cy="10" r="0.8" />
      </g>
    </Frame>
  );
}

const STARTER_COVERS: Record<string, () => ReactNode> = {
  'project-genius': Genius,
  'project-browser': Browser,
  'project-frame': Frames,
  jarvis: Jarvis,
  edward: Edward,
  'lufthansa-launcher': Launcher,
  'project-genesis': Genesis,
};

/** Built-in artwork for a starter project, or the generic geometric placeholder for any other. */
export function ProjectCoverArt({ slug }: { slug: string }) {
  const Art = STARTER_COVERS[slug];
  return Art ? <>{Art()}</> : <PlaceholderArt seed={slug} />;
}

export const hasStarterCover = (slug: string) => slug in STARTER_COVERS;
