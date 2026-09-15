'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

export interface CoverImageProps {
  src: string;
  className?: string;
}

/**
 * Image de couverture d'événement, avec repli silencieux si elle échoue à
 * charger — se retire simplement, laissant voir la plaque typographique
 * posée en dessous par `Cover` (voir `event-card.tsx`). Sans ce filet, une
 * URL cassée affichait l'icône d'image rompue du navigateur, plus visible
 * encore sur un fond sombre qu'un rectangle gris ne l'était en clair.
 *
 * Isolé dans son propre module client : `Cover` et tout ce qui l'entoure
 * restent des composants serveur — seul cet élément a besoin d'un
 * gestionnaire d'événement.
 */
export function CoverImage({ src, className }: CoverImageProps) {
  const [failed, setFailed] = React.useState(false);

  if (failed) return null;

  return (
    <img
      src={src}
      alt=""
      className={cn('absolute inset-0', className)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
