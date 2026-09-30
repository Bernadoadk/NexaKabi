import React from 'react';
import { CalendarDays, Phone } from 'lucide-react';
import { config } from '../config';
import { InkBackground } from '../components/motion/Backgrounds';
import { KineticText } from '../components/motion/KineticText';
import { EASE_IN, ramp, SPRINGS, sp } from '../lib/anim';
import { useFormat } from '../lib/layout';
import { useTime } from '../lib/time';
import { Scene } from './common';

/** Durée de conception de la scène (secondes). */
const HOOK_DESIGN = 5;

/**
 * 1 · Accroche — l'information est éparpillée, le billet introuvable.
 * Des fragments génériques (bulles de discussion, affiche floue, post-it,
 * numéro à appeler) surgissent, tremblent, puis s'effondrent sur
 * « …le billet, nulle part. ». Aucun logo de réseau social.
 */
export const S1Hook: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={HOOK_DESIGN} durationInFrames={durationInFrames}>
    <InkBackground glow={0.55}>
      <Fragments />
      <Titles />
    </InkBackground>
  </Scene>
);

const Titles: React.FC = () => {
  const { portrait } = useFormat();
  const [first, second, third] = config.scenes.hook.lines;
  const size = portrait ? 104 : 120;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {[
        { text: first, start: 6, exit: 46 },
        { text: second, start: 54, exit: 94 },
        { text: third, start: 102, exit: undefined },
      ].map((beat) => (
        <div key={beat.text} style={{ gridArea: '1 / 1' }}>
          <KineticText
            text={beat.text}
            start={beat.start}
            exit={beat.exit}
            size={size}
            align="center"
            lineHeight={1.02}
            stagger={3}
            style={{ textShadow: '0 10px 40px rgba(11, 9, 24, 0.6)' }}
          />
        </div>
      ))}
    </div>
  );
};

interface FragmentSpec {
  id: string;
  /** Position en % du cadre, par format. */
  landscape: [number, number];
  portrait: [number, number];
  rotate: number;
  delay: number;
  node: React.ReactNode;
}

