/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEXA KABI — VIDÉO « JEUNESSE » : CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Une bande d'amis, un vendredi soir : « On fait quoi ce week-end ? ».
 *  Aïcha trouve le festival à la une de Nexa Kabi, prend quatre billets en
 *  Mobile Money, envoie à chacun le sien ; samedi, un scan chacun à l'entrée,
 *  et la fête. Réponse à la question du début : « Ça. »
 *
 *  Textes, durées, son, personnages : tout se règle ici. Les couleurs, la
 *  marque et les événements viennent de `src/config.ts` (partagés avec la
 *  vidéo principale). Même syntaxe : *mots* en corail, \n retour à la ligne.
 *
 *  ── Durées et musique ──────────────────────────────────────────────────────
 *  Le montage est calé sur le morceau (110 BPM, un temps = 16,36 images) :
 *  la reprise après la coupure du morceau tombe sur l'ouverture de
 *  l'application (6,55 s), l'entrée du dernier refrain sur l'arrivée au
 *  concert (32,73 s). Changer une durée décale ces rendez-vous : à faire
 *  en connaissance de cause.
 *  Réglage livré : 42,7 s de scènes − 3 × 0,5 s de transitions = 41,2 s.
 *
 *  ── Langue ────────────────────────────────────────────────────────────────
 *  Les textes marketing vouvoient. Les messages de la discussion sont ceux
 *  des personnages, entre amis ; les écrans de l'application gardent leur
 *  tutoiement.
 */
import { config } from '../config';
import type { JeunesseConfig } from './config.types';

