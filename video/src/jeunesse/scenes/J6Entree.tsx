import React from 'react';
import { Check } from 'lucide-react';
import { Sfx } from '../../components/audio/Sfx';
import { InkBackground } from '../../components/motion/Backgrounds';
import { Eyebrow, KineticText } from '../../components/motion/KineticText';
import { EASE_IN_OUT, ramp, SPRINGS, sp } from '../../lib/anim';
import { useTime } from '../../lib/time';
import { ScannerScreen } from '../../screens/ScannerScreen';
import { PhoneRig, Scene, TextColumn, useStage } from '../../scenes/common';
import { FriendAvatar } from '../components/Friends';
import { jeunesse } from '../config';
import { BAND, ticketReference } from '../data';

/**
 * Repères (images, temps de la scène). Les quatre lectures tombent un temps
 * sur deux (32,7 images) ; la scène finit sur l'entrée du dernier refrain.
 */
const T = {
  reads: [40, 72.6, 105.4, 138.1],
  avatars: 22,
};

/** Fenêtre d'une lecture : le téléphone arrive, éclair, verdict, retour au scan. */
const ARRIVE = 20;

/**
 * 6 · Samedi soir, à l'entrée. Sur le scanner du contrôleur, les téléphones
 * de la bande se succèdent : quatre lectures, quatre « Entrée autorisée »,
 * au nom de chacun. À côté, les pastilles s'allument une à une.
 */
export const J6Entree: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.entree.seconds} durationInFrames={durationInFrames}>
    <InkBackground>
      <ScannerPhone />
      <Texts />
    </InkBackground>
    <Sfx at={0} sound="whoosh-deep" volume={0.45} />
    {T.reads.map((at) => (
      <React.Fragment key={at}>
        <Sfx at={at} sound="beep" volume={0.42} />
        <Sfx at={at + 3} sound="valid" volume={0.62} />
      </React.Fragment>
    ))}
    {/* Montée jusqu'au refrain : le concert, scène suivante. */}
    <Sfx at={durationInFrames - 45} sound="riser" volume={0.5} />
  </Scene>
);

/** Lectures faites à l'instant `time`. */
const readsDone = (time: number) => T.reads.filter((at) => time >= at).length;

const Texts: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const scene = jeunesse.scenes.entree;
  const align = stage.portrait ? 'center' : 'left';
  const size = stage.portrait ? 104 : 112;
  const done = readsDone(time);
  return (
    <TextColumn>
      <Eyebrow text={scene.eyebrow} start={6} align={align} />
      <KineticText
        text={scene.title}
        start={10}
        size={stage.titleSize}
        align={align}
        maxWidth={stage.portrait ? 940 : 700}
      />
      <div
        style={{
          display: 'flex',
          gap: stage.portrait ? 26 : 24,
          justifyContent: stage.portrait ? 'center' : 'flex-start',
          marginTop: stage.portrait ? 4 : 14,
        }}
      >
        {BAND.map((id, index) => {
          const friend = jeunesse.friends[id];
          const enter = sp(time, T.avatars + index * 3, SPRINGS.snappy);
          const read = T.reads[index];
          const on = time >= read;
          const light = sp(time, read, SPRINGS.bouncy);
          return (
            <div
              key={id}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                opacity: Math.min(1, enter * 1.5),
                transform: `translateY(${(1 - enter) * 30}px) scale(${on ? 1 + Math.sin(Math.min(1, (time - read) / 9) * Math.PI) * 0.12 : 1})`,
              }}
            >
              <FriendAvatar
                friend={friend}
                size={size}
                ring={on ? 'var(--color-mint)' : 'rgba(255, 255, 255, 0.12)'}
                style={{
                  filter: on ? undefined : 'grayscale(1) brightness(0.55)',
                }}
              />
              {on ? (
                <span
                  style={{
                    position: 'absolute',
                    right: -6,
                    top: size - 30,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--color-mint)',
                    color: 'var(--color-ink)',
                    display: 'grid',
                    placeItems: 'center',
                    border: '4px solid var(--color-ink)',
                    transform: `scale(${light})`,
                  }}
                >
                  <Check size={22} strokeWidth={3.4} />
                </span>
              ) : null}
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 800,
                  fontSize: stage.portrait ? 26 : 24,
                  color: on ? '#FFFFFF' : 'var(--color-on-ink-4)',
                }}
              >
                {friend.name}
              </span>
            </div>
          );
        })}
      </div>
      {done > 0 ? <Counter done={done} align={align} /> : null}
    </TextColumn>
  );
};

