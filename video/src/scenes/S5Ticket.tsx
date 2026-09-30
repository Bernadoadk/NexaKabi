import React from 'react';
import { AbsoluteFill } from 'remotion';
import { config } from '../config';
import { InkBackground, PaperBackground } from '../components/motion/Backgrounds';
import { Eyebrow, KineticText } from '../components/motion/KineticText';
import { Button } from '../components/ui/Button';
import { DigitalTicket } from '../components/ui/Ticket';
import { EASE_IN_OUT, inOut, ramp, SPRINGS, sp } from '../lib/anim';
import { formatEventRange, formatTimeSpaced, heroEvent, parseDate } from '../lib/format';
import { useTime } from '../lib/time';
import { ScannerScreen } from '../screens/ScannerScreen';
import { PhoneRig, Rig, Scene, TextColumn, useStage } from './common';

const TICKET_DESIGN = 6;

const T = {
  reveal: 84,
  held: 96,
  read: 124,
};

/** Taille du billet dessiné (pixels CSS) : largeur d'un écran de téléphone. */
const TICKET = { width: 360, height: 760, qrY: 271 };

/**
 * 5 · Le billet et l'entrée.
 * Sur fond papier, le billet perforé pivote en 3D. Un cercle s'ouvre depuis
 * son QR code sur le scanner du contrôleur : lecture, écran menthe
 * « Entrée autorisée », hors ligne.
 */
export const S5Ticket: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const stage = useStage();
  const ticket = ticketPlacement(stage.portrait);

  return (
    <Scene design={TICKET_DESIGN} durationInFrames={durationInFrames}>
      <PaperBackground>
        <FloatingTicket />
        <TextsA />
      </PaperBackground>
      <Reveal cx={ticket.x} cy={ticket.y - (TICKET.height / 2 - TICKET.qrY) * ticket.scale}>
        <InkBackground>
          <ScannerPhone />
          <TextsB />
        </InkBackground>
      </Reveal>
    </Scene>
  );
};

function ticketPlacement(portrait: boolean) {
  return portrait ? { x: 540, y: 1255, scale: 1.58 } : { x: 1330, y: 540, scale: 1.13 };
}

const Reveal: React.FC<{ cx: number; cy: number; children: React.ReactNode }> = ({
  cx,
  cy,
  children,
}) => {
  const time = useTime();
  const radius = ramp(time, T.reveal, T.reveal + 16, [0, 2600], EASE_IN_OUT);
  if (radius <= 0) return null;
  return (
    <AbsoluteFill style={{ clipPath: `circle(${radius}px at ${cx}px ${cy}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

const TextsA: React.FC = () => {
  const stage = useStage();
  const scene = config.scenes.ticket;
  const align = stage.portrait ? 'center' : 'left';
  return (
    <TextColumn scrim={false}>
      <Eyebrow text={scene.eyebrow} start={2} align={align} />
      <KineticText
        text={scene.beats[0]}
        start={6}
        size={stage.titleSize * 1.05}
        color="var(--color-ink)"
        align={align}
        maxWidth={stage.portrait ? 940 : 640}
      />
    </TextColumn>
  );
};

const TextsB: React.FC = () => {
  const stage = useStage();
  const scene = config.scenes.ticket;
  const align = stage.portrait ? 'center' : 'left';
  return (
    <TextColumn>
      <Eyebrow text={scene.eyebrow} start={T.reveal} align={align} />
      <KineticText
        text={scene.beats[1]}
        start={T.reveal + 12}
        size={stage.titleSize}
        align={align}
        maxWidth={stage.portrait ? 940 : 700}
      />
    </TextColumn>
  );
};

const FloatingTicket: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const place = ticketPlacement(stage.portrait);
  const event = heroEvent();

  const enter = sp(time, 4, SPRINGS.smooth);
  const float = Math.sin(time / 22) * 7;
  const sheen = ramp(time, 26, 52, [-60, 160], EASE_IN_OUT);
  const pulse = inOut(time, 44, 52, 70, 80);

  return (
    <Rig
      width={TICKET.width}
      height={TICKET.height}
      scale={place.scale}
      x={place.x}
      y={place.y}
      offsetY={float}
    >
      <div style={{ perspective: 1800 }}>
        <div
          style={{
            transform: `translateY(${(1 - enter) * 160}px) rotateY(${(1 - enter) * -72}deg) rotateX(${(1 - enter) * 14}deg)`,
            opacity: Math.min(1, enter * 1.5),
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <DigitalTicket
            eventTitle={event.title}
            when={formatEventRange(parseDate(event.start), parseDate(event.end))}
            venue={`${event.venue} · ${event.city}`}
            attendeeName={config.data.buyer.name}
            ticketTypeName={config.data.tickets[0].name}
            reference={`${config.data.orderReference}-01`}
            qrText={`https://${config.brand.url}`}
            notes={
              <p className="m-0">
                Ouverture des portes à {formatTimeSpaced(parseDate(config.data.doorsOpen))}
              </p>
            }
            style={{ filter: 'drop-shadow(0 30px 40px rgba(18, 16, 43, 0.35))' }}
            overlay={
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `linear-gradient(105deg, transparent ${sheen - 12}%, rgba(255,255,255,0.28) ${sheen}%, transparent ${sheen + 12}%)`,
                  mixBlendMode: 'screen',
                }}
              />
            }
          />
          <Button
            variant="primary"
            size="primary"
            block
            style={{
              transform: `scale(${1 + pulse * 0.035})`,
              boxShadow: `0 0 0 ${pulse * 8}px rgba(255, 77, 46, ${0.22 * pulse})`,
            }}
          >
            Envoyer sur WhatsApp
          </Button>
          <Button variant="secondary" size="primary" block>
            Télécharger le PDF
          </Button>
        </div>
      </div>
    </Rig>
  );
};

const ScannerPhone: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const enter = sp(time, T.reveal + 2, SPRINGS.smooth);
  const held = sp(time, T.held, SPRINGS.smooth);
  const flash = time < T.read ? 0 : ramp(time, T.read, T.read + 8, [1, 0]);
  const verdict = ramp(time, T.read + 1, T.read + 13, [0, 1], EASE_IN_OUT);
  const shake = time > T.read && time < T.read + 10 ? Math.sin(time * 3.1) * 6 : 0;
  const ring = inOut(time, T.held + 4, T.held + 10, T.read - 6, T.read);
  const read = time >= T.read;

  return (
    <PhoneRig
      x={stage.phone.x}
      y={stage.phone.y}
      scale={stage.phone.scale * (0.9 + enter * 0.1)}
      offsetX={shake}
      offsetY={(1 - enter) * 80}
      statusBar="light"
    >
      <ScannerScreen
        held={held}
        flash={flash}
        verdict={verdict}
        entries={config.data.scanner.entriesBefore + (read ? 1 : 0)}
        pending={read ? 1 : 0}
      />
      {ring > 0 ? (
        <div
          className="absolute rounded-[10px] border-[3px] border-coral"
          style={{
            left: 146,
            top: 46,
            width: 202,
            height: 42,
            opacity: ring,
            transform: `scale(${1 + (1 - ring) * 0.2})`,
          }}
        />
      ) : null}
    </PhoneRig>
  );
};
