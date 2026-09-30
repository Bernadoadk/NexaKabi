import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useTime } from '../../lib/time';

/**
 * Fonds de scène.
 *
 * Encre : « la nuit d'un concert » — dégradé profond, deux halos qui
 * dérivent lentement (corail et bleu, les deux pôles du logo), une trame de
 * points à peine visible.
 */
export const InkBackground: React.FC<{ glow?: number; children?: React.ReactNode }> = ({
  glow = 1,
  children,
}) => {
  const time = useTime();
  const drift = (speed: number, amplitude: number, phase = 0) =>
    Math.sin(time / speed + phase) * amplitude;

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(130% 95% at 72% 12%, var(--color-ink-700) 0%, var(--color-ink) 46%, var(--color-ink-900) 100%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '62%',
          aspectRatio: '1',
          left: `${58 + drift(70, 6)}%`,
          top: `${-18 + drift(90, 5, 1)}%`,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255, 77, 46, 0.34) 0%, rgba(255, 77, 46, 0) 68%)',
          opacity: 0.9 * glow,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '70%',
          aspectRatio: '1',
          left: `${-22 + drift(80, 6, 2)}%`,
          top: `${48 + drift(60, 5, 3)}%`,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(47, 98, 255, 0.24) 0%, rgba(47, 98, 255, 0) 66%)',
          opacity: glow,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.075) 1.1px, transparent 1.3px)',
          backgroundSize: '30px 30px',
          maskImage: 'radial-gradient(ellipse 75% 70% at 50% 50%, black 20%, transparent 85%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 75% 70% at 50% 50%, black 20%, transparent 85%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** Papier : « la clarté d'une banque », pour les écrans d'argent et de billet. */
export const PaperBackground: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const time = useTime();
  return (
    <AbsoluteFill style={{ background: 'var(--color-paper)', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: '70%',
          aspectRatio: '1',
          right: `${-20 + Math.sin(time / 70) * 4}%`,
          top: '-30%',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255, 77, 46, 0.14) 0%, rgba(255, 77, 46, 0) 65%)',
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(18, 16, 43, 0.075) 1.1px, transparent 1.3px)',
          backgroundSize: '30px 30px',
          maskImage: 'radial-gradient(ellipse 80% 75% at 50% 50%, black 25%, transparent 90%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 75% at 50% 50%, black 25%, transparent 90%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
