import React, { useId } from 'react';
import { AbsoluteFill } from 'remotion';
import { config } from '../../config';
import { seeded } from '../../lib/anim';
import { heroEvent } from '../../lib/format';
import { useFormat } from '../../lib/layout';
import { useTime } from '../../lib/time';
import { jeunesse } from '../config';
import { FriendSilhouette } from './Friends';

/**
 * Le concert du festival, dessiné en SVG à la taille du cadre : scène et
 * écran géant, faisceaux de lumière, foule qui saute sur les temps, la
 * bande au premier plan, de dos, et une pluie de confettis.
 *
 * `beat(time)` : 0 → 1 → 0 à chaque temps de la musique (la scène démarre
 * sur un temps).
 */
const BEAT = (60 / 110) * config.fps;

/** Rebond d'un temps : 1 sur le temps, 0 à mi-chemin. */
export function beatPulse(time: number, phase = 0): number {
  const position = (((time - phase) % BEAT) + BEAT) % BEAT;
  return Math.max(0, 1 - position / (BEAT * 0.45));
}

function beamPoints(x: number, y: number, angle: number, spread: number, length: number) {
  const a1 = ((angle - spread) * Math.PI) / 180;
  const a2 = ((angle + spread) * Math.PI) / 180;
  return `${x},${y} ${x + Math.sin(a1) * length},${y + Math.cos(a1) * length} ${x + Math.sin(a2) * length},${y + Math.cos(a2) * length}`;
}

