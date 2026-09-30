import type { CSSProperties } from 'react';
import { config } from './config';

/**
 * Variables CSS tirées de `config.colors`.
 *
 * Posées à la racine de la vidéo, elles remplacent les valeurs par défaut de
 * `styles.css` : toutes les classes Tailwind (`bg-coral`, `text-ink`…) et
 * tous les `var(--color-…)` suivent donc la config.
 */
export function colorVariables(): CSSProperties {
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(config.colors)) {
    variables[`--color-${name}`] = value;
  }
  // `text-white` et `on-ink` restent du blanc pur.
  variables['--color-on-ink'] = '#FFFFFF';
  return variables as CSSProperties;
}
