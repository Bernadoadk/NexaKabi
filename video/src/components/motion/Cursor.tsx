import React from 'react';
import { interpolate } from 'remotion';
import { CLAMP, keyPoints, ramp, type Key } from '../../lib/anim';
import { useTime } from '../../lib/time';

/**
 * Le curseur qui clique.
 *
 * `touch` : un doigt (rond translucide), pour les écrans de téléphone.
 * `pointer` : une flèche, pour les écrans d'ordinateur.
 *
 * Les coordonnées sont celles de l'écran qui le contient (pixels CSS de la
 * maquette) : le curseur suit donc les zooms et les déplacements du cadre.
 */

/** Enfoncement 0 → 1 → 0 autour d'un clic, pour les boutons touchés. */
export function pressAt(time: number, clickAt: number): number {
  if (time < clickAt - 3 || time > clickAt + 9) return 0;
  return time < clickAt
    ? interpolate(time, [clickAt - 3, clickAt], [0, 1], CLAMP)
    : interpolate(time, [clickAt, clickAt + 9], [1, 0], CLAMP);
}

export const Cursor: React.FC<{
  path: Key<{ x: number; y: number }>[];
  clicks: number[];
  appear: number;
  disappear?: number;
  variant?: 'touch' | 'pointer';
  /** Taille relative (1 = taille d'un doigt sur un écran de 360 px). */
  scale?: number;
}> = ({ path, clicks, appear, disappear, variant = 'touch', scale = 1 }) => {
  const time = useTime();
  const { x, y } = keyPoints(time, path);
  const visible =
    ramp(time, appear, appear + 6) *
    (disappear === undefined ? 1 : 1 - ramp(time, disappear, disappear + 6));

  if (visible <= 0) return null;

  const press = clicks.reduce((max, click) => Math.max(max, pressAt(time, click)), 0);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {clicks.map((click) => {
        const progress = interpolate(time, [click, click + 18], [0, 1], CLAMP);
        if (time < click || progress >= 1) return null;
        const radius = (18 + progress * 34) * scale;
        return (
          <span
            key={click}
            style={{
              position: 'absolute',
              left: x - radius,
              top: y - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: '50%',
              border: `${3 * scale}px solid var(--color-coral)`,
              opacity: (1 - progress) * 0.85,
            }}
          />
        );
      })}

      {variant === 'touch' ? (
        <span
          style={{
            position: 'absolute',
            left: x - 21 * scale,
            top: y - 21 * scale,
            width: 42 * scale,
            height: 42 * scale,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.62)',
            border: `${2.5 * scale}px solid rgba(18, 16, 43, 0.28)`,
            boxShadow: '0 8px 22px rgba(11, 9, 24, 0.35)',
            transform: `scale(${1 - press * 0.22})`,
            opacity: visible,
          }}
        />
      ) : (
        <svg
          width={30 * scale}
          height={30 * scale}
          viewBox="0 0 24 24"
          style={{
            position: 'absolute',
            left: x - 4 * scale,
            top: y - 2 * scale,
            opacity: visible,
            transform: `scale(${1 - press * 0.15})`,
            transformOrigin: '4px 2px',
            filter: 'drop-shadow(0 4px 6px rgba(11, 9, 24, 0.35))',
          }}
        >
          <path
            d="M5 2.5 L5 19.5 L9.4 15.4 L12.3 21.6 L15.2 20.3 L12.4 14.2 L18.5 14.2 Z"
            fill="#FFFFFF"
            stroke="#12102B"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};
