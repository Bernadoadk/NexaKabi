import React from 'react';
import { AbsoluteFill, getStaticFiles, type CalculateMetadataFunction } from 'remotion';
import { linearTiming, TransitionSeries, type TransitionPresentation } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Soundtrack } from '../components/audio/Soundtrack';
import { findVoices } from '../components/audio/voices';
import { config } from '../config';
import '../fonts';
import { S8Cta } from '../scenes/S8Cta';
import { colorVariables } from '../theme';
import type { VideoProps } from '../Video';
import { jeunesse } from './config';
import { J1Question } from './scenes/J1Question';
import { J2Une } from './scenes/J2Une';
import { J3Achat } from './scenes/J3Achat';
import { J4Partage } from './scenes/J4Partage';
import { J5Tenue } from './scenes/J5Tenue';
import { J6Entree } from './scenes/J6Entree';
import { J7Ambiance } from './scenes/J7Ambiance';

type SceneComponent = React.FC<{ durationInFrames: number }>;

const Cta: SceneComponent = ({ durationInFrames }) => (
  <S8Cta durationInFrames={durationInFrames} texts={jeunesse.scenes.cta} />
);

/** L'ordre des scènes. Leurs durées viennent de `jeunesse.scenes`. */
const SCENES: Array<{ key: keyof typeof jeunesse.scenes; component: SceneComponent }> = [
  { key: 'question', component: J1Question },
  { key: 'une', component: J2Une },
  { key: 'achat', component: J3Achat },
  { key: 'partage', component: J4Partage },
  { key: 'tenue', component: J5Tenue },
  { key: 'entree', component: J6Entree },
  { key: 'ambiance', component: J7Ambiance },
  { key: 'cta', component: Cta },
];

/**
 * Passage d'une scène à la suivante. Coupes franches (`cut`) sur les temps
 * forts de la musique et tant que le téléphone d'Aïcha reste à l'écran
 * (de l'ouverture de l'application à la confirmation) ; volet corail vers
 * l'intermède, glissé vers l'entrée, fondu vers l'appel à l'action.
 */
type Boundary = 'fade' | 'slide-left' | 'wipe' | 'cut';
const BOUNDARIES: Boundary[] = ['cut', 'cut', 'cut', 'wipe', 'slide-left', 'cut', 'fade'];

const frames = (seconds: number) => Math.round(seconds * config.fps);

export const sceneFrames = () => SCENES.map((scene) => frames(jeunesse.scenes[scene.key].seconds));
export const transitionFrames = () => frames(jeunesse.transitionSeconds);

/** Durée totale : somme des scènes moins les chevauchements des transitions. */
export function totalFrames(): number {
  const scenes = sceneFrames().reduce((total, value) => total + value, 0);
  const overlaps = BOUNDARIES.filter((boundary) => boundary !== 'cut').length;
  return scenes - transitionFrames() * overlaps;
}

function presentation(boundary: Boundary) {
  switch (boundary) {
    case 'slide-left':
      return slide({ direction: 'from-right' });
    case 'wipe':
      return wipe({ direction: 'from-left' });
    default:
      return fade();
  }
}

/** Musique et voix off de cette vidéo, trouvées dans `public/`. */
export const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  const durationInFrames = totalFrames();
  const seconds = durationInFrames / config.fps;
  if (seconds < 30 || seconds > 45) {
    console.warn(
      `Vidéo « Jeunesse » : ${seconds.toFixed(1)} s (cible : 30 à 45 s). Voir src/jeunesse/config.ts.`,
    );
  }
  const files = getStaticFiles().map((file) => file.name.replace(/\\/g, '/'));
  const music = files.includes(jeunesse.music.file) ? jeunesse.music.file : null;
  const voices = await findVoices(files, seconds, {
    lines: jeunesse.voiceover.lines,
    normalize: jeunesse.voiceover.normalize,
    configFile: 'src/jeunesse/config.ts',
  });
  return { props: { ...props, music, voices }, durationInFrames };
};

export const JeunesseVideo: React.FC<VideoProps> = ({ music, voices }) => {
  const durations = sceneFrames();
  const transition = transitionFrames();

  const children: React.ReactNode[] = [];
  SCENES.forEach((scene, index) => {
    const Component = scene.component;
    children.push(
      <TransitionSeries.Sequence key={scene.key} durationInFrames={durations[index]}>
        <Component durationInFrames={durations[index]} />
      </TransitionSeries.Sequence>,
    );
    const boundary = BOUNDARIES[index];
    if (boundary && boundary !== 'cut') {
      children.push(
        <TransitionSeries.Transition
          key={`${scene.key}-transition`}
          presentation={presentation(boundary) as TransitionPresentation<Record<string, unknown>>}
          timing={linearTiming({ durationInFrames: transition })}
        />,
      );
    }
  });

  return (
    <AbsoluteFill
      style={{
        ...colorVariables(),
        background: 'var(--color-ink-900)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <TransitionSeries>{children}</TransitionSeries>

      <Soundtrack
        music={music}
        voices={voices}
        settings={jeunesse.music}
        voiceVolume={jeunesse.voiceover.volume}
      />
    </AbsoluteFill>
  );
};
