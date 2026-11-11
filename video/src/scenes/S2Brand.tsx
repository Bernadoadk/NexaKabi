import React from 'react';
import { config } from '../config';
import { Sfx } from '../components/audio/Sfx';
import { InkBackground } from '../components/motion/Backgrounds';
import { KineticText } from '../components/motion/KineticText';
import { BrandMark } from '../components/ui/Basics';
import { ramp, SPRINGS, sp } from '../lib/anim';
import { useFormat } from '../lib/layout';
import { useTime } from '../lib/time';
import { Scene } from './common';

const BRAND_DESIGN = 4;

/**
 * 2 · Le logo et la promesse.
 * Onde corail, le monogramme arrive en ressort, le nom glisse de derrière
 * lui, puis la promesse s'écrit dessous.
 */
export const S2Brand: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={BRAND_DESIGN} durationInFrames={durationInFrames}>
    <InkBackground>
      <Content />
    </InkBackground>
    {/* Le logo frappe avec l'onde de choc, le nom glisse de derrière lui. */}
    <Sfx at={2} sound="impact" volume={0.9} />
    <Sfx at={16} sound="swish" volume={0.3} />
  </Scene>
);

const Content: React.FC = () => {
  const time = useTime();
  const { portrait } = useFormat();

  const wave = ramp(time, 0, 22);
  const logo = sp(time, 2, SPRINGS.pop);
  const name = sp(time, 16, SPRINGS.smooth);
  const breathe = 1 + ramp(time, 60, 135, [0, 0.035]);
  const glow = 0.55 + 0.25 * Math.sin(time / 12);

  const logoSize = portrait ? 250 : 230;
  const nameSize = portrait ? 138 : 176;

  const letters = [...config.brand.name];

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${breathe})` }}>
      {/* Onde de choc corail */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: portrait ? '40%' : '44%',
          width: 2400 * wave,
          height: 2400 * wave,
          marginLeft: -1200 * wave,
          marginTop: -1200 * wave,
          borderRadius: '50%',
          border: `${Math.max(0, 70 * (1 - wave))}px solid var(--color-coral)`,
          opacity: 1 - wave,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: portrait ? 36 : 44,
          paddingBottom: portrait ? 180 : 60,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: portrait ? 'column' : 'row',
            alignItems: 'center',
            gap: portrait ? 10 : 6,
          }}
        >
          <div style={{ position: 'relative', width: logoSize, height: logoSize }}>
            <div
              style={{
                position: 'absolute',
                inset: '-35%',
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(255, 122, 69, 0.45) 0%, rgba(47, 98, 255, 0.22) 38%, rgba(18, 16, 43, 0) 68%)',
                opacity: glow * logo,
              }}
            />
            <BrandMark
              size={logoSize}
              style={{
                position: 'relative',
                transform: `scale(${0.2 + logo * 0.8}) rotate(${(1 - logo) * -28}deg)`,
                opacity: Math.min(1, logo * 2),
              }}
            />
          </div>

          <div
            style={{
              clipPath: portrait
                ? `inset(0 0 ${(1 - name) * 100}% 0)`
                : `inset(0 ${(1 - name) * 100}% 0 0)`,
              transform: portrait
                ? `translateY(${(1 - name) * -30}px)`
                : `translateX(${(1 - name) * -60}px)`,
            }}
          >
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: nameSize,
                letterSpacing: '-0.04em',
                lineHeight: 1,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
                paddingBottom: '0.08em',
              }}
            >
              {letters.map((letter, index) => {
                const rise = sp(time, 18 + index * 1.6, SPRINGS.snappy);
                return (
                  <span
                    key={index}
                    style={{
                      display: 'inline-block',
                      transform: `translateY(${(1 - rise) * 30}%)`,
                      opacity: rise,
                      whiteSpace: 'pre',
                    }}
                  >
                    {letter}
                  </span>
                );
              })}
            </span>
          </div>
        </div>

        <KineticText
          text={config.brand.promise}
          start={46}
          size={portrait ? 64 : 62}
          weight={700}
          align="center"
          lineHeight={1.12}
          letterSpacing="-0.025em"
          color="var(--color-on-ink-soft)"
          accentColor="var(--color-coral)"
          stagger={3}
        />
      </div>
    </div>
  );
};
