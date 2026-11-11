/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEXA KABI — CONFIGURATION CENTRALE DE LA VIDÉO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Tout ce qui se modifie sans toucher aux animations se trouve ici :
 *  textes, durées, couleurs, son (musique, voix off, effets) et données
 *  fictives des maquettes.
 *
 *  ── Textes animés ──────────────────────────────────────────────────────────
 *    *mots*   → mis en valeur, en corail
 *    \n       → retour à la ligne forcé (sinon le texte revient à la ligne
 *               tout seul)
 *
 *  ── Durées ─────────────────────────────────────────────────────────────────
 *  En secondes. Changer la durée d'une scène étire ou resserre toute son
 *  animation, proportionnellement. La durée totale se calcule seule :
 *  somme des scènes − le chevauchement des transitions (6 transitions et
 *  une coupe franche, voir `src/Video.tsx`).
 *  Réglage livré : 48 s de scènes − 6 × 0,5 s de transitions = 45 s.
 *
 *  ── Données ────────────────────────────────────────────────────────────────
 *  Toutes fictives : événements, personnes, montants. Aucune donnée réelle.
 */
import type { VideoConfig } from './config.types';

export const config: VideoConfig = {
  brand: {
    name: 'Nexa Kabi',
    url: 'nexakabi-web.vercel.app',
    slogan: 'Ne ratez *plus rien*.',
    promise: 'Tous vos événements,\n*au même endroit*.',
    logo: 'logo.png',
  },

  fps: 30,

  // ─────────────────────────────────────────────────────────────────────────
  //  SON
  // ─────────────────────────────────────────────────────────────────────────
  music: {
    // Le fichier n'est pas versionné (licence Pixabay) : voir README.
    file: 'audio/musique.mp3',
    credit: '« Water | Afro-pop Music » par kontraa — Pixabay (licence Pixabay)',
    volume: 0.6,
    duckedVolume: 0.16,
    // Le morceau démarre à 4,23 s : l'entrée du refrain (8,81 s dans le
    // morceau) tombe sur l'impact du logo (4,57 s dans la vidéo). 110 BPM.
    startAt: 4.233,
    playbackRate: 1,
    fadeInSeconds: 0.2,
    fadeOutSeconds: 2.5,
  },

  // Vos enregistrements, un fichier par phrase, dans video/public/audio/voix/.
  // Sans fichier, la phrase est simplement absente. Si une phrase déborde sur
  // la suivante, un avertissement s'affiche dans la console du Studio.
  voiceover: {
    volume: 1,
    normalize: true,
    lines: [
      {
        file: 'audio/voix/01-accroche',
        at: 0.4,
        // Finie avant l'impact du logo, où la musique explose.
        end: 4.3,
        text: 'Un concert ce week-end ? L’info est partout… le billet, nulle part.',
      },
      {
        file: 'audio/voix/02-logo',
        // Une seconde de musique seule laisse respirer l'arrivée du logo.
        at: 5.4,
        text: 'Avec Nexa Kabi, tous vos événements sont au même endroit.',
      },
      {
        file: 'audio/voix/03-decouvrir',
        at: 9.0,
        text: 'Concerts, festivals, soirées : trouvez ce qui se passe près de chez vous, jusque sur la carte.',
      },
      {
        file: 'audio/voix/04-reserver',
        at: 15.4,
        text: 'Choisissez vos billets, les frais sont affichés dès le départ. Payez en Mobile Money ou par carte… et c’est confirmé !',
      },
      {
        file: 'audio/voix/05-entrer',
        at: 23.6,
        text: 'Votre billet ? Un QR code. À l’entrée, un scan suffit, même sans réseau.',
      },
      {
        file: 'audio/voix/06-organisateurs',
        at: 29.0,
        text: 'Organisateurs : créez votre événement en cinq minutes, suivez chaque vente et encaissez vos recettes.',
      },
      {
        file: 'audio/voix/07-double-benefice',
        at: 37.0,
        text: 'Pour le public comme pour les organisateurs, tout devient simple.',
      },
      {
        file: 'audio/voix/08-appel',
        at: 41.0,
        text: 'Cette fin d’année, ne ratez plus rien. Nexa Kabi !',
      },
    ],
  },

  // Effets sonores synthétisés par `npm run sfx` (public/audio/sfx/), posés
  // dans chaque scène sur ses repères.
  sfx: {
    enabled: true,
    volume: 0.7,
  },

  transitionSeconds: 0.5,

  typography: {
    titleLandscape: 80,
    titlePortrait: 74,
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  SCÈNES, dans l'ordre de la vidéo
  // ─────────────────────────────────────────────────────────────────────────
  scenes: {
    // 1 · Accroche : le problème
    hook: {
      seconds: 5,
      lines: ['Un concert\nce week-end ?', 'L’info est\n*partout*…', '…le billet,\n*nulle part*.'],
      bubbles: ['C’est où déjà ?', 'Y a encore des places ?', 'On paie comment ?'],
      flyer: 'Soirée',
      note: 'Cash à l’entrée',
      phone: 'Résa : 01 •• •• •• ••',
    },

    // 2 · Le logo et la promesse (brand.promise)
    brand: { seconds: 4 },

    // 3 · Découvrir les événements
    discover: {
      seconds: 7,
      eyebrow: 'Découvrir',
      title: 'Concerts, festivals, soirées… *près de chez vous*.',
      points: ['Par ville, date ou prix', 'Sur la carte, autour de vous'],
    },

    // 4 · Réserver et payer
    checkout: {
      seconds: 8.5,
      eyebrow: 'Réserver',
      beats: [
        'Les frais, affichés *dès le départ*.',
        'Payez en *Mobile Money*.',
        'Vos billets, *aussitôt*.',
      ],
    },

    // 5 · Le billet QR et le contrôle à l'entrée
    ticket: {
      seconds: 6,
      eyebrow: 'Entrer',
      beats: ['Votre billet ?\n*Un QR code.*', 'Scanné à l’entrée,\n*même sans réseau*.'],
    },

    // 6 · L'espace organisateur
    organizer: {
      seconds: 8.5,
      eyebrow: 'Organisateurs',
      beats: ['Créez en *5 minutes*.', 'Suivez *chaque vente*.', 'Encaissez *vos recettes*.'],
    },

    // 7 · Le double bénéfice
    benefits: {
      seconds: 4.5,
      public: {
        title: 'Pour le public',
        points: [
          'Tous vos événements au même endroit',
          'Paiement Mobile Money ou carte',
          'Billet QR, même hors ligne',
        ],
      },
      organizers: {
        title: 'Pour les organisateurs',
        points: [
          'Billetterie prête en 5 minutes',
          'Recettes suivies au franc près',
          'Contrôle d’entrée sans réseau',
        ],
      },
    },

    // 8 · Appel à l'action (brand.slogan et brand.url)
    cta: {
      seconds: 4.5,
      kicker: 'Cette fin d’année,',
      button: 'Découvrir les événements',
      subline: 'Participants et organisateurs',
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  COULEURS — relevées dans le design system de l'application
  //  (packages/ui/src/styles/tokens.css). Changer une valeur ici la change
  //  partout dans la vidéo, maquettes comprises.
  // ─────────────────────────────────────────────────────────────────────────
  colors: {
    // Marque
    ink: '#12102B',
    'ink-700': '#1E1A48',
    'ink-800': '#161228',
    'ink-900': '#0B0918',
    coral: '#FF4D2E',
    'coral-hover': '#E93F21',
    'coral-50': '#FFEDE8',
    'coral-200': '#FFB9A9',
    'coral-300': '#FF9E86',
    'coral-400': '#FF7A5C',
    'coral-700': '#C0341A',

    // Statuts
    mint: '#12B981',
    'mint-50': '#EEFBF6',
    'mint-200': '#C7EEDF',
    'mint-300': '#7BE3BF',
    'mint-700': '#0B7A57',
    'mint-950': '#062F22',
    amber: '#F0A92E',
    'amber-50': '#FFF7ED',
    'amber-200': '#F6E2C0',
    'amber-400': '#FFB900',
    'amber-600': '#C08A20',
    'amber-700': '#8A6A20',
    red: '#E03535',
    'red-50': '#FEECEC',
    'red-200': '#F6C9C9',
    'red-700': '#C42B2B',
    blue: '#3B82F6',
    'blue-50': '#EEF4FF',
    'blue-200': '#CFDDFA',
    'blue-700': '#2A5BC0',

    // Surfaces
    paper: '#F6F5F2',
    surface: '#FFFFFF',
    'surface-alt': '#FBFAF8',
    border: '#E7E4DC',
    'border-field': '#D8D4CA',
    'border-subtle': '#EFECE5',
    'border-strong': '#E2DFD7',
    'fill-muted': '#EDEAE2',
    'fill-neutral': '#F1F0EC',

    // Texte
    text: '#12102B',
    'text-strong': '#3A3652',
    'text-2': '#6E6A80',
    'text-3': '#9C98AC',
    'text-disabled': '#B4B0BE',
    'text-neutral': '#5C5870',
    'on-ink-2': '#B9B5D0',
    'on-ink-3': '#8A86A8',
    'on-ink-4': '#6B6790',
    'on-ink-soft': '#CFCBE4',
  },

  // Catégories du référentiel (nom affiché et teinte de la plaque).
  categories: {
    musique: { name: 'Musique & concerts', color: '#3D1E4A' },
    festivals: { name: 'Festivals', color: '#1E1A48' },
    soirees: { name: 'Soirées', color: '#2A1140' },
    business: { name: 'Business', color: '#0B3C5D' },
    tech: { name: 'Technologie', color: '#0B3C5D' },
    conferences: { name: 'Conférences', color: '#123B54' },
    formation: { name: 'Formation', color: '#14432F' },
    sport: { name: 'Sport', color: '#0F3B2E' },
    culture: { name: 'Art & culture', color: '#4A1E2E' },
    mode: { name: 'Mode', color: '#4A1E3D' },
    gastronomie: { name: 'Gastronomie', color: '#4A2E1E' },
    religion: { name: 'Religion', color: '#1E2E4A' },
    universitaire: { name: 'Événements universitaires', color: '#1E3A4A' },
    networking: { name: 'Networking', color: '#2E1E4A' },
    famille: { name: 'Enfants & famille', color: '#4A3A1E' },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  DONNÉES FICTIVES DES MAQUETTES
  // ─────────────────────────────────────────────────────────────────────────
  data: {
    city: 'Cotonou',
    // Heure affichée dans la barre d'état des téléphones.
    clock: '19:42',
    buyer: { name: 'Aïcha Dossou' },
    organizer: { name: 'Awalé Productions', user: 'Rodrigue Agbo' },

    // L'événement suivi de la découverte jusqu'au scan (voir `events`).
    heroEventId: 'lagune',
    heroEventDescription:
      'Deux scènes au bord de la lagune, les meilleurs artistes afro du moment et une nuit de fête pour finir l’année en beauté.',
    doorsOpen: '2026-12-19 17:00',
    refundPolicy: 'Jusqu’à 7 jours avant',
    tickets: [
      {
        name: 'Pass Standard',
        price: 5000,
        description: 'Accès aux deux scènes',
        remaining: 38,
        total: 720,
        sold: 700,
      },
      {
        name: 'Pass VIP',
        price: 15000,
        description: 'Espace lounge, boisson offerte',
        remaining: 19,
        total: 140,
        sold: 124,
      },
    ],
    // Nombre de Pass Standard achetés dans la scène « Réserver ».
    quantity: 2,
    orderReference: 'NK-3B7E90',

    events: [
      {
        id: 'lagune',
        title: 'Lagune Live Festival',
        category: 'festivals',
        start: '2026-12-19 18:00',
        end: '2026-12-20 23:00',
        venue: 'Place de l’Étoile Rouge',
        city: 'Cotonou',
        price: 5000,
        remainingSeats: 57,
        almostSoldOut: true,
        cover: 'stage',
        map: { x: 0.46, y: 0.35 },
      },
      {
        id: 'rires',
        title: 'Rires de fin d’année',
        category: 'culture',
        start: '2026-12-19 20:30',
        end: '2026-12-19 23:00',
        venue: 'Ganhi',
        city: 'Cotonou',
        price: 5000,
        remainingSeats: 124,
        cover: 'comedy',
        map: { x: 0.57, y: 0.7 },
      },
      {
        id: 'marche',
        title: 'Marché de Noël des Créateurs',
        category: 'mode',
        start: '2026-12-19 10:00',
        end: '2026-12-19 19:00',
        venue: 'Haie Vive',
        city: 'Cotonou',
        price: 0,
        cover: 'market',
        map: { x: 0.37, y: 0.64 },
      },
      {
        id: 'maracana',
        title: 'Tournoi de Maracana',
        category: 'sport',
        start: '2026-12-20 16:00',
        end: '2026-12-20 20:00',
        venue: 'Akpakpa',
        city: 'Cotonou',
        price: 1000,
        remainingSeats: 210,
        cover: 'football',
        map: { x: 0.81, y: 0.47 },
      },
      {
        id: 'reveillon',
        title: 'Réveillon Afro Vibes',
        category: 'soirees',
        start: '2026-12-31 22:00',
        end: '2027-01-01 05:00',
        venue: 'Plage de Fidjrossè',
        city: 'Cotonou',
        price: 10000,
        remainingSeats: 340,
        minimumAge: 18,
        cover: 'beach',
        map: { x: 0.13, y: 0.75 },
      },
      {
        id: 'gospel',
        title: 'Gospel de Noël',
        category: 'musique',
        start: '2026-12-24 19:00',
        end: '2026-12-24 22:30',
        venue: 'Cadjèhoun',
        city: 'Cotonou',
        price: 3000,
        remainingSeats: 180,
        cover: 'gospel',
        map: { x: 0.25, y: 0.55 },
      },
      {
        id: 'tech',
        title: 'Cotonou Tech Meetup',
        category: 'tech',
        start: '2026-12-10 17:30',
        end: '2026-12-10 20:30',
        venue: 'Gbégamey',
        city: 'Cotonou',
        price: 0,
        cover: 'tech',
        map: { x: 0.33, y: 0.4 },
      },
    ],

    discover: {
      // « 12 événements à venir » en haut de l'écran Découvrir.
      upcomingCount: 12,
      // Résultats du filtre « Ce week-end », dans l'ordre d'affichage.
      weekendIds: ['lagune', 'rires', 'marche', 'maracana'],
    },

    stats: {
      attendanceRate: 92,
      checkedIn: 758,
      netAmount: 5_252_800,
      salesByDay: [
        { date: '2026-12-14', tickets: 96, amount: 620_000 },
        { date: '2026-12-15', tickets: 132, amount: 860_000 },
        { date: '2026-12-16', tickets: 158, amount: 1_030_000 },
        { date: '2026-12-17', tickets: 201, amount: 1_305_000 },
        { date: '2026-12-18', tickets: 237, amount: 1_545_000 },
      ],
    },

    finance: {
      available: 4_180_000,
      pending: 1_072_800,
      grossSales: 5_628_000,
      paidOut: 0,
      payoutFee: 2_000,
      account: { method: 'MTN MoMo', masked: '01 97 •• •• 45' },
    },

    scanner: { entriesBefore: 757, manifest: 824 },
  },
};
