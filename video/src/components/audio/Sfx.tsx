import React from 'react';
import { getStaticFiles, Html5Audio, Sequence, staticFile } from 'remotion';
import { config } from '../../config';
import { useSceneRatio } from '../../lib/time';

/** Les sons fabriqués par `npm run sfx` (voir `scripts/sfx.mjs`). */
export type SfxName =
  | 'whoosh'
  | 'whoosh-deep'
  | 'swish'
  | 'tap'
  | 'pop'
  | 'pop-high'
  | 'tick'
  | 'ding'
  | 'beep'
  | 'valid'
  | 'impact'
  | 'riser'
  | 'type'
  | 'coins'
  // Vidéo « Jeunesse » : vibration du téléphone, message reçu, message
  // envoyé, canon à confettis.
  | 'buzz'
  | 'message'
  | 'send'
  | 'popper';

/** Aucun son ne dure plus longtemps (le « ding » et sa résonance : 1,8 s). */
const MAX_SECONDS = 2;

/**
 * Un effet sonore calé sur un repère de la scène, en images de conception
 * comme les animations : si la durée de la scène change, le son suit.
 * `volume` (0 à 1) se multiplie au volume général `config.sfx.volume`.
 */
export const Sfx: React.FC<{ at: number; sound: SfxName; volume?: number }> = ({
  at,
  sound,
  volume = 1,
}) => {
  const ratio = useSceneRatio();
  const file = `audio/sfx/${sound}.wav`;
  if (!config.sfx.enabled) return null;
  // Sons absents (dossier effacé) : la vidéo reste lisible, sans eux.
  if (!getStaticFiles().some((entry) => entry.name.replace(/\\/g, '/') === file)) return null;
  return (
    <Sequence
      from={Math.round(at / ratio)}
      durationInFrames={MAX_SECONDS * config.fps}
      layout="none"
      name={`♪ ${sound}`}
    >
      <Html5Audio src={staticFile(file)} volume={config.sfx.volume * volume} />
    </Sequence>
  );
};
