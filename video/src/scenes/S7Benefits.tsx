import React from 'react';
import { AbsoluteFill } from 'remotion';
import {
  CalendarPlus,
  Check,
  Compass,
  QrCode,
  ScanLine,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import { config } from '../config';
import { Sfx } from '../components/audio/Sfx';
import { EASE_IN_OUT, ramp, SPRINGS, sp } from '../lib/anim';
import { useFormat } from '../lib/layout';
import { useTime } from '../lib/time';
import { Scene } from './common';

const BENEFITS_DESIGN = 4.5;

/** Entrée de chaque colonne (temps de la scène). */
const T = { public: 14, organizers: 20 };

/** Instant où la coche d'une ligne apparaît. */
const checkAt = (start: number, index: number) => start + 14 + index * 7;

/**
 * 7 · Le double bénéfice : le public sur papier, les organisateurs sur
 * encre, séparés par un trait corail qui se dessine.
 */
export const S7Benefits: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={BENEFITS_DESIGN} durationInFrames={durationInFrames}>
    <Split />
    <Sfx at={0} sound="whoosh" volume={0.6} />
    {[0, 1, 2].map((index) => (
      <React.Fragment key={index}>
        <Sfx at={checkAt(T.public, index)} sound="tick" volume={0.45} />
        <Sfx at={checkAt(T.organizers, index)} sound="pop-high" volume={0.3} />
      </React.Fragment>
    ))}
  </Scene>
);

const Split: React.FC = () => {
  const time = useTime();
  const { portrait } = useFormat();
  const scene = config.scenes.benefits;
  const slide = ramp(time, 0, 16, [0, 1], EASE_IN_OUT);
  const line = ramp(time, 6, 24, [0, 1], EASE_IN_OUT);
  const zoom = 1 + ramp(time, 40, 135, [0, 0.03]);

  const half: React.CSSProperties = portrait
    ? { position: 'absolute', left: 0, right: 0, height: '50%' }
    : { position: 'absolute', top: 0, bottom: 0, width: '50%' };

  return (
    <AbsoluteFill style={{ background: 'var(--color-ink-900)', transform: `scale(${zoom})` }}>
      <div
        style={{
          ...half,
          ...(portrait ? { top: 0 } : { left: 0 }),
          background: 'var(--color-paper)',
          transform: portrait
            ? `translateY(${(1 - slide) * -100}%)`
            : `translateX(${(1 - slide) * -100}%)`,
        }}
      >
        <Column
          title={scene.public.title}
          points={scene.public.points}
          icons={[<Compass key="a" />, <Smartphone key="b" />, <QrCode key="c" />]}
          start={T.public}
          light
        />
      </div>
      <div
        style={{
          ...half,
          ...(portrait ? { bottom: 0 } : { right: 0 }),
          background:
            'radial-gradient(120% 90% at 70% 20%, var(--color-ink-700) 0%, var(--color-ink) 55%, var(--color-ink-900) 100%)',
          transform: portrait
            ? `translateY(${(1 - slide) * 100}%)`
            : `translateX(${(1 - slide) * 100}%)`,
        }}
      >
        <Column
          title={scene.organizers.title}
          points={scene.organizers.points}
          icons={[<CalendarPlus key="a" />, <TrendingUp key="b" />, <ScanLine key="c" />]}
          start={T.organizers}
        />
      </div>
      <div
        style={
          portrait
            ? {
                position: 'absolute',
                left: 0,
                top: '50%',
                height: 8,
                marginTop: -4,
                width: `${line * 100}%`,
                background: 'var(--color-coral)',
                borderRadius: 4,
              }
            : {
                position: 'absolute',
                top: 0,
                left: '50%',
                width: 8,
                marginLeft: -4,
                height: `${line * 100}%`,
                background: 'var(--color-coral)',
                borderRadius: 4,
              }
        }
      />
    </AbsoluteFill>
  );
};

const Column: React.FC<{
  title: string;
  points: readonly string[];
  icons: React.ReactNode[];
  start: number;
  light?: boolean;
}> = ({ title, points, icons, start, light = false }) => {
  const time = useTime();
  const { portrait } = useFormat();
  const titleIn = sp(time, start, SPRINGS.snappy);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: portrait ? 'center' : 'flex-start',
        padding: portrait ? '0 90px' : '330px 100px 0',
        gap: portrait ? 40 : 48,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: portrait ? 76 : 62,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          color: light ? 'var(--color-ink)' : '#FFFFFF',
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 30}px)`,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: portrait ? 26 : 30 }}>
        {points.map((point, index) => {
          const enter = sp(time, start + 8 + index * 7, SPRINGS.snappy);
          const check = sp(time, checkAt(start, index), SPRINGS.pop);
          return (
            <div
              key={point}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                opacity: enter,
                transform: `translateX(${(1 - enter) * (light ? -40 : 40)}px)`,
              }}
            >
              <span
                style={{
                  width: 76,
                  height: 76,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: light ? 'var(--color-coral-50)' : 'rgba(255, 255, 255, 0.1)',
                  color: light ? 'var(--color-coral)' : 'var(--color-coral-300)',
                }}
              >
                <span style={{ display: 'grid', placeItems: 'center', transform: 'scale(1.5)' }}>
                  {icons[index]}
                </span>
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: portrait ? 40 : 35,
                  lineHeight: 1.2,
                  letterSpacing: '-0.01em',
                  color: light ? 'var(--color-ink)' : '#FFFFFF',
                }}
              >
                {point}
              </span>
              <span
                style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: 'var(--color-mint)',
                  color: 'var(--color-ink)',
                  display: 'grid',
                  placeItems: 'center',
                  transform: `scale(${check})`,
                }}
              >
                <Check size={26} strokeWidth={3.2} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
