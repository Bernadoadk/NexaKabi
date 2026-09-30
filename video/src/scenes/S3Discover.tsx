import React from 'react';
import { MapPin, SlidersHorizontal } from 'lucide-react';
import { config } from '../config';
import { InkBackground } from '../components/motion/Backgrounds';
import { Cursor, pressAt } from '../components/motion/Cursor';
import { Eyebrow, KineticText } from '../components/motion/KineticText';
import { keyframes, ramp, SPRINGS, sp } from '../lib/anim';
import { heroEvent } from '../lib/format';
import { useTime } from '../lib/time';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen, pinPosition } from '../screens/MapScreen';
import { PhoneRig, Point, Scene, ScreenSwap, TextColumn, useStage } from './common';

const DISCOVER_DESIGN = 7;

/** Repères (images, temps de la scène). */
const T = {
  chipClick: 38,
  toDiscover: 42,
  cardsAppear: 48,
  zoomIn: 96,
  zoomOut: 124,
  mapClick: 142,
  toMap: 146,
  pinsDrop: 152,
  pinClick: 178,
  cardOpen: 180,
  /** Toucher « Voir l'événement » : coupe franche vers la page de l'événement. */
  openEvent: 198,
  textsOut: 194,
};

/** Cibles du curseur, en pixels de l'écran du téléphone. */
const TARGET = {
  weekendChip: { x: 141, y: 339 },
  mapButton: { x: 204, y: 192 },
  badge: { x: 238, y: 318 },
  openEvent: { x: 225, y: 631 },
};

/**
 * 3 · Découvrir : accueil → filtre « Ce week-end » → résultats en cascade →
 * carte des événements, épingles qui tombent, fiche du festival, puis
 * « Voir l'événement » : la scène suivante s'ouvre sur sa page, sans fondu.
 */
export const S3Discover: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={DISCOVER_DESIGN} durationInFrames={durationInFrames}>
    <InkBackground>
      <Phone />
      <Texts />
    </InkBackground>
  </Scene>
);

const Texts: React.FC = () => {
  const stage = useStage();
  const scene = config.scenes.discover;
  return (
    <TextColumn>
      <Eyebrow
        text={scene.eyebrow}
        start={2}
        exit={T.textsOut}
        align={stage.portrait ? 'center' : 'left'}
      />
      <KineticText
        text={scene.title}
        start={6}
        exit={T.textsOut}
        size={stage.titleSize}
        align={stage.portrait ? 'center' : 'left'}
        maxWidth={stage.portrait ? 940 : 700}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: stage.portrait ? 'row' : 'column',
          gap: stage.portrait ? 28 : 18,
          marginTop: stage.portrait ? 0 : 12,
        }}
      >
        <Point
          icon={<SlidersHorizontal size={26} />}
          text={scene.points[0]}
          start={58}
          exit={T.textsOut}
          size={stage.portrait ? 26 : 30}
        />
        <Point
          icon={<MapPin size={26} />}
          text={scene.points[1]}
          start={150}
          exit={T.textsOut}
          size={stage.portrait ? 26 : 30}
        />
      </div>
    </TextColumn>
  );
};

const Phone: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const base = stage.phone.scale;
  const enter = sp(time, 0, SPRINGS.smooth);

  const zoom = keyframes(time, [
    { at: T.zoomIn, value: 0 },
    { at: T.zoomIn + 14, value: 1 },
    { at: T.zoomOut, value: 1 },
    { at: T.zoomOut + 14, value: 0 },
  ]);
  const zoomScale = stage.portrait ? 1.25 : 1.55;

  const scroll = keyframes(time, [
    { at: 70, value: 0 },
    { at: 90, value: 100 },
  ]);
  const highlight =
    ramp(time, T.zoomIn + 8, T.zoomIn + 16) * (1 - ramp(time, T.zoomOut, T.zoomOut + 8));

  const pin = pinPosition(heroEvent());

  return (
    <PhoneRig
      x={stage.phone.x}
      y={stage.phone.y + (stage.portrait ? zoom * 70 : 0)}
      scale={base * (1 + zoom * (zoomScale - 1))}
      fx={180 + zoom * (TARGET.badge.x - 180)}
      fy={380 + zoom * (TARGET.badge.y - 380)}
      offsetY={(1 - enter) * (stage.portrait ? 1100 : 900)}
      rotate={(1 - enter) * 6}
    >
      <ScreenSwap
        at={T.toDiscover}
        from={<HomeScreen pressedChip={pressAt(time, T.chipClick)} />}
        to={
          <ScreenSwap
            at={T.toMap}
            from={
              <DiscoverScreen
                appear={T.cardsAppear}
                scroll={scroll}
                highlight={highlight}
                mapPress={pressAt(time, T.mapClick)}
              />
            }
            to={
              <MapScreen
                dropStart={T.pinsDrop}
                selectedId={config.data.heroEventId}
                openAt={T.cardOpen}
              />
            }
          />
        }
      />

      <Cursor
        appear={20}
        disappear={50}
        clicks={[T.chipClick]}
        path={[
          { at: 20, value: { x: 262, y: 560 } },
          { at: 36, value: TARGET.weekendChip },
          { at: 50, value: { x: 230, y: 470 } },
        ]}
      />
      <Cursor
        appear={124}
        disappear={152}
        clicks={[T.mapClick]}
        path={[
          { at: 124, value: { x: 280, y: 520 } },
          { at: 140, value: TARGET.mapButton },
          { at: 152, value: { x: 250, y: 330 } },
        ]}
      />
      <Cursor
        appear={162}
        disappear={206}
        clicks={[T.pinClick, T.openEvent]}
        path={[
          { at: 162, value: { x: 290, y: 620 } },
          { at: 176, value: { x: pin.x, y: pin.y - 30 } },
          { at: 184, value: { x: pin.x + 40, y: pin.y - 40 } },
          { at: 196, value: TARGET.openEvent },
        ]}
      />
    </PhoneRig>
  );
};
