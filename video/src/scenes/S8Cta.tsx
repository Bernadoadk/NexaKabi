import React from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { config } from '../config';
import { Sfx } from '../components/audio/Sfx';
import { InkBackground } from '../components/motion/Backgrounds';
import { pressAt } from '../components/motion/Cursor';
import { KineticText } from '../components/motion/KineticText';
import { BrandMark } from '../components/ui/Basics';
import { CLAMP, keyPoints, ramp, SPRINGS, sp } from '../lib/anim';
import { useFormat } from '../lib/layout';
import { useTime } from '../lib/time';
import { interpolate } from 'remotion';
import { Scene } from './common';

const CTA_DESIGN = 4.5;

const T = { lockup: 34, typeStart: 46, typeEnd: 74, button: 78, click: 96 };

/** Textes de l'appel à l'action (par défaut `config.scenes.cta`). */
export interface CtaTexts {
  kicker: string;
  button: string;
  subline: string;
}

/**
 * 8 · Appel à l'action : « Cette fin d'année, ne ratez plus rien. », le logo,
 * l'adresse du site qui se tape, le bouton corail qu'un curseur clique.
 * La dernière seconde et demie est un plan fixe : la vidéo boucle proprement.
 * `texts` : les textes d'une autre vidéo du projet.
 */
export const S8Cta: React.FC<{ durationInFrames: number; texts?: CtaTexts }> = ({
  durationInFrames,
  texts = config.scenes.cta,
}) => (
  <Scene design={CTA_DESIGN} durationInFrames={durationInFrames}>
    <InkBackground glow={1.2}>
      <Content texts={texts} />
    </InkBackground>
    <Sounds />
  </Scene>
);

/** Effets sonores : logo, frappe de l'adresse, bouton, clic. */
const Sounds: React.FC = () => (
  <>
    <Sfx at={0} sound="whoosh-deep" volume={0.35} />
    <Sfx at={T.lockup + 1} sound="pop" volume={0.6} />
    {Array.from({ length: Math.ceil((T.typeEnd - T.typeStart) / 2) }, (_, index) => (
      <Sfx
        key={index}
        at={T.typeStart + 1 + index * 2}
        sound="type"
        volume={index % 2 === 0 ? 0.5 : 0.35}
      />
    ))}
    <Sfx at={T.button + 1} sound="pop-high" volume={0.4} />
    <Sfx at={T.click} sound="tap" />
  </>
);