const Fragments: React.FC = () => {
  const time = useTime();
  const { portrait } = useFormat();
  const hook = config.scenes.hook;
  const scale = portrait ? 1.05 : 1;

  const fragments: FragmentSpec[] = [
    {
      id: 'b1',
      landscape: [17, 20],
      portrait: [28, 13],
      rotate: -6,
      delay: 12,
      node: <Bubble text={hook.bubbles[0]} />,
    },
    {
      id: 'flyer',
      landscape: [82, 26],
      portrait: [78, 21],
      rotate: 8,
      delay: 18,
      node: <Flyer text={hook.flyer} />,
    },
    {
      id: 'b2',
      landscape: [75, 80],
      portrait: [60, 72],
      rotate: 4,
      delay: 24,
      node: <Bubble text={hook.bubbles[1]} dark />,
    },
    {
      id: 'note',
      landscape: [16, 74],
      portrait: [25, 83],
      rotate: -8,
      delay: 30,
      node: <Note text={hook.note} />,
    },
    {
      id: 'phone',
      landscape: [48, 11],
      portrait: [44, 31],
      rotate: 2,
      delay: 58,
      node: <PhoneChip text={hook.phone} />,
    },
    {
      id: 'b3',
      landscape: [45, 90],
      portrait: [70, 90],
      rotate: -3,
      delay: 62,
      node: <Bubble text={hook.bubbles[2]} />,
    },
    { id: 'q', landscape: [92, 55], portrait: [86, 60], rotate: 10, delay: 66, node: <Question /> },
    {
      id: 'cal',
      landscape: [6, 45],
      portrait: [14, 62],
      rotate: -10,
      delay: 70,
      node: <CalendarCard />,
    },
  ];

  const tension = ramp(time, 40, 100, [1, 6]);

  return (
    <>
      {fragments.map((fragment, index) => {
        const [left, top] = portrait ? fragment.portrait : fragment.landscape;
        const enter = sp(time, fragment.delay, SPRINGS.pop);
        const jitterX = Math.sin(time * 0.85 + index * 1.7) * tension;
        const jitterY = Math.cos(time * 0.7 + index * 2.3) * tension;
        const fall = ramp(time, 104 + index * 2, 136 + index * 2, [0, 1], EASE_IN);
        const direction = index % 2 === 0 ? -1 : 1;
        return (
          <div
            key={fragment.id}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) translate(${jitterX + direction * fall * 60}px, ${jitterY + fall * 900}px) rotate(${fragment.rotate + (1 - enter) * -14 + direction * fall * 50}deg) scale(${scale * (0.4 + enter * 0.6)})`,
              opacity: Math.min(1, enter * 1.8) * (1 - fall * 0.9),
              filter: fall > 0 ? `blur(${fall * 6}px)` : undefined,
            }}
          >
            {fragment.node}
          </div>
        );
      })}
    </>
  );
};

const Bubble: React.FC<{ text: string; dark?: boolean }> = ({ text, dark = false }) => (
  <div style={{ position: 'relative' }}>
    <div
      style={{
        padding: '18px 28px',
        borderRadius: 26,
        background: dark ? 'var(--color-ink-700)' : '#FFFFFF',
        color: dark ? '#FFFFFF' : 'var(--color-ink)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: 34,
        whiteSpace: 'nowrap',
        boxShadow: '0 24px 50px -20px rgba(4, 3, 12, 0.7)',
        border: dark ? '1px solid rgba(255,255,255,0.12)' : undefined,
      }}
    >
      {text}
    </div>
    <span
      style={{
        position: 'absolute',
        bottom: -10,
        left: dark ? undefined : 26,
        right: dark ? 26 : undefined,
        width: 26,
        height: 26,
        background: dark ? 'var(--color-ink-700)' : '#FFFFFF',
        transform: 'rotate(45deg)',
        borderRadius: 4,
      }}
    />
  </div>
);

const Flyer: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      width: 230,
      height: 310,
      borderRadius: 14,
      overflow: 'hidden',
      background: 'linear-gradient(160deg, #FF4D2E 0%, #B42A55 45%, #2A1140 100%)',
      boxShadow: '0 30px 60px -24px rgba(4, 3, 12, 0.8)',
      padding: 22,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      filter: 'blur(1.4px)',
    }}
  >
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 46,
        color: '#FFFFFF',
        lineHeight: 0.9,
        textTransform: 'uppercase',
      }}
    >
      {text}
    </span>
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 64,
        color: '#FFD27A',
        lineHeight: 0.9,
      }}
    >
      ??
    </span>
    <span style={{ flex: 1 }} />
    {[70, 90, 55].map((width, index) => (
      <span
        key={index}
        style={{
          height: 10,
          width: `${width}%`,
          borderRadius: 6,
          background: 'rgba(255,255,255,0.55)',
        }}
      />
    ))}
  </div>
);

const Note: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      width: 250,
      padding: '30px 26px',
      background: 'var(--color-amber-200)',
      color: 'var(--color-ink)',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 38,
      lineHeight: 1.05,
      boxShadow: '0 26px 40px -22px rgba(4, 3, 12, 0.8)',
      borderRadius: 4,
    }}
  >
    {text}
  </div>
);

const PhoneChip: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '16px 26px',
      borderRadius: 999,
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      color: '#FFFFFF',
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 30,
      whiteSpace: 'nowrap',
    }}
  >
    <Phone size={30} color="var(--color-coral-300)" />
    {text}
  </div>
);

const Question: React.FC = () => (
  <div
    style={{
      width: 104,
      height: 104,
      borderRadius: '50%',
      background: 'var(--color-coral)',
      color: 'var(--color-ink)',
      display: 'grid',
      placeItems: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 70,
      boxShadow: '0 20px 40px -16px rgba(255, 77, 46, 0.6)',
    }}
  >
    ?
  </div>
);

const CalendarCard: React.FC = () => (
  <div
    style={{
      width: 170,
      borderRadius: 18,
      overflow: 'hidden',
      background: '#FFFFFF',
      boxShadow: '0 24px 44px -20px rgba(4, 3, 12, 0.8)',
      textAlign: 'center',
      fontFamily: 'var(--font-display)',
    }}
  >
    <div
      style={{
        background: 'var(--color-ink-700)',
        color: 'var(--color-coral-200)',
        padding: '10px 0',
        fontWeight: 800,
        fontSize: 24,
        letterSpacing: '0.1em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <CalendarDays size={22} /> DÉC.
    </div>
    <div
      style={{
        padding: '10px 0 16px',
        fontWeight: 800,
        fontSize: 76,
        color: 'var(--color-ink)',
        lineHeight: 1,
      }}
    >
      ??
    </div>
  </div>
);
