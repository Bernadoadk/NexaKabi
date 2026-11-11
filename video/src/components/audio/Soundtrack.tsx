import React from 'react';
import { Html5Audio, interpolate, Sequence, staticFile, useVideoConfig } from 'remotion';
import { config } from '../../config';
import type { VideoConfig } from '../../config.types';
import { CLAMP } from '../../lib/anim';
import type { VoiceClip } from './voices';

/** La musique commence à baisser un peu avant la voix… */
const DUCK_ATTACK = 6;
/** …et remonte vite après, pour retrouver l'élan entre deux phrases. */
const DUCK_RELEASE = 8;

/**
 * Musique de fond et voix off. Pendant chaque phrase, la musique descend de
 * `music.volume` à `music.duckedVolume` pour laisser la voix passer devant ;
 * chaque phrase est jouée avec son gain d'égalisation (voir `voices.ts`).
 *
 * `settings` et `voiceVolume` : réglages d'une autre vidéo du projet (par
 * défaut, ceux de `config.ts`).
 */
export const Soundtrack: React.FC<{
  music: string | null;
  voices: VoiceClip[];
  settings?: VideoConfig['music'];
  voiceVolume?: number;
}> = ({ music, voices, settings = config.music, voiceVolume = config.voiceover.volume }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const fadeIn = Math.max(1, Math.round(settings.fadeInSeconds * fps));
  const fadeOut = Math.max(1, Math.round(settings.fadeOutSeconds * fps));

  /** 0 : musique pleine, 1 : musique sous la voix. */
  const ducking = (frame: number) =>
    voices.reduce((deepest, clip) => {
      const end = clip.from + clip.durationInFrames;
      const depth = interpolate(
        frame,
        [clip.from - DUCK_ATTACK, clip.from, end, end + DUCK_RELEASE],
        [0, 1, 1, 0],
        CLAMP,
      );
      return Math.max(deepest, depth);
    }, 0);

  return (
    <>
      {music ? (
        <Html5Audio
          src={staticFile(music)}
          trimBefore={Math.round(settings.startAt * fps)}
          playbackRate={settings.playbackRate}
          volume={(frame) => {
            const level =
              settings.volume + (settings.duckedVolume - settings.volume) * ducking(frame);
            const edges = Math.min(
              interpolate(frame, [0, fadeIn], [0, 1], CLAMP),
              interpolate(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0], CLAMP),
            );
            return level * edges;
          }}
        />
      ) : null}

      {voices.map((clip) => (
        <Sequence
          key={clip.file}
          from={clip.from}
          durationInFrames={clip.durationInFrames}
          layout="none"
          name={`Voix · ${clip.file.split('/').pop()}`}
        >
          <Html5Audio src={staticFile(clip.file)} volume={voiceVolume * clip.gain} />
        </Sequence>
      ))}
    </>
  );
};
