import React from 'react';
import { Composition, getStaticFiles, type CalculateMetadataFunction } from 'remotion';
import { config } from './config';
import './styles.css';
import { totalFrames, Video, type VideoProps } from './Video';

/**
 * La musique est facultative : si `public/audio/musique.mp3` (ou le fichier
 * indiqué dans la config) existe, elle est jouée ; sinon la vidéo est muette.
 */
const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => {
  const hasMusic = getStaticFiles().some((file) => file.name === config.music.file);
  const durationInFrames = totalFrames();
  const seconds = durationInFrames / config.fps;
  if (seconds < 30 || seconds > 45) {
    console.warn(`Durée totale : ${seconds.toFixed(1)} s (cible : 30 à 45 s). Voir src/config.ts.`);
  }
  return { props: { ...props, hasMusic }, durationInFrames };
};

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
      defaultProps={{ hasMusic: false }}
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
      defaultProps={{ hasMusic: false }}
      calculateMetadata={calculateMetadata}
    />
  </>
);
