import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Sfx } from '../../components/audio/Sfx';
import { InkBackground } from '../../components/motion/Backgrounds';
import { KineticText } from '../../components/motion/KineticText';
import { EASE_IN, EASE_IN_OUT, ramp, SPRINGS, sp } from '../../lib/anim';
import { useFormat } from '../../lib/layout';
import { useTime } from '../../lib/time';
import { Scene } from '../../scenes/common';
import { bubbleHeight, ChatHeader, ChatStack, type StackItem } from '../components/Chat';
import { jeunesse } from '../config';

/**
 * Repères (images, temps de la scène). 110 BPM : un temps = 16,36 images,
 * et la scène démarre sur un temps. Chaque message tombe juste avant un
 * temps, pour que la bulle « claque » dessus.
 */
const T = {
  /** La grande question rejoint la discussion. */
  morph: 30,
  morphEnd: 44,
  messages: [41, 64, 80, 96, 129],
  /** Aïcha écrit… */
  typing: 106,
  /** Coupure de la musique : on se rapproche du message d'Aïcha. */
  focus: 164,
};

/**
 * 1 · « On fait quoi ce week-end ? »
 * La question s'affiche en grand, puis rejoint la discussion de la bande ;
 * les réponses s'empilent, sans idée. Aïcha : « Attendez, je regarde 👀 ».
 * Pendant la coupure de la musique, on se rapproche de son message ; la
 * reprise ouvre Nexa Kabi (scène suivante).
 */
export const J1Question: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.question.seconds} durationInFrames={durationInFrames}>
    <InkBackground glow={0.7}>
      <Chat />
      <Hero />
    </InkBackground>
    <Sounds durationInFrames={durationInFrames} />
  </Scene>
);

const Sounds: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const messages = jeunesse.scenes.question.messages;
  return (
    <>
      {/* Le téléphone vibre : la question tombe. */}
      <Sfx at={0} sound="buzz" volume={0.32} />
      <Sfx at={T.morph} sound="swish" volume={0.3} />
      {T.messages.map((at, index) => (
        <Sfx
          key={at}
          at={at + 1}
          sound={messages[index].from === undefined ? 'send' : 'message'}
          volume={messages[index].from === undefined ? 0.55 : 0.45}
        />
      ))}
      {/* Montée pendant la coupure, jusqu'au logo de la scène suivante. */}
      <Sfx at={durationInFrames - 45} sound="riser" volume={0.45} />
    </>
  );
};

/** Mise en page de la discussion, par format. */
function useLayout() {
  const { portrait } = useFormat();
  // 9:16 : colonne arrêtée à x = 930, avant les boutons de TikTok et des Reels.
  return portrait
    ? { size: 42, left: 70, width: 860, headerTop: 330, dayTop: 486, bottom: 1420, hero: 124 }
    : { size: 36, left: 560, width: 800, headerTop: 92, dayTop: 214, bottom: 962, hero: 150 };
}

function useItems(): StackItem[] {
  const messages = jeunesse.scenes.question.messages;
  return messages.map((line, index) => ({
    key: `m${index}`,
    line,
    at: T.messages[index],
    typingAt: line.from === undefined ? T.typing : undefined,
  }));
}

