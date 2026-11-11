import React from 'react';
import { config } from '../config';
import { Sfx } from '../components/audio/Sfx';
import { InkBackground } from '../components/motion/Backgrounds';
import { Cursor, pressAt } from '../components/motion/Cursor';
import { BROWSER, BrowserFrame } from '../components/motion/Frames';
import { Eyebrow, KineticText } from '../components/motion/KineticText';
import { EASE_IN_OUT, keyframes, ramp, SPRINGS, sp } from '../lib/anim';
import { useTime } from '../lib/time';
import type { ConsoleLayout } from '../screens/pro/Console';
import { FinanceScreen } from '../screens/pro/FinanceScreen';
import { StatsScreen } from '../screens/pro/StatsScreen';
import { WizardScreen } from '../screens/pro/WizardScreen';
import { BeatStack, PhoneRig, Rig, Scene, TextColumn, useStage } from './common';

const ORGANIZER_DESIGN = 8.5;

const T = {
  /** Début de chaque étape de l'assistant (étape 1 à 8). */
  steps: [0, 10, 16, 22, 28, 40, 45, 50],
  publishClick: 62,
  dialog: 70,
  toStats: 86,
  statsStart: 94,
  toFinance: 170,
  financeStart: 178,
  withdrawClick: 234,
};

/** Cibles et défilements, par format (pixels de la maquette). */
const LAYOUT = {
  desktop: {
    publish: { x: 650, y: 494 },
    statsFocus: { x: 355, y: 372 },
    financeScroll: 560,
    withdraw: { x: 520, y: 556 },
  },
  mobile: {
    publish: { x: 180, y: 521 },
    statsFocus: { x: 180, y: 420 },
    financeScroll: 820,
    withdraw: { x: 180, y: 567 },
  },
} as const;

/**
 * 6 · L'espace organisateur : l'assistant en huit étapes jusqu'à la
 * publication, les statistiques qui se remplissent, puis le solde et la
 * demande de retrait. Fenêtre de navigateur en 16:9, téléphone en 9:16.
 */
export const S6Organizer: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={ORGANIZER_DESIGN} durationInFrames={durationInFrames}>
    <InkBackground>
      <Device />
      <Texts />
    </InkBackground>
    <Sounds />
  </Scene>
);

/** Effets sonores : étapes de l'assistant, publication, écrans, solde, retrait. */
const Sounds: React.FC = () => (
  <>
    <Sfx at={0} sound="whoosh" volume={0.7} />
    {T.steps.slice(1).map((at) => (
      <Sfx key={at} at={at} sound="tick" volume={0.35} />
    ))}
    <Sfx at={T.publishClick} sound="tap" />
    <Sfx at={T.dialog + 1} sound="ding" volume={0.6} />
    <Sfx at={T.toStats} sound="swish" volume={0.35} />
    <Sfx at={T.toFinance} sound="swish" volume={0.35} />
    {/* Le solde finit de compter (34 images, voir FinanceScreen) */}
    <Sfx at={T.financeStart + 30} sound="coins" volume={0.5} />
    <Sfx at={T.withdrawClick} sound="tap" />
  </>
);

const Texts: React.FC = () => {
  const stage = useStage();
  const scene = config.scenes.organizer;
  const align = stage.portrait ? 'center' : 'left';
  const size = stage.portrait ? stage.titleSize : stage.titleSize * 0.92;
  const width = stage.portrait ? 940 : 540;
  return (
    <TextColumn width={560}>
      <Eyebrow text={scene.eyebrow} start={2} align={align} />
      <BeatStack align={align}>
        <KineticText
          text={scene.beats[0]}
          start={6}
          exit={82}
          size={size}
          align={align}
          maxWidth={width}
        />
        <KineticText
          text={scene.beats[1]}
          start={90}
          exit={164}
          size={size}
          align={align}
          maxWidth={width}
        />
        <KineticText text={scene.beats[2]} start={172} size={size} align={align} maxWidth={width} />
      </BeatStack>
    </TextColumn>
  );
};

