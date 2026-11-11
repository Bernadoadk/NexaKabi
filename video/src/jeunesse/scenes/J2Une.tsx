import React from 'react';
import { Sfx } from '../../components/audio/Sfx';
import { InkBackground } from '../../components/motion/Backgrounds';
import { Cursor, pressAt } from '../../components/motion/Cursor';
import { Eyebrow, KineticText } from '../../components/motion/KineticText';
import { BrandMark, Wordmark } from '../../components/ui/Basics';
import { EASE_IN_OUT, inOut, keyframes, ramp, SPRINGS, sp } from '../../lib/anim';
import { useTime } from '../../lib/time';
import { EventScreen } from '../../screens/EventScreen';
import { PhoneRig, Scene, ScreenSwap, TextColumn, useStage } from '../../scenes/common';
import { jeunesse } from '../config';
import { DiscoverUneScreen, SLIDE } from '../screens/DiscoverUneScreen';

/** Repères (images, temps de la scène). La scène s'ouvre sur la reprise de la musique. */
const T = {
  splashOut: 16,
  /** La première diapositive défile seule… */
  slideStart: 24,
  /** …puis la une passe à la suivante : le festival, sponsorisé. */
  slideChange: 64,
  zoomIn: 82,
  ctaClick: 115,
  toEvent: 119,
  zoomOut: 118,
};

/** Cibles, en pixels de l'écran du téléphone (page défilée de `SCROLL`). */
const SCROLL = 56;
const SLIDE_TOP = 311 - SCROLL;
const TARGET = {
  slide: { x: 16 + SLIDE.width / 2, y: SLIDE_TOP + SLIDE.height / 2 },
  /** « Prendre mon billet » (le prix passe à la ligne dessous). */
  cta: { x: 96, y: 545 },
};

/**
 * 2 · Nexa Kabi s'ouvre (logo, onde de choc sur la reprise), Découvrir et
 * la une : une diapositive défile, puis le festival, marqué « Sponsorisé ».
 * Aïcha touche « Prendre mon billet » : la page de l'événement s'ouvre.
 */
export const J2Une: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.une.seconds} durationInFrames={durationInFrames}>
    <InkBackground>
      <Shockwave />
      <Phone />
      <Texts />
    </InkBackground>
    <Sfx at={0} sound="impact" volume={0.85} />
    <Sfx at={0} sound="whoosh" volume={0.45} />
    <Sfx at={T.slideChange} sound="swish" volume={0.3} />
    <Sfx at={T.zoomIn} sound="swish" volume={0.2} />
    <Sfx at={T.ctaClick} sound="tap" />
    <Sfx at={T.toEvent} sound="swish" volume={0.35} />
  </Scene>
);

const Texts: React.FC = () => {
  const stage = useStage();
  const scene = jeunesse.scenes.une;
  const align = stage.portrait ? 'center' : 'left';
  return (
    <TextColumn>
      <Eyebrow text={scene.eyebrow} start={4} align={align} />
      <KineticText
        text={scene.title}
        start={8}
        size={stage.titleSize}
        align={align}
        maxWidth={stage.portrait ? 940 : 700}
      />
    </TextColumn>
  );
};

/** Onde corail qui part du téléphone à l'ouverture de l'application. */
const Shockwave: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const wave = ramp(time, 0, 24);
  if (wave >= 1) return null;
  const radius = 1500 * wave;
  return (
    <div
      style={{
        position: 'absolute',
        left: stage.phone.x - radius,
        top: stage.phone.y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: '50%',
        border: `${Math.max(0, 60 * (1 - wave))}px solid var(--color-coral)`,
        opacity: 1 - wave,
      }}
    />
  );
};

const Phone: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const enter = sp(time, 0, SPRINGS.pop);

  // La une : progression de la diapositive, glissement vers la suivante.
  const position = keyframes(time, [
    { at: T.slideChange, value: 0 },
    { at: T.slideChange + 14, value: 1 },
  ]);
  const active = time < T.slideChange + 7 ? 0 : 1;
  const progress =
    active === 0
      ? ramp(time, T.slideStart, T.slideChange, [0, 1], (x) => x)
      : ramp(time, T.slideChange + 10, T.slideChange + 150, [0, 1], (x) => x);
  // « Découvrir » s'affiche d'abord, puis la page remonte jusqu'aux barres de la une.
  const scroll = keyframes(time, [
    { at: 44, value: 0 },
    { at: 64, value: SCROLL },
  ]);

  // Caméra : on se rapproche de la diapositive, puis on recule sur la page.
  const zoom = keyframes(time, [
    { at: T.zoomIn, value: 0 },
    { at: T.zoomIn + 14, value: 1 },
    { at: T.zoomOut, value: 1 },
    { at: T.zoomOut + 14, value: 0 },
  ]);
  const boost = stage.portrait ? 0.16 : 0.42;
  const sponsoredPulse = inOut(time, T.zoomIn + 10, T.zoomIn + 16, T.zoomIn + 30, T.zoomIn + 40);

  // Écran de lancement : le logo, puis Découvrir.
  const splash = 1 - ramp(time, T.splashOut, T.splashOut + 10, [0, 1], EASE_IN_OUT);
  const mark = sp(time, 1, SPRINGS.pop);

  return (
    <PhoneRig
      x={stage.phone.x}
      y={stage.phone.y + (stage.portrait ? zoom * 120 : 0)}
      scale={stage.phone.scale * (0.82 + 0.18 * enter) * (1 + zoom * boost)}
      fx={180 + zoom * (TARGET.slide.x - 180)}
      fy={380 + zoom * (TARGET.slide.y - 380)}
      offsetY={(1 - enter) * 160}
      rotate={(1 - enter) * -4}
      clock={jeunesse.data.clockSearch}
      statusBar={splash > 0.5 ? 'light' : 'dark'}
    >
      <ScreenSwap
        at={T.toEvent}
        from={
          <DiscoverUneScreen
            position={position}
            active={active}
            progress={progress}
            scroll={scroll}
            ctaPress={pressAt(time, T.ctaClick)}
          />
        }
        to={<EventScreen />}
      />

      {/* La mention « Sponsorisé » de la diapositive, soulignée pendant le zoom. */}
      {sponsoredPulse > 0 && time < T.toEvent ? (
        <div
          className="absolute rounded-[9px] border-2 border-coral"
          style={{
            left: 16 + 10,
            top: SLIDE_TOP + 10,
            width: 92,
            height: 34,
            opacity: sponsoredPulse,
            transform: `scale(${1 + (1 - sponsoredPulse) * 0.25})`,
          }}
        />
      ) : null}

      {splash > 0 ? (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink text-white"
          style={{ opacity: splash }}
        >
          <BrandMark
            size={104}
            style={{ transform: `scale(${0.3 + 0.7 * mark})`, opacity: Math.min(1, mark * 2) }}
          />
          <Wordmark className="text-[30px]" />
        </div>
      ) : null}

      <Cursor
        appear={96}
        disappear={128}
        clicks={[T.ctaClick]}
        path={[
          { at: 96, value: { x: 250, y: 600 } },
          { at: 112, value: TARGET.cta },
          { at: 128, value: { x: 200, y: 560 } },
        ]}
      />
    </PhoneRig>
  );
};
