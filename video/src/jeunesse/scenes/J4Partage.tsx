import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Check, Link2 } from 'lucide-react';
import { Sfx } from '../../components/audio/Sfx';
import { InkBackground } from '../../components/motion/Backgrounds';
import { Eyebrow, KineticText } from '../../components/motion/KineticText';
import { EASE_IN_OUT, inOut, keyframes, ramp, SPRINGS, sp } from '../../lib/anim';
import { useTime } from '../../lib/time';
import { ConfirmationScreen } from '../../screens/ConfirmationScreen';
import { PhoneRig, Point, Scene, useStage } from '../../scenes/common';
import { ChatBubble, TicketLink } from '../components/Chat';
import { FriendAvatar } from '../components/Friends';
import { jeunesse } from '../config';
import { bandTickets, RECIPIENTS } from '../data';

/** Repères (images, temps de la scène), sur les temps de la musique. */
const T = {
  scroll: 6,
  avatars: 20,
  /** Départ de chaque lien (Koffi, Sèna, Yann). */
  send: [38, 54, 70],
  flight: 14,
  replies: [88, 96, 104],
  point: 62,
};

/** Fin de la scène précédente : la confirmation est apparue 16 images plus tôt. */
const CONFIRMATION_APPEAR = -16;
/** Défilement de la confirmation jusqu'aux billets émis. */
const SCROLL = 230;
/** Ligne de chaque billet (centre), en pixels de l'écran, page défilée. */
const ROW_Y = (index: number) => 416 + index * 54;

/**
 * 4 · « Un lien par billet » : sur la confirmation, les quatre billets émis,
 * au nom de chacun. Aïcha envoie à chacun son lien : les billets filent vers
 * Koffi, Sèna et Yann, qui répondent. Pas besoin de compte pour le recevoir.
 */
export const J4Partage: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.partage.seconds} durationInFrames={durationInFrames}>
    <InkBackground>
      <Phone />
      <Texts />
      <Friends />
      <Flights />
    </InkBackground>
    {T.send.map((at) => (
      <Sfx key={at} at={at} sound="send" volume={0.5} />
    ))}
    {T.send.map((at) => (
      <Sfx key={`in${at}`} at={at + T.flight} sound="pop-high" volume={0.4} />
    ))}
    {T.replies.map((at) => (
      <Sfx key={`r${at}`} at={at + 1} sound="message" volume={0.45} />
    ))}
  </Scene>
);

/** Cadrage du téléphone, partagé avec les billets qui s'envolent. */
function useRig() {
  const time = useTime();
  const stage = useStage();
  const move = keyframes(time, [
    { at: 0, value: 0 },
    { at: 22, value: 1 },
  ]);
  const base = stage.phone.scale;
  return stage.portrait
    ? {
        x: stage.phone.x,
        y: stage.phone.y + move * 240,
        scale: base * (1.06 - move * 0.11),
        fx: 180,
        fy: 300 + move * 170,
      }
    : {
        x: stage.phone.x,
        y: stage.phone.y,
        scale: base * (1.06 + move * 0.08),
        fx: 180,
        fy: 300 + move * 180,
      };
}

/** Un point de l'écran du téléphone, dans la scène. */
function toScene(rig: ReturnType<typeof useRig>, point: { x: number; y: number }) {
  return { x: rig.x + rig.scale * (point.x - rig.fx), y: rig.y + rig.scale * (point.y - rig.fy) };
}

/** Place des pastilles des amis, par format. */
function useSpots() {
  const stage = useStage();
  // 9:16 : peu de place au-dessus du téléphone, la réponse remplace le prénom.
  return stage.portrait
    ? { size: 112, y: 600, xs: [300, 540, 780], reply: 30, replyBelow: true, pointTop: 440 }
    : { size: 150, y: 668, xs: [225, 455, 685], reply: 32, replyBelow: false, pointTop: 823 };
}

const Phone: React.FC = () => {
  const time = useTime();
  const rig = useRig();
  const scroll = keyframes(time, [
    { at: T.scroll, value: 0 },
    { at: T.scroll + 22, value: SCROLL },
  ]);
  const sending = T.send.findIndex((at) => time >= at - 6 && time < at + 10);
  const highlight =
    sending < 0
      ? undefined
      : {
          index: sending + 1,
          amount: inOut(time, T.send[sending] - 6, T.send[sending], T.send[sending] + 4, T.send[sending] + 10),
        };
  return (
    <PhoneRig x={rig.x} y={rig.y} scale={rig.scale} fx={rig.fx} fy={rig.fy} clock={jeunesse.data.clockSearch}>
      <ConfirmationScreen
        appear={CONFIRMATION_APPEAR}
        scroll={scroll}
        tickets={bandTickets()}
        orderReference={jeunesse.data.orderReference}
        linkNote
        highlight={highlight}
      />
    </PhoneRig>
  );
};