function useScreens(layout: ConsoleLayout) {
  const time = useTime();
  const target = LAYOUT[layout];
  const step = T.steps.filter((start) => time >= start).length;
  const statsScroll =
    layout === 'mobile'
      ? keyframes(time, [
          { at: 128, value: 0 },
          { at: 150, value: 330 },
        ])
      : 0;
  const financeScroll = keyframes(time, [
    { at: 202, value: 0 },
    { at: 226, value: target.financeScroll },
  ]);

  const stats = ramp(time, T.toStats, T.toStats + 8, [0, 1], EASE_IN_OUT);
  const finance = ramp(time, T.toFinance, T.toFinance + 8, [0, 1], EASE_IN_OUT);

  const screens = (
    <>
      {stats < 1 ? (
        <div className="absolute inset-0" style={{ opacity: 1 - stats }}>
          <WizardScreen
            layout={layout}
            step={step}
            scroll={
              layout === 'mobile'
                ? keyframes(time, [
                    { at: 46, value: 0 },
                    { at: 56, value: 140 },
                  ])
                : 0
            }
            publishPress={pressAt(time, T.publishClick)}
            publishing={time >= T.publishClick + 2}
            dialog={sp(time, T.dialog, SPRINGS.snappy)}
          />
        </div>
      ) : null}
      {stats > 0 && finance < 1 ? (
        <div className="absolute inset-0" style={{ opacity: stats * (1 - finance) }}>
          <StatsScreen layout={layout} start={T.statsStart} scroll={statsScroll} />
        </div>
      ) : null}
      {finance > 0 ? (
        <div className="absolute inset-0" style={{ opacity: finance }}>
          <FinanceScreen
            layout={layout}
            start={T.financeStart}
            scroll={financeScroll}
            payPress={pressAt(time, T.withdrawClick)}
            paying={time >= T.withdrawClick + 2}
          />
        </div>
      ) : null}
    </>
  );

  const cursors = (
    <>
      <Cursor
        variant={layout === 'desktop' ? 'pointer' : 'touch'}
        appear={44}
        disappear={78}
        clicks={[T.publishClick]}
        path={[
          { at: 44, value: { x: target.publish.x + 140, y: target.publish.y + 150 } },
          { at: 60, value: target.publish },
          { at: 78, value: { x: target.publish.x + 90, y: target.publish.y + 110 } },
        ]}
      />
      <Cursor
        variant={layout === 'desktop' ? 'pointer' : 'touch'}
        appear={214}
        disappear={252}
        clicks={[T.withdrawClick]}
        path={[
          { at: 214, value: { x: target.withdraw.x + 160, y: target.withdraw.y + 120 } },
          { at: 232, value: target.withdraw },
          { at: 252, value: { x: target.withdraw.x + 60, y: target.withdraw.y + 60 } },
        ]}
      />
    </>
  );

  return { screens, cursors };
}

const Device: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const layout: ConsoleLayout = stage.portrait ? 'mobile' : 'desktop';
  const { screens, cursors } = useScreens(layout);
  const enter = sp(time, 0, SPRINGS.smooth);

  // Zoom sur les compteurs des statistiques.
  const zoom = keyframes(time, [
    { at: T.statsStart, value: 0 },
    { at: T.statsStart + 16, value: 1 },
    { at: 140, value: 1 },
    { at: 156, value: 0 },
  ]);
  const focus = LAYOUT[layout].statsFocus;

  if (stage.portrait) {
    return (
      <PhoneRig
        x={stage.phone.x}
        y={stage.phone.y + zoom * 160}
        scale={stage.phone.scale * (1 + zoom * 0.18)}
        fx={180 + zoom * (focus.x - 180)}
        fy={380 + zoom * (focus.y - 380)}
        offsetY={(1 - enter) * 1100}
      >
        {screens}
        {cursors}
      </PhoneRig>
    );
  }

  const width = BROWSER.width;
  const height = BROWSER.height + BROWSER.bar;
  const scale = 1.1 * (1 + zoom * 0.35);
  const centerX = 1300;

  return (
    <Rig
      width={width}
      height={height}
      scale={scale}
      fx={width / 2 + zoom * (focus.x - width / 2)}
      fy={height / 2 + zoom * (focus.y + BROWSER.bar - height / 2)}
      x={centerX}
      y={540}
      offsetX={(1 - enter) * 700}
      opacity={Math.min(1, enter * 1.4)}
    >
      <BrowserFrame path={pathFor(time)}>
        {screens}
        {cursors}
      </BrowserFrame>
    </Rig>
  );
};

function pathFor(time: number): string {
  if (time >= T.toFinance) return '/pro/finances';
  if (time >= T.toStats) return '/pro/evenements/lagune-live/statistiques';
  return '/pro/evenements/lagune-live';
}
