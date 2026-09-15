import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` doit connaître les échelles personnalisées du design
 * system, sinon il les range dans le mauvais groupe de conflit.
 *
 * Sans cette configuration, `text-body` (une TAILLE) est interprété comme une
 * COULEUR de texte et supprime silencieusement `text-white` d'un bouton encre —
 * bug constaté en vérification visuelle : le libellé devenait invisible.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'body-l',
            'body',
            'body-s',
            'micro',
            'caption',
            'eyebrow',
            'amount',
          ],
        },
      ],
      rounded: [
        {
          rounded: [
            'badge',
            'chip',
            'field',
            'button',
            'card',
            'panel',
            'block',
            'sheet',
            'device',
          ],
        },
      ],
      shadow: [{ shadow: ['sm', 'md', 'lg', 'xl', 'sheet', 'device'] }],
    },
  },
});

/** Fusionne des classes Tailwind en résolvant les conflits. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
