import React, { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';
import { config } from '../config';

/**
 * Le temps d'une scène.
 *
 * Chaque scène est chorégraphiée image par image pour sa durée d'origine
 * (`designSeconds`). Si la config lui donne une autre durée, le temps de la
 * scène est étiré ou resserré d'autant : toute l'animation suit, sans avoir
 * à retoucher un seul repère.
 *
 * Les composants lisent ce temps avec `useTime()`, jamais directement avec
 * `useCurrentFrame()`.
 */
const TimeContext = createContext<number>(0);

/** Images de conception par image réelle (1 quand la durée n'a pas changé). */
const RatioContext = createContext<number>(1);

export const useTime = () => useContext(TimeContext);

export const useSceneRatio = () => useContext(RatioContext);

export const SceneTime: React.FC<{
  designSeconds: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ designSeconds, durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const ratio = (designSeconds * config.fps) / durationInFrames;
  return (
    <RatioContext.Provider value={ratio}>
      <TimeContext.Provider value={frame * ratio}>{children}</TimeContext.Provider>
    </RatioContext.Provider>
  );
};