const Content: React.FC<{ texts: CtaTexts }> = ({ texts: scene }) => {
  const time = useTime();
  const { portrait } = useFormat();
  const lockup = sp(time, T.lockup, SPRINGS.pop);
  const bar = sp(time, 40, SPRINGS.smooth);
  const button = sp(time, T.button, SPRINGS.snappy);
  const subline = ramp(time, 84, 98);
  const press = pressAt(time, T.click);

  const url = config.brand.url;
  const typed = Math.round(interpolate(time, [T.typeStart, T.typeEnd], [0, url.length], CLAMP));
  const caret = time < T.typeEnd + 20 && Math.floor(time / 8) % 2 === 0;

  const cursor = keyPoints(time, [
    { at: 80, value: { x: 300, y: 240 } },
    { at: 94, value: { x: 0, y: 0 } },
  ]);
  const cursorVisible = ramp(time, 80, 86) * (1 - ramp(time, 110, 118));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: portrait ? 34 : 30,
        paddingBottom: portrait ? 120 : 20,
      }}
    >
      <KineticText
        text={scene.kicker}
        start={2}
        size={portrait ? 50 : 46}
        font="sans"
        weight={600}
        letterSpacing="-0.01em"
        color="var(--color-on-ink-2)"
        align="center"
      />
      <KineticText
        text={config.brand.slogan}
        start={8}
        size={portrait ? 128 : 150}
        align="center"
        lineHeight={1}
        maxWidth={portrait ? 720 : 1600}
        style={{ marginTop: -8 }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: portrait ? 10 : 6,
          opacity: Math.min(1, lockup * 1.6),
          transform: `scale(${0.6 + lockup * 0.4})`,
        }}
      >
        <BrandMark size={portrait ? 104 : 92} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: portrait ? 60 : 54,
            letterSpacing: '-0.035em',
            color: '#FFFFFF',
          }}
        >
          {config.brand.name}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: portrait ? 'column' : 'row',
          alignItems: 'center',
          gap: portrait ? 22 : 24,
          marginTop: portrait ? 16 : 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            height: portrait ? 104 : 92,
            padding: '0 38px',
            minWidth: portrait ? 820 : 640,
            borderRadius: 999,
            background: '#FFFFFF',
            color: 'var(--color-ink)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: portrait ? 44 : 38,
            letterSpacing: '-0.015em',
            boxShadow: '0 30px 60px -24px rgba(4, 3, 12, 0.8)',
            opacity: Math.min(1, bar * 1.5),
            transform: `translateY(${(1 - bar) * 40}px)`,
          }}
        >
          <Lock size={portrait ? 34 : 30} color="var(--color-mint-700)" strokeWidth={2.4} />
          <span style={{ whiteSpace: 'pre' }}>
            {url.slice(0, typed)}
            <span style={{ opacity: caret ? 1 : 0, color: 'var(--color-coral)', marginLeft: 2 }}>
              |
            </span>
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              height: portrait ? 104 : 92,
              padding: '0 40px',
              borderRadius: 22,
              background: 'var(--color-coral)',
              color: 'var(--color-ink)',
              fontFamily: 'var(--font-sans)',
              fontWeight: 800,
              fontSize: portrait ? 40 : 34,
              whiteSpace: 'nowrap',
              boxShadow: '0 24px 50px -20px rgba(255, 77, 46, 0.7)',
              transform: `scale(${button * (1 - press * 0.05)})`,
              opacity: Math.min(1, button * 1.5),
            }}
          >
            {scene.button}
            <ArrowRight size={portrait ? 40 : 34} strokeWidth={2.6} />
          </div>
          {/* Curseur, ancré sur le centre du bouton */}
          <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <Pointer
              x={cursor.x}
              y={cursor.y}
              opacity={cursorVisible}
              press={press}
              ripple={ramp(time, T.click, T.click + 18)}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 600,
          fontSize: portrait ? 36 : 30,
          color: 'var(--color-on-ink-3)',
          letterSpacing: '0.02em',
          opacity: subline,
          transform: `translateY(${(1 - subline) * 16}px)`,
          marginTop: 8,
        }}
      >
        {scene.subline}
      </div>
    </div>
  );
};

/** Flèche de souris et onde de clic, en coordonnées relatives au bouton. */
const Pointer: React.FC<{
  x: number;
  y: number;
  opacity: number;
  press: number;
  ripple: number;
}> = ({ x, y, opacity, press, ripple }) => {
  if (opacity <= 0) return null;
  const radius = 30 + ripple * 70;
  return (
    <>
      {ripple > 0 && ripple < 1 ? (
        <span
          style={{
            position: 'absolute',
            left: -radius,
            top: -radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: '50%',
            border: '5px solid #FFFFFF',
            opacity: (1 - ripple) * 0.8,
          }}
        />
      ) : null}
      <svg
        width={54}
        height={54}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: x - 7,
          top: y - 4,
          opacity,
          transform: `scale(${1 - press * 0.15})`,
          transformOrigin: '7px 4px',
          filter: 'drop-shadow(0 6px 10px rgba(4, 3, 12, 0.5))',
        }}
      >
        <path
          d="M5 2.5 L5 19.5 L9.4 15.4 L12.3 21.6 L15.2 20.3 L12.4 14.2 L18.5 14.2 Z"
          fill="#FFFFFF"
          stroke="#12102B"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
