import { Easing, interpolate, spring, type SpringConfig } from 'remotion';
import { config } from '../config';

/**
 * Petites briques d'animation, toutes pilotées par le temps de la scène.
 */

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Sortie douce, pour les entrées d'éléments. */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Aller-retour doux, pour les déplacements de caméra et de curseur. */
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
/** Accélération, pour les sorties. */
export const EASE_IN = Easing.bezier(0.55, 0, 1, 0.45);

/** Ressorts prêts à l'emploi. */
export const SPRINGS = {
  /** Arrivée franche avec un léger rebond. */
  pop: { damping: 11, stiffness: 170, mass: 0.8 },
  /** Arrivée nette, sans rebond visible. */
  snappy: { damping: 20, stiffness: 210, mass: 0.7 },
  /** Mouvement ample et doux (téléphone, panneaux). */
  smooth: { damping: 26, stiffness: 120, mass: 1 },
  /** Rebond marqué (épingles, pastilles). */
  bouncy: { damping: 8, stiffness: 160, mass: 0.7 },
} satisfies Record<string, Partial<SpringConfig>>;

/** Ressort de 0 à 1 démarrant à `start`. */
export function sp(
  time: number,
  start: number,
  springConfig: Partial<SpringConfig> = SPRINGS.snappy,
  durationInFrames?: number,
): number {
  return spring({
    frame: time - start,
    fps: config.fps,
    config: springConfig,
    durationInFrames,
  });
}

/** Rampe de `from` à `to` (en images), bornée, avec courbe. */
export function ramp(
  time: number,
  from: number,
  to: number,
  output: [number, number] = [0, 1],
  easing: (input: number) => number = EASE_OUT,
): number {
  return interpolate(time, [from, to], output, { ...CLAMP, easing });
}

/** Entrée puis sortie : 0 → 1 entre `inStart` et `inEnd`, 1 → 0 entre `outStart` et `outEnd`. */
export function inOut(
  time: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number,
): number {
  if (time < outStart) return ramp(time, inStart, inEnd);
  return ramp(time, outStart, outEnd, [1, 0], EASE_IN);
}

/**
 * Position le long d'images clés : `[{ at, value }]`, avec transition douce
 * entre deux clés successives. Avant la première clé, la première valeur ;
 * après la dernière, la dernière.
 */
export interface Key<T> {
  at: number;
  value: T;
  /** Durée du trajet qui ARRIVE sur cette clé (par défaut : depuis la clé précédente). */
  travel?: number;
}

export function keyframes(time: number, keys: Key<number>[], easing = EASE_IN_OUT): number {
  if (keys.length === 0) return 0;
  if (time <= keys[0].at) return keys[0].value;
  for (let index = 1; index < keys.length; index++) {
    const key = keys[index];
    if (time <= key.at) {
      const previous = keys[index - 1];
      const start =
        key.travel !== undefined ? Math.max(previous.at, key.at - key.travel) : previous.at;
      return interpolate(time, [start, key.at], [previous.value, key.value], { ...CLAMP, easing });
    }
  }
  return keys[keys.length - 1].value;
}

/** Même chose pour un point `{ x, y }`. */
export function keyPoints(
  time: number,
  keys: Key<{ x: number; y: number }>[],
  easing = EASE_IN_OUT,
): { x: number; y: number } {
  return {
    x: keyframes(
      time,
      keys.map((key) => ({ at: key.at, value: key.value.x, travel: key.travel })),
      easing,
    ),
    y: keyframes(
      time,
      keys.map((key) => ({ at: key.at, value: key.value.y, travel: key.travel })),
      easing,
    ),
  };
}

/** Pseudo-aléatoire déterministe : même graine, même valeur, à chaque rendu. */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
