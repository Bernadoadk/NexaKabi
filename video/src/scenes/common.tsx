import React from 'react';
import { AbsoluteFill } from 'remotion';
import { config } from '../config';
import { PHONE, PHONE_OUTER, PhoneFrame } from '../components/motion/Frames';
import { EASE_IN_OUT, ramp } from '../lib/anim';
import { useFormat } from '../lib/layout';
import { SceneTime, useTime } from '../lib/time';

/** Enveloppe commune : temps de la scène (étirable) et fond plein cadre. */
export const Scene: React.FC<{
  design: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ design, durationInFrames, children }) => (
  <SceneTime designSeconds={design} durationInFrames={durationInFrames}>
    <AbsoluteFill style={{ overflow: 'hidden' }}>{children}</AbsoluteFill>
  </SceneTime>
);

/**
 * Mise en page des deux formats.
 *   16:9 → texte à gauche, appareil à droite ;
 *   9:16 → texte en haut, appareil dessous (hors des zones masquées par
 *          l'interface des Reels et de TikTok pour les textes).
 */
export function useStage() {
  const { portrait, width, height } = useFormat();
  return portrait
    ? {
        portrait,
        width,
        height,
        titleSize: config.typography.titlePortrait,
        phone: { x: 540, y: 1262, scale: 1.6 },
      }
    : {
        portrait,
        width,
        height,
        titleSize: config.typography.titleLandscape,
        phone: { x: 1372, y: 540, scale: 1.2 },
      };
}

/**
 * Colonne de texte : à gauche en 16:9, en haut et centrée en 9:16.
 * En 9:16, un voile encre protège le texte quand un zoom fait remonter le
 * téléphone sous lui : la colonne se pose donc APRÈS l'appareil.
 */
export const TextColumn: React.FC<{
  children: React.ReactNode;
  width?: number;
  top?: number;
  /** Voile sous le texte en 9:16 (désactivé sur fond clair). */
  scrim?: boolean;
}> = ({ children, width = 720, top = 232, scrim = true }) => {
  const { portrait } = useFormat();
  return portrait ? (
    <>
      {scrim ? (
        <div
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 640,
            background:
              'linear-gradient(to bottom, rgba(11, 9, 24, 0.94) 0%, rgba(11, 9, 24, 0.8) 70%, rgba(11, 9, 24, 0) 100%)',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          top,
          left: 70,
          right: 70,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 26,
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </>
  ) : (
    <div
      style={{
        position: 'absolute',
        left: 150,
        top: 0,
        bottom: 0,
        width,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 30,
      }}
    >
      {children}
    </div>
  );
};

/** Plusieurs textes qui se relaient au même endroit. */
export const BeatStack: React.FC<{ children: React.ReactNode; align?: 'left' | 'center' }> = ({
  children,
  align,
}) => (
  <div style={{ display: 'grid', justifyItems: align === 'center' ? 'center' : 'start' }}>
    {React.Children.map(children, (child) => (
      <div style={{ gridArea: '1 / 1' }}>{child}</div>
    ))}
  </div>
);

/**
 * Un téléphone posé dans la scène, avec sa « caméra ».
 * `(fx, fy)` : le point du téléphone (pixels de l'écran) placé sur l'ancre ;
 * par défaut le centre. Faire varier `scale` et `(fx, fy)` zoome sur un
 * élément d'interface.
 */
export const PhoneRig: React.FC<{
  scale: number;
  fx?: number;
  fy?: number;
  x: number;
  y: number;
  offsetX?: number;
  offsetY?: number;
  rotate?: number;
  statusBar?: 'dark' | 'light';
  screenBackground?: string;
  opacity?: number;
  children: React.ReactNode;
}> = ({
  scale,
  fx = PHONE.width / 2,
  fy = PHONE.height / 2,
  x,
  y,
  offsetX = 0,
  offsetY = 0,
  rotate = 0,
  statusBar,
  screenBackground,
  opacity = 1,
  children,
}) => {
  const ox = fx + PHONE.bezel;
  const oy = fy + PHONE.bezel;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: PHONE_OUTER.width,
        height: PHONE_OUTER.height,
        transformOrigin: `${ox}px ${oy}px`,
        transform: `translate(${x - ox + offsetX}px, ${y - oy + offsetY}px) scale(${scale}) rotate(${rotate}deg)`,
        opacity,
      }}
    >
      <PhoneFrame statusBar={statusBar} screenBackground={screenBackground}>
        {children}
      </PhoneFrame>
    </div>
  );
};

/** Même principe pour n'importe quel cadre (fenêtre de navigateur). */
export const Rig: React.FC<{
  width: number;
  height: number;
  scale: number;
  fx?: number;
  fy?: number;
  x: number;
  y: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  children: React.ReactNode;
}> = ({
  width,
  height,
  scale,
  fx = width / 2,
  fy = height / 2,
  x,
  y,
  offsetX = 0,
  offsetY = 0,
  opacity = 1,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width,
      height,
      transformOrigin: `${fx}px ${fy}px`,
      transform: `translate(${x - fx + offsetX}px, ${y - fy + offsetY}px) scale(${scale})`,
      opacity,
    }}
  >
    {children}
  </div>
);

/**
 * Navigation « poussée » entre deux écrans, comme dans l'application :
 * le nouvel écran arrive de la droite, l'ancien recule légèrement.
 */
export const ScreenSwap: React.FC<{
  at: number;
  duration?: number;
  from: React.ReactNode;
  to: React.ReactNode;
  /** `up` : le nouvel écran monte depuis le bas (page de confirmation). */
  direction?: 'left' | 'up';
}> = ({ at, duration = 11, from, to, direction = 'left' }) => {
  const time = useTime();
  const progress = ramp(time, at, at + duration, [0, 1], EASE_IN_OUT);
  if (progress <= 0) return <>{from}</>;
  if (progress >= 1) return <>{to}</>;
  const leaving =
    direction === 'left'
      ? `translateX(${-28 * progress}%)`
      : `translateY(${-8 * progress}%) scale(${1 - 0.04 * progress})`;
  const entering =
    direction === 'left'
      ? `translateX(${100 * (1 - progress)}%)`
      : `translateY(${100 * (1 - progress)}%)`;
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ transform: leaving, filter: `brightness(${1 - 0.25 * progress})` }}
      >
        {from}
      </div>
      <div
        className="absolute inset-0"
        style={{ transform: entering, boxShadow: '-20px 0 40px rgba(11, 9, 24, 0.25)' }}
      >
        {to}
      </div>
    </>
  );
};

/** Point clé animé (pastille d'icône + libellé), sous un titre. */
export const Point: React.FC<{
  icon: React.ReactNode;
  text: string;
  start: number;
  /** Image où le point s'efface. Absent : il reste. */
  exit?: number;
  dark?: boolean;
  size?: number;
}> = ({ icon, text, start, exit, dark = false, size = 30 }) => {
  const time = useTime();
  const enter = ramp(time, start, start + 14);
  const leave = exit === undefined ? 0 : ramp(time, exit, exit + 10);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.55,
        opacity: enter * (1 - leave),
        transform: `translateX(${(1 - enter) * -30}px) translateY(${leave * -20}px)`,
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: size,
        color: dark ? 'var(--color-text)' : '#FFFFFF',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: size * 1.8,
          height: size * 1.8,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: dark ? 'var(--color-coral-50)' : 'rgba(255, 255, 255, 0.1)',
          color: dark ? 'var(--color-coral)' : 'var(--color-coral-300)',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      {text}
    </div>
  );
};