const Chat: React.FC = () => {
  const time = useTime();
  const layout = useLayout();
  const { portrait } = useFormat();
  const items = useItems();
  const header = sp(time, T.morph + 4, SPRINGS.smooth);
  const day = sp(time, T.morph + 10, SPRINGS.snappy);

  // Coupure : on se rapproche du message d'Aïcha (en bas à droite).
  const focus = ramp(time, T.focus, T.focus + 14);
  const push = ramp(time, T.focus, 196, [0, 1], EASE_IN);
  const last = items[items.length - 1];
  const originX = layout.left + layout.width - layout.size * 4;
  const originY = layout.bottom - bubbleHeight(last.line, layout.size) / 2;

  return (
    <AbsoluteFill
      style={{
        transformOrigin: `${originX}px ${originY}px`,
        transform: `scale(${1 + push * (portrait ? 0.34 : 0.42)})`,
      }}
    >
      <Floaters />
      <div
        style={{
          position: 'absolute',
          left: layout.left,
          top: layout.headerTop,
          width: layout.width,
          paddingBottom: layout.size * 0.5,
          borderBottom: '1px solid rgba(255, 255, 255, 0.09)',
          opacity: header * (1 - focus * 0.7),
          transform: `translateY(${(1 - header) * -40}px)`,
        }}
      >
        <ChatHeader size={layout.size * 0.92} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: layout.left,
          width: layout.width,
          top: layout.dayTop,
          display: 'flex',
          justifyContent: 'center',
          opacity: day * (1 - focus * 0.7),
        }}
      >
        <span
          style={{
            padding: `${layout.size * 0.16}px ${layout.size * 0.5}px`,
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.08)',
            color: 'var(--color-on-ink-2)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            fontSize: layout.size * 0.56,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {jeunesse.scenes.question.dayLabel}
        </span>
      </div>
      <ChatStack
        items={items}
        size={layout.size}
        left={layout.left}
        width={layout.width}
        bottom={layout.bottom}
        focusKey={last.key}
        focus={focus}
      />
    </AbsoluteFill>
  );
};

/** La question en grand, qui rétrécit jusqu'à sa bulle dans la discussion. */
const Hero: React.FC = () => {
  const time = useTime();
  const { width, height } = useFormat();
  const layout = useLayout();
  const first = jeunesse.scenes.question.messages[0];
  const morph = ramp(time, T.morph, T.morphEnd, [0, 1], EASE_IN_OUT);
  if (morph >= 1) return null;

  // Centre approximatif du texte de la première bulle (0,56 em par caractère).
  const textWidth = first.text.length * 0.56 * layout.size;
  const targetX = layout.left + layout.size * 1.87 + layout.size * 0.58 + textWidth / 2;
  const targetY = layout.bottom - bubbleHeight(first, layout.size) * 0.42;
  const scale = 1 - morph * (1 - layout.size / layout.hero);
  // Deux « bzz » au début : le texte tremble avec le téléphone.
  const buzz = time < 14 ? Math.sin(time * 2.6) * 7 * (time < 5 || time > 7 ? 1 : 0) : 0;

  return (
    <AbsoluteFill
      style={{
        display: 'grid',
        placeItems: 'center',
        transform: `translate(${(targetX - width / 2) * morph + buzz}px, ${(targetY - height / 2) * morph}px) scale(${scale})`,
        opacity: 1 - ramp(morph, 0.72, 1),
      }}
    >
      <KineticText
        text={jeunesse.scenes.question.title}
        start={0}
        size={layout.hero}
        align="center"
        lineHeight={1.02}
        stagger={2.5}
        style={{ textShadow: '0 10px 40px rgba(11, 9, 24, 0.6)' }}
      />
    </AbsoluteFill>
  );
};

/** Emoji qui flottent sur les côtés (16:9) : l'ennui du vendredi soir. */
const Floaters: React.FC = () => {
  const time = useTime();
  const { portrait } = useFormat();
  if (portrait) return null;
  const items = [
    { emoji: '😴', x: 250, y: 330, at: 56, rotate: -12 },
    { emoji: '🤷🏾‍♂️', x: 1680, y: 400, at: 70, rotate: 10 },
    { emoji: '💤', x: 330, y: 760, at: 86, rotate: 8 },
    { emoji: '🙄', x: 1610, y: 800, at: 100, rotate: -8 },
  ];
  return (
    <>
      {items.map((item, index) => {
        const enter = sp(time, item.at, SPRINGS.pop);
        const drift = Math.sin(time / 20 + index * 1.7) * 10;
        const leave = ramp(time, T.focus, T.focus + 12, [0, 1], EASE_IN);
        return (
          <span
            key={item.emoji}
            style={{
              position: 'absolute',
              left: item.x,
              top: item.y + drift,
              fontSize: 96,
              lineHeight: 1,
              opacity: Math.min(1, enter * 1.5) * 0.55 * (1 - leave),
              transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${0.4 + enter * 0.6})`,
              filter: 'saturate(0.85)',
            }}
          >
            {item.emoji}
          </span>
        );
      })}
    </>
  );
};
