import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Sfx } from '../../components/audio/Sfx';
import { KineticText } from '../../components/motion/KineticText';
import { ramp, SPRINGS, sp } from '../../lib/anim';
import { useFormat } from '../../lib/layout';
import { useTime } from '../../lib/time';
import { Scene } from '../../scenes/common';
import { ChatBubble } from '../components/Chat';
import { beatPulse, Concert } from '../components/Concert';
import { jeunesse } from '../config';

/** Repères : la scène s'ouvre sur le dernier refrain ; « Ça. » tombe un temps plus tard. */
const T = { callback: 2, answer: 16 };

/**
 * 7 · Le concert. Éclair, confettis, la bande de dos qui saute sur les temps.
 * La question du vendredi revient en bulle — « On fait quoi ce week-end ? » —
 * et la réponse tombe : « Ça. »
 */
export const J7Ambiance: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.ambiance.seconds} durationInFrames={durationInFrames}>
    <Camera>
      <Concert>
        <Answer />
      </Concert>
    </Camera>
    <Sfx at={0} sound="popper" volume={0.75} />
    <Sfx at={0} sound="whoosh" volume={0.35} />
    <Sfx at={T.answer} sound="impact" volume={0.75} />
  </Scene>
);

/** Léger recul de la caméra pendant la scène, et une pulsation sur chaque temps. */
const Camera: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const time = useTime();
  const pullBack = ramp(time, 0, 130, [1.09, 1.02], (x) => x);
  const pulse = beatPulse(time) * 0.012;
  return (
    <AbsoluteFill style={{ transform: `scale(${pullBack + pulse})` }}>{children}</AbsoluteFill>
  );
};

const Answer: React.FC = () => {
  const time = useTime();
  const { portrait } = useFormat();
  const scene = jeunesse.scenes.ambiance;
  const bubble = sp(time, T.callback, SPRINGS.pop);
  const punch = sp(time, T.answer, SPRINGS.pop);
  const size = portrait ? 300 : 340;
  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: portrait ? 18 : 10,
        paddingTop: portrait ? 120 : 160,
      }}
    >
      <div
        style={{
          opacity: Math.min(1, bubble * 1.5),
          transform: `translateY(${(1 - bubble) * 30}px) scale(${0.7 + bubble * 0.3}) rotate(-2deg)`,
        }}
      >
        <ChatBubble line={{ from: 'koffi', text: scene.callback }} size={portrait ? 34 : 30} />
      </div>
      <div style={{ transform: `scale(${1.25 - 0.25 * punch})` }}>
        <KineticText
          text={scene.answer}
          start={T.answer}
          size={size}
          align="center"
          lineHeight={0.95}
          stagger={0}
          style={{
            textShadow: '0 18px 60px rgba(7, 5, 18, 0.75), 0 0 2px rgba(7, 5, 18, 0.4)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