export const jeunesse: JeunesseConfig = {
  // ─────────────────────────────────────────────────────────────────────────
  //  SON
  // ─────────────────────────────────────────────────────────────────────────
  music: {
    // Même morceau que la vidéo principale (non versionné, voir README).
    ...config.music,
    // Départ au début de la 9e mesure du morceau : la coupure (25,2 s) et la
    // reprise (26,29 s) tombent sur « Attendez, je regarde » et sur le logo,
    // le dernier refrain (52,47 s) sur le concert.
    startAt: 19.741,
    fadeInSeconds: 0.15,
    fadeOutSeconds: 2.5,
  },

  // Vos enregistrements, un fichier par phrase, dans
  // video/public/audio/voix/jeunesse/ (mode d'emploi : LISEZ-MOI.txt).
  // Sans fichier, la phrase est absente : la vidéo se comprend sans voix.
  voiceover: {
    volume: 1,
    normalize: true,
    lines: [
      {
        file: 'audio/voix/jeunesse/01-question',
        at: 0.3,
        // Finie avant la coupure de la musique.
        end: 5.3,
        text: 'On fait quoi ce week-end ? Chaque semaine, la même question…',
      },
      {
        file: 'audio/voix/jeunesse/02-une',
        at: 7.2,
        end: 11.1,
        text: 'Sur Nexa Kabi, les bons plans du week-end sont à la une.',
      },
      {
        file: 'audio/voix/jeunesse/03-achat',
        at: 15.0,
        end: 20.4,
        text: 'Le prix exact, frais compris. Quatre billets en Mobile Money… et c’est confirmé !',
      },
      {
        file: 'audio/voix/jeunesse/04-partage',
        at: 21.0,
        end: 24.6,
        text: 'Un lien par billet : envoyez à chacun le sien.',
      },
      {
        file: 'audio/voix/jeunesse/05-tenue',
        at: 24.9,
        end: 27.5,
        text: 'Le plus dur maintenant ? Choisir la tenue.',
      },
      {
        file: 'audio/voix/jeunesse/06-entree',
        at: 27.8,
        // Finie avant le refrain : le concert se passe de commentaire.
        end: 32.5,
        text: 'Samedi soir : un scan chacun… et vous y êtes !',
      },
      {
        file: 'audio/voix/jeunesse/07-appel',
        at: 37.5,
        text: 'Et le week-end prochain ? Nexa Kabi. Ne ratez plus rien !',
      },
    ],
  },

  transitionSeconds: 0.5,

  // ─────────────────────────────────────────────────────────────────────────
  //  LA BANDE (personnages fictifs)
  // ─────────────────────────────────────────────────────────────────────────
  friends: {
    aicha: {
      name: 'Aïcha',
      fullName: config.data.buyer.name,
      color: '#FF9E86',
      nameColor: '#C0341A',
      skin: '#8A5A3C',
      hair: 'puff',
      top: '#12102B',
      earrings: true,
    },
    koffi: {
      name: 'Koffi',
      fullName: 'Koffi Agossou',
      color: '#7BE3BF',
      nameColor: '#0B7A57',
      skin: '#5C3A25',
      hair: 'hightop',
      top: '#FF4D2E',
    },
    sena: {
      name: 'Sèna',
      fullName: 'Sèna Houngbo',
      color: '#FFD27A',
      nameColor: '#A0701A',
      skin: '#7A4A2E',
      hair: 'headwrap',
      top: '#1E1A48',
      earrings: true,
    },
    yann: {
      name: 'Yann',
      fullName: 'Yann Kpadé',
      color: '#CFDDFA',
      nameColor: '#2A5BC0',
      skin: '#A06A45',
      hair: 'short',
      top: '#12B981',
      glasses: true,
    },
  },
  groupName: 'La team 🎉',

  // ─────────────────────────────────────────────────────────────────────────
  //  SCÈNES, dans l'ordre de la vidéo
  // ─────────────────────────────────────────────────────────────────────────
  scenes: {
    // 1 · La question du vendredi, dans la discussion de groupe. Le dernier
    //     message est celui d'Aïcha, qui tient le téléphone.
    question: {
      seconds: 6.53,
      title: 'On fait quoi\nce *week-end* ?',
      dayLabel: 'Vendredi',
      messages: [
        { from: 'koffi', text: 'On fait quoi ce week-end ?' },
        { from: 'sena', text: 'Aucune idée 🤷🏾‍♀️' },
        { from: 'yann', text: 'Encore le même maquis ? 😩' },
        { from: 'koffi', text: 'On sait jamais ce qui se passe 🙄' },
        { text: 'Attendez, je regarde 👀' },
      ],
    },

    // 2 · Nexa Kabi s'ouvre : Découvrir et son carrousel « À la une ».
    une: {
      seconds: 4.67,
      eyebrow: 'Découvrir',
      title: 'Les bons plans du week-end, *à la une*.',
    },

    // 3 · La bande dit oui, Aïcha prend quatre billets en Mobile Money.
    achat: {
      seconds: 9.33,
      share: 'Lagune Live samedi ?! 🔥',
      replies: [
        { from: 'koffi', text: 'GRAVE !!' },
        { from: 'sena', text: '5 000 ? Ça passe 👌🏾' },
        { from: 'yann', text: 'Je suis chaud 😎' },
        { text: 'Je prends pour nous 4 !' },
      ],
      eyebrow: 'Réserver',
      beats: ['Le prix exact, *frais compris*.', 'Payez en *Mobile Money*.'],
    },

    // 4 · Un lien par billet : Aïcha envoie à chacun le sien.
    partage: {
      seconds: 4.5,
      eyebrow: 'Partager',
      title: 'Un lien par billet :\n*chacun le sien*.',
      point: 'Sans compte à créer',
      replies: ['Reçu ✅', 'Merci ma go 🙏🏾', 'La boss 👑'],
    },

    // 5 · L'intermède.
    tenue: {
      seconds: 3,
      lines: ['Le plus dur\nmaintenant ?', '*Choisir\nla tenue.*'],
    },

    // 6 · Samedi soir, l'entrée : quatre scans, quatre « Entrée autorisée ».
    entree: {
      seconds: 5.7,
      eyebrow: 'Samedi, 19 h',
      title: 'Un scan chacun,\n*et vous y êtes*.',
    },

    // 7 · Le concert, et la réponse à la question du début.
    ambiance: {
      seconds: 4.5,
      callback: 'On fait quoi ce week-end ?',
      answer: '*Ça.*',
    },

    // 8 · Appel à l'action (brand.slogan et brand.url de `src/config.ts`).
    cta: {
      seconds: 4.5,
      kicker: 'Et le week-end prochain ?',
      button: 'Découvrir les événements',
      subline: 'Tous vos événements, au même endroit.',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  DONNÉES FICTIVES DES MAQUETTES (l'événement : `config.data.heroEventId`)
  // ─────────────────────────────────────────────────────────────────────────
  data: {
    quantity: 4,
    orderReference: 'NK-5C21A8',
    clockSearch: '18:47',
    clockEntry: '19:06',
    entriesBefore: 412,
    spotlight: [
      { id: 'rires', sponsored: false },
      { id: 'lagune', sponsored: true },
      { id: 'reveillon', sponsored: false },
      { id: 'maracana', sponsored: false },
    ],
  },
};
