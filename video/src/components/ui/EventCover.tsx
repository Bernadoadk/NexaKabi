import React, { useId } from 'react';
import { Img, staticFile } from 'remotion';
import type { CoverStyle, DemoEvent } from '../../config.types';
import { seeded } from '../../lib/anim';
import { cn } from '../../lib/layout';
import { useTime } from '../../lib/time';

/**
 * Visuel d'affiche d'un événement.
 *
 * Illustrations dessinées en SVG — pas de photo à licence. Chacune vit dans
 * un cadre 400 × 300 recadré « au centre », donc lisible en carte 16:9, en
 * vignette carrée comme en bandeau de page événement. Une vraie image posée
 * dans `public/` et déclarée dans `event.image` (config) prend le dessus.
 */
export const EventCover: React.FC<{ event: DemoEvent; className?: string }> = ({
  event,
  className,
}) => {
  const rawId = useId();
  const id = `c${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const time = useTime();

  if (event.image) {
    return (
      <Img
        src={staticFile(event.image)}
        className={cn('absolute inset-0 size-full object-cover', className)}
      />
    );
  }

  const Art = ARTS[event.cover];

  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={cn('absolute inset-0 size-full', className)}
    >
      <Art id={id} t={time} />
    </svg>
  );
};

type ArtProps = { id: string; t: number };

// ─────────────────────────────────────────────────────────────────────────────
// Outils de dessin
// ─────────────────────────────────────────────────────────────────────────────

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Un faisceau de lumière qui part de (x, y) dans la direction `angle` (0 = vers le bas). */
function beam(x: number, y: number, angle: number, spread: number, length: number): string {
  const a1 = rad(angle - spread);
  const a2 = rad(angle + spread);
  const p1 = [x + Math.sin(a1) * length, y + Math.cos(a1) * length];
  const p2 = [x + Math.sin(a2) * length, y + Math.cos(a2) * length];
  return `${x},${y} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`;
}

/** Silhouette de spectateur : tête, épaules, et parfois un bras levé. */
const Person: React.FC<{ x: number; y: number; s: number; fill: string; arm?: number }> = ({
  x,
  y,
  s,
  fill,
  arm,
}) => (
  <g fill={fill}>
    <circle cx={x} cy={y} r={9 * s} />
    <rect x={x - 14 * s} y={y + 9 * s} width={28 * s} height={80 * s} rx={12 * s} />
    {arm !== undefined ? (
      <rect
        x={x - 3 * s}
        y={y - 38 * s}
        width={6 * s}
        height={46 * s}
        rx={3 * s}
        transform={`rotate(${arm} ${x} ${y + 12 * s})`}
      />
    ) : null}
  </g>
);

/** Rangée de spectateurs, déterministe. */
const Crowd: React.FC<{
  y: number;
  fill: string;
  seed: number;
  scale?: number;
  count?: number;
  t: number;
}> = ({ y, fill, seed, scale = 1, count = 24, t }) => (
  <>
    {Array.from({ length: count }, (_, index) => {
      const x = -12 + (index / (count - 1)) * 424 + (seeded(seed + index) - 0.5) * 10;
      const s = scale * (0.85 + seeded(seed + index * 3) * 0.35);
      const lift = Math.sin(t / 9 + index) * 3;
      const hasArm = seeded(seed + index * 7) > 0.62;
      const arm = hasArm
        ? (seeded(seed + index * 5) - 0.5) * 50 + Math.sin(t / 7 + index) * 8
        : undefined;
      return (
        <Person
          key={index}
          x={x}
          y={y + seeded(seed + index * 11) * 12 + lift}
          s={s}
          fill={fill}
          arm={arm}
        />
      );
    })}
  </>
);

/** Points lumineux flous. */
const Bokeh: React.FC<{
  id: string;
  seed: number;
  colors: string[];
  count?: number;
  t: number;
  maxY?: number;
}> = ({ id, seed, colors, count = 12, t, maxY = 220 }) => (
  <g filter={`url(#${id}-soft)`}>
    {Array.from({ length: count }, (_, index) => {
      const x = seeded(seed + index) * 400;
      const y = seeded(seed + index * 2) * maxY + Math.sin(t / 25 + index) * 4;
      const r = 3 + seeded(seed + index * 3) * 9;
      const opacity = 0.18 + seeded(seed + index * 4) * 0.3;
      return (
        <circle
          key={index}
          cx={x}
          cy={y}
          r={r}
          fill={colors[index % colors.length]}
          opacity={opacity}
        />
      );
    })}
  </g>
);

const SoftFilter: React.FC<{ id: string; blur?: number }> = ({ id, blur = 2.2 }) => (
  <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation={blur} />
  </filter>
);

const GlowFilter: React.FC<{ id: string; blur?: number }> = ({ id, blur = 3 }) => (
  <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur stdDeviation={blur} result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

// ─────────────────────────────────────────────────────────────────────────────
// Scène de concert — festival
// ─────────────────────────────────────────────────────────────────────────────

const Stage: React.FC<ArtProps> = ({ id, t }) => {
  const beams = [
    { x: 40, color: '#FF7A5C', base: 28 },
    { x: 120, color: '#FFD27A', base: 12 },
    { x: 200, color: '#FF4DB8', base: 0 },
    { x: 280, color: '#7FB2FF', base: -12 },
    { x: 360, color: '#7BE3BF', base: -28 },
  ];
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#120A2C" />
          <stop offset="0.5" stopColor="#3F1258" />
          <stop offset="0.78" stopColor="#B42A55" />
          <stop offset="1" stopColor="#FF7A45" />
        </linearGradient>
        <radialGradient id={`${id}-horizon`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFC48A" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#FF5A36" stopOpacity="0.45" />
          <stop offset="1" stopColor="#FF4D2E" stopOpacity="0" />
        </radialGradient>
        {beams.map((entry, index) => (
          <linearGradient key={index} id={`${id}-beam${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={entry.color} stopOpacity="0.85" />
            <stop offset="1" stopColor={entry.color} stopOpacity="0" />
          </linearGradient>
        ))}
        <SoftFilter id={id} />
        <GlowFilter id={id} />
      </defs>

      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <ellipse cx="200" cy="222" rx="250" ry="78" fill={`url(#${id}-horizon)`} />

      <g style={{ mixBlendMode: 'screen' }}>
        {beams.map((entry, index) => (
          <polygon
            key={index}
            points={beam(entry.x, 18, entry.base + Math.sin(t / 16 + index * 1.7) * 9, 5.5, 360)}
            fill={`url(#${id}-beam${index})`}
            opacity={0.55}
          />
        ))}
      </g>

      <rect x="10" y="10" width="380" height="7" rx="3" fill="#0B0918" opacity="0.85" />
      <g filter={`url(#${id}-glow)`}>
        {beams.map((entry, index) => (
          <circle key={index} cx={entry.x} cy="18" r="4.5" fill="#FFF3E0" />
        ))}
      </g>

      <Bokeh id={id} seed={3} colors={['#FFFFFF', '#FFD27A', '#FF9E86']} t={t} maxY={200} />

      <Crowd y={226} fill="#1A0E24" seed={40} scale={0.85} count={22} t={t} />
      <Crowd y={246} fill="#0B0918" seed={7} count={18} t={t + 20} />
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Plage de nuit et feux d'artifice — réveillon
// ─────────────────────────────────────────────────────────────────────────────

const Firework: React.FC<{
  x: number;
  y: number;
  r: number;
  color: string;
  phase: number;
  t: number;
}> = ({ x, y, r, color, phase, t }) => {
  const expand = 0.82 + 0.18 * Math.sin(t / 11 + phase);
  return (
    <g stroke={color} strokeLinecap="round" opacity={0.9}>
      {Array.from({ length: 18 }, (_, index) => {
        const angle = (index / 18) * Math.PI * 2;
        const inner = r * 0.25 * expand;
        const outer = r * expand * (0.75 + seeded(index + phase * 10) * 0.25);
        return (
          <line
            key={index}
            x1={x + Math.cos(angle) * inner}
            y1={y + Math.sin(angle) * inner}
            x2={x + Math.cos(angle) * outer}
            y2={y + Math.sin(angle) * outer}
            strokeWidth={2.2}
          />
        );
      })}
      <circle cx={x} cy={y} r={3} fill="#FFFFFF" stroke="none" />
    </g>
  );
};

const Palm: React.FC<{ x: number; s: number; flip?: boolean }> = ({ x, s, flip }) => (
  <g transform={`translate(${x} 300) scale(${flip ? -s : s} ${s})`} fill="#070512">
    <path d="M-4 0 C 2 -60, 14 -110, 30 -150 L 36 -148 C 22 -108, 12 -60, 6 0 Z" />
    {[-150, -118, -85, -40, -8, 25].map((angle, index) => (
      <path
        key={index}
        d="M0 0 C 20 -10, 45 -8, 62 6 C 44 0, 22 2, 0 6 Z"
        transform={`translate(33 -150) rotate(${angle})`}
      />
    ))}
  </g>
);

const Beach: React.FC<ArtProps> = ({ id, t }) => (
  <>
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0A0820" />
        <stop offset="0.55" stopColor="#241042" />
        <stop offset="0.7" stopColor="#5C1F52" />
        <stop offset="0.72" stopColor="#1A1240" />
        <stop offset="1" stopColor="#0B0918" />
      </linearGradient>
      <SoftFilter id={id} blur={3} />
      <GlowFilter id={id} blur={3.5} />
    </defs>
    <rect width="400" height="300" fill={`url(#${id}-sky)`} />
    {Array.from({ length: 26 }, (_, index) => (
      <circle
        key={index}
        cx={seeded(index + 90) * 400}
        cy={seeded(index + 190) * 150}
        r={0.8 + seeded(index + 290) * 0.9}
        fill="#FFFFFF"
        opacity={0.35 + 0.35 * Math.sin(t / 8 + index)}
      />
    ))}
    <g filter={`url(#${id}-glow)`}>
      <Firework x={110} y={78} r={48} color="#FF9E86" phase={0} t={t} />
      <Firework x={285} y={58} r={56} color="#FFD27A" phase={2} t={t} />
      <Firework x={215} y={128} r={34} color="#7BE3BF" phase={4} t={t} />
    </g>
    <g filter={`url(#${id}-soft)`} opacity={0.5}>
      <rect x="100" y="222" width="20" height="60" fill="#FF9E86" opacity="0.35" />
      <rect x="275" y="222" width="22" height="70" fill="#FFD27A" opacity="0.35" />
      <rect x="208" y="222" width="14" height="45" fill="#7BE3BF" opacity="0.3" />
    </g>
    {[232, 248, 266].map((y, index) => (
      <path
        key={y}
        d={`M -10 ${y} Q 60 ${y - 5 + Math.sin(t / 10 + index) * 2} 130 ${y} T 270 ${y} T 410 ${y}`}
        stroke="#FFFFFF"
        strokeOpacity={0.12}
        strokeWidth={1.4}
        fill="none"
      />
    ))}
    <rect x="0" y="276" width="400" height="24" fill="#08060F" />
    <Crowd y={262} fill="#08060F" seed={120} count={9} scale={0.55} t={t} />
    <Palm x={18} s={1.05} />
    <Palm x={392} s={0.85} flip />
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Chorale et lumière dorée — gospel
// ─────────────────────────────────────────────────────────────────────────────

const Choir: React.FC<{ y: number; fill: string; count: number; seed: number; t: number }> = ({
  y,
  fill,
  count,
  seed,
  t,
}) => (
  <g fill={fill}>
    {Array.from({ length: count }, (_, index) => {
      const x = 12 + (index / (count - 1)) * 376;
      const sway = Math.sin(t / 12 + index * 0.6) * 2;
      return (
        <g key={index} transform={`translate(${x + sway} ${y + seeded(seed + index) * 6})`}>
          <circle cx="0" cy="0" r="10" />
          <path d="M -17 12 Q 0 4 17 12 L 22 90 L -22 90 Z" />
        </g>
      );
    })}
  </g>
);

const Gospel: React.FC<ArtProps> = ({ id, t }) => (
  <>
    <defs>
      <radialGradient id={`${id}-sky`} cx="0.5" cy="0.05" r="1.05">
        <stop offset="0" stopColor="#FFE2A0" />
        <stop offset="0.22" stopColor="#F0A92E" />
        <stop offset="0.55" stopColor="#B23A22" />
        <stop offset="1" stopColor="#35163F" />
      </radialGradient>
      <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <SoftFilter id={id} blur={2.6} />
    </defs>
    <rect width="400" height="300" fill={`url(#${id}-sky)`} />
    <g style={{ mixBlendMode: 'screen' }} opacity={0.5}>
      {[-40, -24, -9, 6, 21, 36].map((angle, index) => (
        <polygon
          key={index}
          points={beam(200, -30, angle + Math.sin(t / 30 + index) * 2, 4, 360)}
          fill={`url(#${id}-ray)`}
        />
      ))}
    </g>
    <Bokeh
      id={id}
      seed={55}
      colors={['#FFF1C9', '#FFD27A', '#FFFFFF']}
      count={16}
      t={t}
      maxY={190}
    />
    <Choir y={196} fill="#5A1F3A" count={11} seed={5} t={t} />
    <Choir y={232} fill="#2A1130" count={9} seed={9} t={t + 15} />
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Guirlandes et étals en wax — marché de Noël des créateurs
// ─────────────────────────────────────────────────────────────────────────────

/** Point d'une courbe de Bézier quadratique. */
function quad(p0: number[], p1: number[], p2: number[], s: number) {
  const x = (1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * p1[0] + s ** 2 * p2[0];
  const y = (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * p1[1] + s ** 2 * p2[1];
  return [x, y];
}

const Garland: React.FC<{ y: number; sag: number; phase: number; t: number }> = ({
  y,
  sag,
  phase,
  t,
}) => {
  const p0 = [-10, y];
  const p1 = [200, y + sag];
  const p2 = [410, y];
  const colors = ['#FFD27A', '#FF7A5C', '#7BE3BF', '#FFFFFF', '#FF9E86'];
  return (
    <>
      <path
        d={`M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`}
        stroke="#1A0A1C"
        strokeWidth={1.4}
        fill="none"
        opacity={0.8}
      />
      {Array.from({ length: 17 }, (_, index) => {
        const [x, by] = quad(p0, p1, p2, (index + 0.5) / 17);
        const flicker = 0.65 + 0.35 * Math.sin(t / 6 + index * 1.3 + phase);
        return (
          <circle
            key={index}
            cx={x}
            cy={by + 5}
            r={3.6}
            fill={colors[(index + phase) % colors.length]}
            opacity={flicker}
          />
        );
      })}
    </>
  );
};

const Stall: React.FC<{ x: number; w: number; id: string; wax: [string, string, string] }> = ({
  x,
  w,
  id,
  wax,
}) => (
  <g>
    <rect x={x} y={176} width={w} height={22} fill={`url(#${id}-awning)`} />
    {Array.from({ length: Math.floor(w / 16) }, (_, index) => (
      <circle
        key={index}
        cx={x + 8 + index * 16}
        cy={198}
        r={8}
        fill={index % 2 === 0 ? '#FF4D2E' : '#FFEDE8'}
      />
    ))}
    <rect x={x + 4} y={206} width={w - 8} height={70} fill="#1E0C1E" />
    <rect x={x + 10} y={228} width={w - 20} height={30} fill={wax[0]} />
    {Array.from({ length: Math.floor((w - 20) / 18) }, (_, index) => (
      <g key={index}>
        <circle cx={x + 19 + index * 18} cy={243} r={6.5} fill={wax[1]} />
        <circle cx={x + 19 + index * 18} cy={243} r={3} fill={wax[2]} />
      </g>
    ))}
  </g>
);

const Market: React.FC<ArtProps> = ({ id, t }) => (
  <>
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#35122F" />
        <stop offset="0.55" stopColor="#9B2F3F" />
        <stop offset="1" stopColor="#FF8A5C" />
      </linearGradient>
      <pattern id={`${id}-awning`} width="24" height="22" patternUnits="userSpaceOnUse">
        <rect width="12" height="22" fill="#FF4D2E" />
        <rect x="12" width="12" height="22" fill="#FFEDE8" />
      </pattern>
      <SoftFilter id={id} blur={2.4} />
      <GlowFilter id={id} blur={2.5} />
    </defs>
    <rect width="400" height="300" fill={`url(#${id}-sky)`} />
    <Bokeh id={id} seed={77} colors={['#FFD27A', '#FFFFFF']} count={9} t={t} maxY={150} />
    <g filter={`url(#${id}-glow)`}>
      <Garland y={26} sag={46} phase={0} t={t} />
      <Garland y={70} sag={40} phase={2} t={t} />
      <Garland y={112} sag={34} phase={4} t={t} />
    </g>
    <Stall x={-6} w={130} id={id} wax={['#F0A92E', '#1E1A48', '#FF4D2E']} />
    <Stall x={136} w={128} id={id} wax={['#12B981', '#FFD27A', '#1E1A48']} />
    <Stall x={276} w={132} id={id} wax={['#2A5BC0', '#F0A92E', '#FFFFFF']} />
    <Crowd y={250} fill="#14081A" seed={300} count={8} scale={0.62} t={t} />
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Terrain sous les projecteurs — maracana
// ─────────────────────────────────────────────────────────────────────────────

const Football: React.FC<ArtProps> = ({ id, t }) => {
  const spin = t * 3;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06170F" />
          <stop offset="0.45" stopColor="#0F3B2E" />
          <stop offset="1" stopColor="#0B7A57" />
        </linearGradient>
        <radialGradient id={`${id}-flood`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#E9FFF5" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-pitch`}>
          <polygon points="70,130 330,130 440,300 -40,300" />
        </clipPath>
        <SoftFilter id={id} />
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <circle cx="40" cy="30" r="90" fill={`url(#${id}-flood)`} />
      <circle cx="360" cy="30" r="90" fill={`url(#${id}-flood)`} />
      <rect x="37" y="26" width="6" height="110" fill="#04110B" />
      <rect x="357" y="26" width="6" height="110" fill="#04110B" />
      <g clipPath={`url(#${id}-pitch)`}>
        <rect x="-40" y="130" width="480" height="170" fill="#12B981" />
        {Array.from({ length: 7 }, (_, index) => (
          <rect key={index} x="-40" y={130 + index * 26} width="480" height="13" fill="#0FA372" />
        ))}
      </g>
      <g stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={2} fill="none">
        <polygon points="80,136 320,136 420,296 -20,296" />
        <line x1="31" y1="200" x2="369" y2="200" />
        <ellipse cx="200" cy="200" rx="62" ry="17" />
      </g>
      <rect
        x="182"
        y="120"
        width="36"
        height="16"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeOpacity="0.85"
      />
      <g transform={`translate(262 250)`}>
        <ellipse cx="4" cy="24" rx="22" ry="5" fill="#04110B" opacity="0.45" />
        <circle r="21" fill="#FFFFFF" />
        <g transform={`rotate(${spin})`} fill="#12102B">
          <polygon points="0,-8 7.6,-2.5 4.7,6.5 -4.7,6.5 -7.6,-2.5" />
          {[0, 72, 144, 216, 288].map((angle) => (
            <polygon
              key={angle}
              transform={`rotate(${angle}) translate(0 -17)`}
              points="0,-4 4,-1 2.5,3.5 -2.5,3.5 -4,-1"
            />
          ))}
        </g>
      </g>
      <g stroke="#FFFFFF" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round">
        <line x1="212" y1="244" x2="232" y2="244" />
        <line x1="206" y1="254" x2="232" y2="254" />
        <line x1="214" y1="264" x2="234" y2="262" />
      </g>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Rideau et projecteur — stand-up
// ─────────────────────────────────────────────────────────────────────────────

const Comedy: React.FC<ArtProps> = ({ id, t }) => {
  const sway = Math.sin(t / 20) * 3;
  return (
    <>
      <defs>
        <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2E0E1A" />
          <stop offset="0.5" stopColor="#8A2A3C" />
          <stop offset="1" stopColor="#2E0E1A" />
        </linearGradient>
        <pattern id={`${id}-curtain`} width="38" height="300" patternUnits="userSpaceOnUse">
          <rect width="38" height="300" fill={`url(#${id}-fold)`} />
        </pattern>
        <linearGradient id={`${id}-spot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4E0" stopOpacity="0.8" />
          <stop offset="1" stopColor="#FFF4E0" stopOpacity="0.1" />
        </linearGradient>
        <radialGradient id={`${id}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFF4E0" stopOpacity="0.7" />
          <stop offset="1" stopColor="#FFF4E0" stopOpacity="0" />
        </radialGradient>
        <SoftFilter id={id} blur={3} />
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-curtain)`} />
      <rect width="400" height="300" fill="#12102B" opacity="0.35" />
      <rect x="0" y="262" width="400" height="38" fill="#1A0810" />
      <polygon
        points={`${200 + sway},-10 ${118 + sway},270 ${282 + sway},270`}
        fill={`url(#${id}-spot)`}
        style={{ mixBlendMode: 'screen' }}
        opacity={0.55}
      />
      <ellipse cx={200 + sway} cy="266" rx="110" ry="20" fill={`url(#${id}-floor)`} />
      <g fill="#0B0918" stroke="#0B0918">
        <line x1="200" y1="266" x2="200" y2="160" strokeWidth="4" />
        <line x1="200" y1="160" x2="214" y2="146" strokeWidth="3.5" />
        <ellipse cx="217" cy="141" rx="6" ry="9" transform="rotate(40 217 141)" />
        <ellipse cx="200" cy="267" rx="18" ry="4" />
      </g>
      <g fill="#0B0918">
        <rect x="236" y="214" width="34" height="5" rx="2" />
        <rect x="240" y="219" width="4" height="47" />
        <rect x="262" y="219" width="4" height="47" />
      </g>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Réseau et écran — rencontre tech
// ─────────────────────────────────────────────────────────────────────────────

const Tech: React.FC<ArtProps> = ({ id, t }) => {
  const nodes = Array.from({ length: 12 }, (_, index) => ({
    x: 30 + seeded(index + 500) * 340,
    y: 40 + seeded(index + 600) * 130 + Math.sin(t / 18 + index) * 3,
  }));
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#051C2C" />
          <stop offset="0.6" stopColor="#0B3C5D" />
          <stop offset="1" stopColor="#123B54" />
        </linearGradient>
        <GlowFilter id={id} blur={2.5} />
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <g stroke="#7BE3BF" strokeOpacity={0.14} strokeWidth={1}>
        {Array.from({ length: 9 }, (_, index) => (
          <line
            key={`h${index}`}
            x1="0"
            y1={190 + index * index * 1.6}
            x2="400"
            y2={190 + index * index * 1.6}
          />
        ))}
        {Array.from({ length: 13 }, (_, index) => (
          <line key={`v${index}`} x1={200} y1={170} x2={-240 + index * 73} y2={300} />
        ))}
      </g>
      <g stroke="#7FB2FF" strokeOpacity={0.35} strokeWidth={1}>
        {nodes.map((node, index) => {
          const next = nodes[(index + 3) % nodes.length];
          return <line key={index} x1={node.x} y1={node.y} x2={next.x} y2={next.y} />;
        })}
      </g>
      <g filter={`url(#${id}-glow)`}>
        {nodes.map((node, index) => (
          <circle
            key={index}
            cx={node.x}
            cy={node.y}
            r={index % 3 === 0 ? 4 : 2.6}
            fill={index % 2 ? '#7BE3BF' : '#FFFFFF'}
          />
        ))}
      </g>
      <rect
        x="120"
        y="70"
        width="160"
        height="92"
        rx="8"
        fill="#051C2C"
        stroke="#7FB2FF"
        strokeOpacity="0.5"
      />
      {[0, 1, 2, 3, 4].map((index) => (
        <rect
          key={index}
          x={134 + (index % 2) * 14}
          y={86 + index * 14}
          width={60 + seeded(index + 40) * 70}
          height="6"
          rx="3"
          fill={index === 1 ? '#FF7A5C' : '#7BE3BF'}
          opacity={0.75}
        />
      ))}
      <Crowd y={240} fill="#03111C" seed={610} count={12} scale={0.8} t={t} />
    </>
  );
};

const ARTS: Record<CoverStyle, React.FC<ArtProps>> = {
  stage: Stage,
  beach: Beach,
  gospel: Gospel,
  market: Market,
  football: Football,
  comedy: Comedy,
  tech: Tech,
};
