import React from 'react';
import { AbsoluteFill, Html5Audio, interpolate, staticFile, useVideoConfig } from 'remotion';
import { linearTiming, TransitionSeries, type TransitionPresentation } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { iris } from '@remotion/transitions/iris';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { config } from './config';
import './fonts';
import { CLAMP } from './lib/anim';
import { colorVariables } from './theme';
import { S1Hook } from './scenes/S1Hook';
import { S2Brand } from './scenes/S2Brand';
import { S3Discover } from './scenes/S3Discover';
import { S4Checkout } from './scenes/S4Checkout';
import { S5Ticket } from './scenes/S5Ticket';
import { S6Organizer } from './scenes/S6Organizer';
import { S7Benefits } from './scenes/S7Benefits';
import { S8Cta } from './scenes/S8Cta';

type SceneComponent = React.FC<{ durationInFrames: number }>;

/** L'ordre des scènes. Leurs durées viennent de `config.scenes`. */
const SCENES: Array<{ key: keyof typeof config.scenes; component: SceneComponent }> = [
  { key: 'hook', component: S1Hook },
  { key: 'brand', component: S2Brand },
  { key: 'discover', component: S3Discover },
  { key: 'checkout', component: S4Checkout },
  { key: 'ticket', component: S5Ticket },
  { key: 'organizer', component: S6Organizer },
  { key: 'benefits', component: S7Benefits },
  { key: 'cta', component: S8Cta },
];

/**
 * Passage d'une scène à la suivante (une entrée de moins que de scènes).
 * `cut` : coupe franche, sans chevauchement — entre « Découvrir » et
 * « Réserver », le téléphone reste en place et la page de l'événement
 * s'ouvre comme dans l'application, après le toucher sur la fiche.
 */
type Boundary = 'fade' | 'slide-up' | 'slide-left' | 'iris' | 'wipe' | 'cut';
const BOUNDARIES: Boundary[] = ['fade', 'slide-up', 'cut', 'iris', 'slide-left', 'wipe', 'fade'];

const frames = (seconds: number) => Math.round(seconds * config.fps);

export const sceneFrames = () => SCENES.map((scene) => frames(config.scenes[scene.key].seconds));
export const transitionFrames = () => frames(config.transitionSeconds);

/** Durée totale : somme des scènes moins les chevauchements des transitions. */
export function totalFrames(): number {
  const scenes = sceneFrames().reduce((total, value) => total + value, 0);
  const overlaps = BOUNDARIES.filter((boundary) => boundary !== 'cut').length;
  return scenes - transitionFrames() * overlaps;
}

function presentation(boundary: Boundary, width: number, height: number) {
  switch (boundary) {
    case 'slide-up':
      return slide({ direction: 'from-bottom' });
    case 'slide-left':
      return slide({ direction: 'from-right' });
    case 'iris':
      return iris({ width, height });
    case 'wipe':
      return wipe({ direction: 'from-left' });
    default:
      return fade();
  }
}

export interface VideoProps extends Record<string, unknown> {
  hasMusic: boolean;
}

export const Video: React.FC<VideoProps> = ({ hasMusic }) => {
  const { width, height } = useVideoConfig();
  const durations = sceneFrames();
  const transition = transitionFrames();
  const total = totalFrames();

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
          presentation={
            presentation(boundary, width, height) as TransitionPresentation<Record<string, unknown>>
          }
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

      {hasMusic ? (
        <Html5Audio
          src={staticFile(config.music.file)}
          volume={(frame) => {
            const fadeIn = interpolate(
              frame,
              [0, frames(config.music.fadeInSeconds)],
              [0, 1],
              CLAMP,
            );
            const fadeOut = interpolate(
              frame,
              [total - frames(config.music.fadeOutSeconds), total],
              [1, 0],
              CLAMP,
            );
            return config.music.volume * Math.min(fadeIn, fadeOut);
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
