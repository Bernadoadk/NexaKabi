/**
 * Types de la configuration de la vidéo « Jeunesse » (`src/jeunesse/config.ts`).
 * Ils signalent une faute de frappe avant même d'ouvrir le Studio.
 */
import type { VideoConfig } from '../config.types';

/** Coiffure d'un personnage (voir `components/Friends.tsx`). */
export type HairStyle = 'puff' | 'hightop' | 'headwrap' | 'short';

export interface Friend {
  /** Prénom affiché dans la discussion et au scanner. */
  name: string;
  /** Nom complet, imprimé sur le billet. */
  fullName: string;
  /** Fond de la pastille de profil. */
  color: string;
  /** Couleur du prénom dans la discussion de groupe. */
  nameColor: string;
  skin: string;
  hair: HairStyle;
  /** Couleur du haut (t-shirt, chemise). */
  top: string;
  /** Lunettes rondes. */
  glasses?: boolean;
  /** Créoles dorées. */
  earrings?: boolean;
}

export type FriendId = 'aicha' | 'koffi' | 'sena' | 'yann';

/** Un message de la discussion : `from` absent = la personne qui tient le téléphone. */
export interface ChatLine {
  from?: Exclude<FriendId, 'aicha'>;
  text: string;
}

export interface JeunesseConfig {
  /**
   * Musique : même fichier que la vidéo principale, autre passage du morceau.
   * Les durées des scènes sont calées sur ce départ : voir `config.ts`.
   */
  music: VideoConfig['music'];
  voiceover: VideoConfig['voiceover'];
  transitionSeconds: number;

  /** La bande d'amis. Aïcha tient le téléphone et achète les billets. */
  friends: Record<FriendId, Friend>;
  /** Nom de la discussion de groupe. */
  groupName: string;

  scenes: {
    question: {
      seconds: number;
      /** La question en grand, avant qu'elle ne rejoigne la discussion. */
      title: string;
      dayLabel: string;
      messages: ChatLine[];
    };
    une: { seconds: number; eyebrow: string; title: string };
    achat: {
      seconds: number;
      /** Le lien de l'événement partagé dans la discussion. */
      share: string;
      replies: ChatLine[];
      eyebrow: string;
      beats: [string, string];
    };
    partage: {
      seconds: number;
      eyebrow: string;
      title: string;
      point: string;
      replies: [string, string, string];
    };
    tenue: { seconds: number; lines: [string, string] };
    entree: { seconds: number; eyebrow: string; title: string };
    ambiance: { seconds: number; callback: string; answer: string };
    cta: { seconds: number; kicker: string; button: string; subline: string };
  };

  data: {
    /** Pass Standard achetés pour la bande (un par personne). */
    quantity: number;
    orderReference: string;
    /** Heures des barres d'état : la recherche (vendredi), l'entrée (samedi). */
    clockSearch: string;
    clockEntry: string;
    /** Entrées déjà enregistrées au scanner avant l'arrivée de la bande. */
    entriesBefore: number;
    /** Les diapositives de « À la une », dans l'ordre : identifiants de `config.data.events`. */
    spotlight: Array<{ id: string; sponsored: boolean }>;
  };
}