export const Concert: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const time = useTime();
  const raw = useId();
  const id = `k${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const { width: W, height: H, portrait } = useFormat();
  const pulse = beatPulse(time);

  const g = portrait
    ? { trussY: 300, screen: { cx: W / 2, cy: 560, w: 640, h: 360 }, floorY: 830, rows: [905, 1010, 1135] }
    : { trussY: 80, screen: { cx: W / 2, cy: 262, w: 680, h: 330 }, floorY: 520, rows: [565, 640, 735] };
  const s = g.screen;
  const lights = Array.from({ length: 7 }, (_, index) => ({
    x: W / 2 + (index - 3) * (portrait ? 150 : 250),
    color: ['#FF7A5C', '#FFD27A', '#FF4DB8', '#7FB2FF', '#7BE3BF', '#FFD27A', '#FF7A5C'][index],
    base: (index - 3) * -9,
  }));

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#070512' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#070512" />
            <stop offset={g.trussY / H} stopColor="#1A0A33" />
            <stop offset={(g.floorY - 160) / H} stopColor="#56164E" />
            <stop offset={g.floorY / H} stopColor="#E0463F" />
            <stop offset={(g.floorY + 60) / H} stopColor="#5A1A3A" />
            <stop offset="1" stopColor="#0B0614" />
          </linearGradient>
          <radialGradient id={`${id}-haze`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFB07A" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#FF5A6E" stopOpacity="0.28" />
            <stop offset="1" stopColor="#FF4D2E" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF4D2E" />
            <stop offset={0.45 + Math.sin(time / 18) * 0.15} stopColor="#B42A85" />
            <stop offset="1" stopColor="#2F62FF" />
          </linearGradient>
          {lights.map((light, index) => (
            <linearGradient key={index} id={`${id}-beam${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={light.color} stopOpacity="0.9" />
              <stop offset="1" stopColor={light.color} stopOpacity="0" />
            </linearGradient>
          ))}
          <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect width={W} height={H} fill={`url(#${id}-sky)`} />
        {/* Étoiles et halos lointains */}
        {Array.from({ length: 40 }, (_, index) => (
          <circle
            key={index}
            cx={seeded(index + 7) * W}
            cy={seeded(index + 70) * g.trussY * 1.6}
            r={1 + seeded(index + 140) * 1.6}
            fill="#FFFFFF"
            opacity={0.25 + 0.35 * Math.abs(Math.sin(time / 10 + index))}
          />
        ))}
        <ellipse
          cx={W / 2}
          cy={g.floorY - 40}
          rx={W * (portrait ? 0.8 : 0.55)}
          ry={portrait ? 360 : 260}
          fill={`url(#${id}-haze)`}
          opacity={0.75 + pulse * 0.25}
        />

        {/* Faisceaux */}
        <g style={{ mixBlendMode: 'screen' }}>
          {lights.map((light, index) => (
            <polygon
              key={index}
              points={beamPoints(
                light.x,
                g.trussY + 8,
                light.base + Math.sin(time / 15 + index * 1.4) * 22,
                6,
                H * 1.3,
              )}
              fill={`url(#${id}-beam${index})`}
              opacity={0.34 + pulse * 0.22}
            />
          ))}
        </g>

        {/* Écran géant, enceintes, structure */}
        <rect
          x={s.cx - s.w / 2 - 70}
          y={s.cy - s.h / 2 + 30}
          width={56}
          height={s.h + 60}
          rx={8}
          fill="#0B0714"
        />
        <rect
          x={s.cx + s.w / 2 + 14}
          y={s.cy - s.h / 2 + 30}
          width={56}
          height={s.h + 60}
          rx={8}
          fill="#0B0714"
        />
        <rect
          x={s.cx - s.w / 2 - 12}
          y={s.cy - s.h / 2 - 12}
          width={s.w + 24}
          height={s.h + 24}
          rx={22}
          fill="#0B0714"
        />
        <rect
          x={s.cx - s.w / 2}
          y={s.cy - s.h / 2}
          width={s.w}
          height={s.h}
          rx={14}
          fill={`url(#${id}-screen)`}
          opacity={0.92 + pulse * 0.08}
        />
        {/* Égaliseur sur l'écran */}
        {Array.from({ length: 18 }, (_, index) => {
          const level =
            0.25 + 0.55 * Math.abs(Math.sin(time / 4 + index * 0.9)) * (0.6 + pulse * 0.4);
          const barW = s.w / 18;
          const barH = s.h * 0.42 * level;
          return (
            <rect
              key={index}
              x={s.cx - s.w / 2 + index * barW + barW * 0.2}
              y={s.cy + s.h / 2 - 16 - barH}
              width={barW * 0.6}
              height={barH}
              rx={3}
              fill="#FFFFFF"
              opacity={0.28}
            />
          );
        })}
        <text
          x={s.cx}
          y={s.cy - s.h * 0.06}
          textAnchor="middle"
          fontFamily="Bricolage Grotesque"
          fontWeight={800}
          fontSize={s.h * 0.2}
          letterSpacing="-0.02em"
          fill="#FFFFFF"
        >
          {heroEvent().title.split(' ').slice(0, 2).join(' ').toUpperCase()}
        </text>

        <rect x={W * 0.08} y={g.trussY - 10} width={W * 0.84} height={20} rx={6} fill="#0B0714" />
        <g filter={`url(#${id}-soft)`}>
          {lights.map((light, index) => (
            <circle key={index} cx={light.x} cy={g.trussY + 6} r={10} fill="#FFF3E0" />
          ))}
        </g>

        {/* Plancher de la scène */}
        <path
          d={`M ${W * 0.12} ${g.floorY} L ${W * 0.88} ${g.floorY} L ${W * 0.96} ${g.floorY + 30} L ${W * 0.04} ${g.floorY + 30} Z`}
          fill="#0B0714"
        />
        <line
          x1={W * 0.12}
          y1={g.floorY}
          x2={W * 0.88}
          y2={g.floorY}
          stroke="#FF9E86"
          strokeWidth={3}
          opacity={0.8}
        />
        {/* L'artiste, micro levé */}
        <Performer x={W / 2} y={g.floorY} scale={portrait ? 1.1 : 1} time={time} />

        {/* Foule, trois rangées, de plus en plus proches */}
        {g.rows.map((rowY, row) => (
          <CrowdRow
            key={row}
            y={rowY}
            width={W}
            count={portrait ? 9 - row * 2 : 18 - row * 4}
            scale={(portrait ? 1.05 : 0.85) * (0.8 + row * 0.42)}
            seed={row * 31 + 5}
            time={time}
            shade={['#2A1236', '#170A22', '#0B0612'][row]}
          />
        ))}
      </svg>

      <Confetti />
      <Friends />
      {children}
      {/* Éclair blanc sur la reprise, puis un léger flash à chaque temps */}
      <AbsoluteFill
        style={{
          background: '#FFFFFF',
          opacity: Math.max(0, 1 - time / 9) * 0.9 + pulse * 0.05,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

const Performer: React.FC<{ x: number; y: number; scale: number; time: number }> = ({
  x,
  y,
  scale,
  time,
}) => {
  const sway = Math.sin(time / 8) * 4;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#0B0714">
      <rect x={-30} y={-150} width={60} height={150} rx={26} />
      <circle cx={0} cy={-176} r={24} />
      <g transform={`rotate(${-28 + sway} -24 -134)`}>
        <rect x={-34} y={-236} width={18} height={104} rx={9} />
      </g>
      <g transform={`rotate(${30 - sway} 24 -134)`}>
        <rect x={18} y={-226} width={16} height={96} rx={8} />
        <rect x={18} y={-248} width={12} height={26} rx={5} fill="#3A3360" />
      </g>
    </g>
  );
};

/** Une rangée de spectateurs : têtes, épaules, bras levés, écrans de téléphone. */
const CrowdRow: React.FC<{
  y: number;
  width: number;
  count: number;
  scale: number;
  seed: number;
  time: number;
  shade: string;
}> = ({ y, width, count, scale, seed, time, shade }) => (
  <g fill={shade}>
    {Array.from({ length: count }, (_, index) => {
      const x = (index + 0.5 + (seeded(seed + index) - 0.5) * 0.5) * (width / count);
      const s = scale * (0.9 + seeded(seed + index * 3) * 0.3);
      const jump = beatPulse(time, seeded(seed + index * 5) > 0.5 ? 0 : BEAT / 2) * 12 * s;
      const armUp = seeded(seed + index * 7) > 0.45;
      const phone = seeded(seed + index * 11) > 0.78;
      const top = y - jump + seeded(seed + index * 13) * 14;
      return (
        <g key={index}>
          {armUp ? (
            <g transform={`rotate(${(seeded(seed + index * 17) - 0.5) * 40 + Math.sin(time / 6 + index) * 8} ${x} ${top + 34 * s})`}>
              <rect x={x - 6 * s} y={top - 52 * s} width={12 * s} height={86 * s} rx={6 * s} />
              {phone ? (
                <rect
                  x={x - 9 * s}
                  y={top - 74 * s}
                  width={18 * s}
                  height={28 * s}
                  rx={3 * s}
                  fill="#DCE8FF"
                  opacity={0.9}
                />
              ) : null}
            </g>
          ) : null}
          <circle cx={x} cy={top} r={21 * s} />
          <rect x={x - 38 * s} y={top + 18 * s} width={76 * s} height={220 * s} rx={30 * s} />
        </g>
      );
    })}
  </g>
);

/** Pluie de confettis : une salve depuis les côtés de la scène, puis la retombée. */
const Confetti: React.FC = () => {
  const time = useTime();
  const { width: W, height: H, portrait } = useFormat();
  const colors = ['#FF4D2E', '#FFD27A', '#7BE3BF', '#FFFFFF', '#CFDDFA', '#FF9E86'];
  const unit = portrait ? 1.15 : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 90 }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const t = time - seeded(index + 300) * 6;
        if (t < 0) return null;
        // Salve : départ des canons, de chaque côté, vers le haut et le centre.
        const x0 = W / 2 + side * W * (0.3 + seeded(index + 400) * 0.18);
        const y0 = H * (portrait ? 0.42 : 0.5);
        const vx = -side * (6 + seeded(index + 500) * 12) * unit;
        const vy = -(22 + seeded(index + 600) * 18) * unit;
        const drag = Math.min(t, 18);
        const x = x0 + vx * drag + Math.sin(t / 7 + index) * 18 * unit;
        const y = y0 + vy * drag + 0.9 * drag * drag * unit + Math.max(0, t - 18) * (3.4 + seeded(index + 700) * 2) * unit;
        if (y > H + 40) return null;
        const w = (14 + seeded(index + 800) * 10) * unit;
        return (
          <span
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: w * 0.55,
              borderRadius: 2,
              background: colors[index % colors.length],
              transform: `rotate(${t * (8 + seeded(index + 900) * 10) * side}deg) scaleY(${0.4 + 0.6 * Math.abs(Math.sin(t / 5 + index))})`,
              opacity: 0.95,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** La bande au premier plan, de dos, qui saute sur les temps. */
const Friends: React.FC = () => {
  const time = useTime();
  const { width: W, height: H, portrait } = useFormat();
  const size = portrait ? 330 : 300;
  const spots = portrait
    ? [
        { id: 'koffi', x: 0.17, arm: 18 },
        { id: 'aicha', x: 0.42, arm: -14, phone: true },
        { id: 'sena', x: 0.66, arm: 16 },
        { id: 'yann', x: 0.88 },
      ]
    : [
        { id: 'koffi', x: 0.3, arm: 18 },
        { id: 'aicha', x: 0.44, arm: -14, phone: true },
        { id: 'sena', x: 0.58, arm: 16 },
        { id: 'yann', x: 0.71 },
      ];
  // Haut du cadre des silhouettes : têtes vers 84 % de la hauteur en 16:9, vers 83 % en
  // 9:16 (au-dessus de la légende des Reels et de TikTok).
  const top = portrait ? H - size * 1.6 : H - size * 1.18;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {spots.map((spot, index) => {
        const friend = jeunesse.friends[spot.id as keyof typeof jeunesse.friends];
        const bounce = beatPulse(time, index % 2 === 0 ? 0 : BEAT / 2) * 16;
        return (
          <div
            key={spot.id}
            style={{
              position: 'absolute',
              left: W * spot.x - size / 2,
              top: top + (index % 2) * 18,
            }}
          >
            <FriendSilhouette
              friend={friend}
              size={size}
              arm={spot.arm}
              phone={spot.phone}
              bounce={bounce}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
