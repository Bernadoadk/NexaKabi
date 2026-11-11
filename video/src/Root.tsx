import React from 'react';
import { Composition, Folder, getStaticFiles, type CalculateMetadataFunction } from 'remotion';
import { config } from './config';
import { findVoices } from './components/audio/voices';
import {
  calculateMetadata as calculateJeunesseMetadata,
  JeunesseVideo,
  totalFrames as jeunesseFrames,
} from './jeunesse/Video';
import './styles.css';
import { totalFrames, Video, type VideoProps } from './Video';

/**
 * La musique et la voix off sont facultatives : chaque fichier présent dans
 * `public/` est joué, ceux qui manquent sont simplement ignorés.
 */
const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  const durationInFrames = totalFrames();
  const seconds = durationInFrames / config.fps;
  if (seconds < 30 || seconds > 45) {
    console.warn(`Durée totale : ${seconds.toFixed(1)} s (cible : 30 à 45 s). Voir src/config.ts.`);
  }
  const files = getStaticFiles().map((file) => file.name.replace(/\\/g, '/'));
  const music = files.includes(config.music.file) ? config.music.file : null;
  const voices = await findVoices(files, seconds);
  return { props: { ...props, music, voices }, durationInFrames };
};

const defaultProps: VideoProps = { music: null, voices: [] };

export const RemotionRoot: React.FC = () => (
  <>
    {/* YouTube, site web */}
    <Composition
      id="NexaKabi-16x9"
      component={Video}
      durationInFrames={totalFrames()}
      fps={config.fps}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />
    {/* Reels, TikTok, statuts WhatsApp */}
    <Composition
      id="NexaKabi-9x16"
      component={Video}
      durationInFrames={totalFrames()}
      fps={config.fps}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={calculateMetadata}
    />

    {/* Vidéo « Jeunesse » : une bande d'amis, de la question du vendredi au
        concert du samedi. Réglages dans src/jeunesse/config.ts. */}
    <Folder name="Jeunesse">
      <Composition
        id="NexaKabi-Jeunesse-16x9"
        component={JeunesseVideo}
        durationInFrames={jeunesseFrames()}
        fps={config.fps}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
        calculateMetadata={calculateJeunesseMetadata}
      />
      <Composition
        id="NexaKabi-Jeunesse-9x16"
        component={JeunesseVideo}
        durationInFrames={jeunesseFrames()}
        fps={config.fps}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={calculateJeunesseMetadata}
      />
    </Folder>
  </>
);
