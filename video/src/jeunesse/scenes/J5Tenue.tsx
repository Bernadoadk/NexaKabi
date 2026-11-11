import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Sfx } from '../../components/audio/Sfx';
import { KineticText } from '../../components/motion/KineticText';
import { SPRINGS, sp } from '../../lib/anim';
import { useFormat } from '../../lib/layout';
import { useTime } from '../../lib/time';
import { Scene } from '../../scenes/common';
import { jeunesse } from '../config';

/** Repères (images, temps de la scène), sur les temps de la musique. */
const T = { first: 4, firstOut: 28, second: 33, stickers: [37, 41, 45, 49, 53] };

/** Les autocollants de la tenue : position (% du cadre, par format), rotation. */
const STICKERS = [
  { emoji: '👟', landscape: [16, 24], portrait: [20, 17], rotate: -14 },
  { emoji: '🕶️', landscape: [83, 22], portrait: [79, 21], rotate: 12 },
  { emoji: '👗', landscape: [12, 74], portrait: [17, 79], rotate: 9 },
  { emoji: '🧢', landscape: [86, 72], portrait: [82, 76], rotate: -10 },
  { emoji: '💅🏾', landscape: [70, 88], portrait: [52, 88], rotate: 6 },
] as const;

/**
 * 5 · Intermède, sur fond corail : « Le plus dur maintenant ? » —
 * « Choisir la tenue. » Les billets sont réglés ; il reste l'essentiel.
 */
export const J5Tenue: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.tenue.seconds} durationInFrames={durationInFrames}>
    <CoralBackground>
      <Stickers />
      <Lines />
    </CoralBackground>
    {T.stickers.map((at, index) => (
      <Sfx key={at} at={at + 1} sound={index % 2 === 0 ? 'pop' : 'pop-high'} volume={0.45} />
    ))}
  </Scene>
);

const CoralBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const time = useTime();
  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(120% 90% at 50% 40%, #FF6A4A 0%, var(--color-coral) 45%, var(--color-coral-hover) 100%)',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(18, 16, 43, 0.12) 2px, transparent 2.4px)',
          backgroundSize: '36px 36px',
          backgroundPosition: `${time * 0.6}px ${time * 0.3}px`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

const Lines: React.FC = () => {
  const { portrait } = useFormat();
  const [first, second] = jeunesse.scenes.tenue.lines;
  const size = portrait ? 116 : 132;
  return (
    <AbsoluteFill style={{ display: 'grid', placeItems: 'center' }}>
      {[
        { text: first, start: T.first, exit: T.firstOut },
        { text: second, start: T.second, exit: undefined },
      ].map((beat) => (
        <div key={beat.text} style={{ gridArea: '1 / 1' }}>
          <KineticText
            text={beat.text}
            start={beat.start}
            exit={beat.exit}
            size={size}
            align="center"
            lineHeight={1.02}
            color="var(--color-ink)"
            accentColor="#FFFFFF"
            stagger={3}
          />
        </div>
      ))}
    </AbsoluteFill>
  );
};

const Stickers: React.FC = () => {
  const time = useTime();
  const { portrait } = useFormat();
  const size = portrait ? 150 : 140;
  return (
    <>
      {STICKERS.map((sticker, index) => {
        const [left, top] = portrait ? sticker.portrait : sticker.landscape;
        const pop = sp(time, T.stickers[index], SPRINGS.bouncy);
        const float = Math.sin(time / 9 + index * 1.3) * 6;
        return (
          <div
            key={sticker.emoji}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: '#FFFFFF',
              display: 'grid',
              placeItems: 'center',
              fontSize: size * 0.56,
              lineHeight: 1,
              boxShadow: '0 22px 40px -18px rgba(120, 20, 0, 0.55)',
              transform: `translate(-50%, -50%) translateY(${float}px) rotate(${sticker.rotate + (1 - pop) * -30}deg) scale(${pop})`,
            }}
          >
            {sticker.emoji}
          </div>
        );
      })}
    </>
  );
};