/** « 4/4 entrés » qui se remplit. */
const Counter: React.FC<{ done: number; align: 'left' | 'center' }> = ({ done, align }) => {
  const time = useTime();
  const pop = sp(time, T.reads[done - 1], SPRINGS.pop);
  return (
    <div
      style={{
        alignSelf: align === 'center' ? 'center' : 'flex-start',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        borderRadius: 999,
        background: done === BAND.length ? 'var(--color-mint)' : 'rgba(255, 255, 255, 0.1)',
        color: done === BAND.length ? 'var(--color-ink)' : '#FFFFFF',
        fontFamily: 'var(--font-sans)',
        fontWeight: 800,
        fontSize: 28,
        transform: `scale(${0.9 + pop * 0.1})`,
      }}
    >
      <span className="tabular">
        {done}/{BAND.length}
      </span>
      <span style={{ fontWeight: 600, opacity: 0.8 }}>
        {done === BAND.length ? 'toute la bande est là' : 'entrés'}
      </span>
    </div>
  );
};

const ScannerPhone: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const enter = sp(time, 0, SPRINGS.smooth);

  // Le téléphone présenté : celui de la lecture en cours (ou de la suivante,
  // dès que le verdict couvre l'écran).
  const current = Math.min(
    T.reads.length - 1,
    T.reads.findIndex((at) => time < at + 8) === -1
      ? T.reads.length - 1
      : T.reads.findIndex((at) => time < at + 8),
  );
  const read = T.reads[current];
  const held = sp(time, read - ARRIVE, SPRINGS.smooth);

  // La dernière lecture faite : son éclair, son verdict.
  const last = readsDone(time) - 1;
  const shown = Math.max(0, last);
  const lastRead = T.reads[shown];
  const flash = last < 0 ? 0 : ramp(time, lastRead, lastRead + 8, [1, 0]);
  // Le verdict se replie avant la lecture suivante ; le dernier reste affiché.
  const retract =
    last < 0 || last === T.reads.length - 1
      ? 0
      : ramp(time, lastRead + 18, lastRead + 26, [0, 1], EASE_IN_OUT);
  const verdict =
    last < 0 ? 0 : ramp(time, lastRead + 1, lastRead + 11, [0, 1], EASE_IN_OUT) * (1 - retract);
  const shake = last >= 0 && time < lastRead + 8 ? Math.sin(time * 3.1) * 4 : 0;

  return (
    <PhoneRig
      x={stage.phone.x}
      // 9:16 : un peu plus bas, sous le compteur « 4/4 ».
      y={stage.phone.y + (stage.portrait ? 84 : 0)}
      scale={stage.phone.scale * (0.92 + enter * 0.08)}
      offsetX={shake}
      offsetY={(1 - enter) * 60}
      statusBar="light"
      clock={jeunesse.data.clockEntry}
    >
      <ScannerScreen
        held={held}
        flash={flash}
        verdict={verdict}
        entries={jeunesse.data.entriesBefore + readsDone(time)}
        pending={readsDone(time)}
        attendee={jeunesse.friends[BAND[shown]].fullName}
        reference={ticketReference(verdict > 0 ? shown : current)}
      />
    </PhoneRig>
  );
};