const Texts: React.FC = () => {
  const stage = useStage();
  const scene = jeunesse.scenes.partage;
  const align = stage.portrait ? 'center' : 'left';
  return (
    <div
      style={
        stage.portrait
          ? {
              position: 'absolute',
              top: 220,
              left: 70,
              right: 70,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 22,
              textAlign: 'center',
            }
          : {
              position: 'absolute',
              left: 150,
              top: 236,
              width: 720,
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
            }
      }
    >
      <Eyebrow text={scene.eyebrow} start={4} align={align} />
      <KineticText
        text={scene.title}
        start={8}
        size={stage.titleSize}
        align={align}
        maxWidth={stage.portrait ? 940 : 720}
      />
    </div>
  );
};

/** Koffi, Sèna et Yann : chacun reçoit son lien, puis répond. */
const Friends: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const spots = useSpots();
  const scene = jeunesse.scenes.partage;
  return (
    <AbsoluteFill>
      {RECIPIENTS.map((id, index) => {
        const friend = jeunesse.friends[id];
        const enter = sp(time, T.avatars + index * 3, SPRINGS.pop);
        const arrival = T.send[index] + T.flight;
        const got = time >= arrival;
        const bump = got ? Math.sin(Math.min(1, (time - arrival) / 10) * Math.PI) : 0;
        const check = sp(time, arrival, SPRINGS.bouncy);
        const reply = sp(time, T.replies[index], SPRINGS.pop);
        const x = spots.xs[index];
        return (
          <div key={id}>
            <div
              style={{
                position: 'absolute',
                left: x - spots.size / 2,
                top: spots.y - spots.size / 2,
                width: spots.size,
                height: spots.size,
                opacity: Math.min(1, enter * 1.5),
                transform: `scale(${(0.5 + enter * 0.5) * (1 + bump * 0.12)})`,
              }}
            >
              <FriendAvatar friend={friend} size={spots.size} ring="rgba(255,255,255,0.14)" />
              {got ? (
                <span
                  style={{
                    position: 'absolute',
                    right: -4,
                    bottom: -4,
                    width: spots.size * 0.34,
                    height: spots.size * 0.34,
                    borderRadius: '50%',
                    background: 'var(--color-mint)',
                    color: 'var(--color-ink)',
                    display: 'grid',
                    placeItems: 'center',
                    border: '4px solid var(--color-ink)',
                    transform: `scale(${check})`,
                  }}
                >
                  <Check size={spots.size * 0.2} strokeWidth={3.4} />
                </span>
              ) : null}
            </div>
            <div
              style={{
                position: 'absolute',
                left: x - 120,
                width: 240,
                top: spots.y + spots.size / 2 + 14,
                textAlign: 'center',
                fontFamily: 'var(--font-sans)',
                fontWeight: 800,
                fontSize: stage.portrait ? 30 : 28,
                color: '#FFFFFF',
                opacity: Math.min(1, enter * 1.5) * (spots.replyBelow ? 1 - Math.min(1, reply * 2) : 1),
              }}
            >
              {friend.name}
            </div>
            {reply > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  left: x - 200,
                  width: 400,
                  top: spots.replyBelow
                    ? spots.y + spots.size / 2 + 10
                    : spots.y - spots.size / 2 - spots.reply * 1.98 - 14,
                  display: 'flex',
                  justifyContent: 'center',
                  transformOrigin: spots.replyBelow ? '50% 0%' : '50% 100%',
                  transform: `scale(${0.6 + reply * 0.4}) rotate(${(index - 1) * 3}deg)`,
                  opacity: Math.min(1, reply * 1.6),
                }}
              >
                <ChatBubble
                  line={{ from: id, text: scene.replies[index] }}
                  size={spots.reply}
                  avatar={false}
                  showName={false}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: stage.portrait ? 0 : 150,
          right: stage.portrait ? 0 : undefined,
          top: spots.pointTop,
          display: 'flex',
          justifyContent: stage.portrait ? 'center' : 'flex-start',
        }}
      >
        <Point
          icon={<Link2 size={26} />}
          text={scene.point}
          start={T.point}
          size={stage.portrait ? 28 : 30}
        />
      </div>
    </AbsoluteFill>
  );
};

/** Les liens des billets, du téléphone jusqu'à chaque ami. */
const Flights: React.FC = () => {
  const time = useTime();
  const rig = useRig();
  const spots = useSpots();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {RECIPIENTS.map((id, index) => {
        const start = T.send[index];
        const progress = ramp(time, start, start + T.flight, [0, 1], EASE_IN_OUT);
        if (time < start || progress >= 1) return null;
        const from = toScene(rig, { x: 250, y: ROW_Y(index + 1) });
        const to = { x: spots.xs[index], y: spots.y };
        const arc = Math.sin(progress * Math.PI) * -90;
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress + arc;
        const scale = 0.55 + Math.sin(progress * Math.PI) * 0.6 - progress * 0.25;
        return (
          <div
            key={id}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${(1 - progress) * -8}deg)`,
              opacity: Math.min(1, progress * 6) * (1 - ramp(progress, 0.85, 1)),
            }}
          >
            <TicketLink friend={jeunesse.friends[id]} size={30} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
