/**
 * Types de la configuration. Ils servent à signaler une faute de frappe dans
 * `config.ts` (une clé mal orthographiée, un nombre écrit en texte) avant
 * même d'ouvrir le Studio.
 */

/** Catégories du référentiel de l'application (`apps/api/prisma/seed.ts`). */
export type CategorySlug =
  | 'musique'
  | 'festivals'
  | 'soirees'
  | 'business'
  | 'tech'
  | 'conferences'
  | 'formation'
  | 'sport'
  | 'culture'
  | 'mode'
  | 'gastronomie'
  | 'religion'
  | 'universitaire'
  | 'networking'
  | 'famille';

export interface Category {
  name: string;
  /** Teinte profonde de la catégorie : plaque de repli, épingle de carte. */
  color: string;
}

/** Illustrations d'affiche dessinées en SVG (voir `src/components/ui/EventCover.tsx`). */
export type CoverStyle = 'stage' | 'beach' | 'gospel' | 'market' | 'football' | 'comedy' | 'tech';

export interface DemoEvent {
  id: string;
  title: string;
  category: CategorySlug;
  /** Format « AAAA-MM-JJ HH:mm », heure de Cotonou. */
  start: string;
  end: string;
  venue: string;
  city: string;
  /** Prix du billet le moins cher, en FCFA. 0 = gratuit. */
  price: number;
  remainingSeats?: number;
  almostSoldOut?: boolean;
  minimumAge?: number;
  /** Illustration dessinée utilisée comme visuel. */
  cover: CoverStyle;
  /**
   * Facultatif : une vraie image dans `public/` (ex. `covers/festival.jpg`)
   * qui remplace l'illustration.
   */
  image?: string;
  /** Position de l'épingle sur la carte stylisée, de 0 à 1. */
  map: { x: number; y: number };
}

export interface TicketCategory {
  name: string;
  price: number;
  description: string;
  /** Places restantes au moment de l'achat montré dans la vidéo. */
  remaining: number;
  /** Capacité de la catégorie. */
  total: number;
  /** Billets vendus, affichés dans les statistiques de l'organisateur. */
  sold: number;
}

export interface SalesDay {
  /** Format « AAAA-MM-JJ ». */
  date: string;
  tickets: number;
  amount: number;
}

export interface VideoConfig {
  brand: {
    name: string;
    url: string;
    slogan: string;
    promise: string;
    /** Fichier du logo dans `public/`. */
    logo: string;
  };
  fps: number;
  music: {
    /** Chemin dans `public/`. Sans fichier à cet endroit, la vidéo est sans musique. */
    file: string;
    /** Crédit affiché dans le README (titre, auteur, source). */
    credit: string;
    /** Volume normal, de 0 à 1. */
    volume: number;
    /** Volume pendant la voix off : la musique s'efface sous la voix. */
    duckedVolume: number;
    /** Instant du morceau (secondes) qui démarre avec la vidéo. */
    startAt: number;
    /** Vitesse de lecture (1 = normale), pour caler le tempo sur les coupes. */
    playbackRate: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
  };
  /**
   * Voix off : une phrase par fichier, posée à son instant (secondes, depuis
   * le début de la vidéo). Le fichier se dépose dans `public/` sous le nom
   * indiqué, avec l'extension de votre choix (.mp3, .m4a, .wav, .ogg).
   */
  voiceover: {
    volume: number;
    /** Égalise le volume des phrases (enregistrements faits au téléphone). */
    normalize: boolean;
    /**
     * `at` : début (secondes depuis le début de la vidéo). `end` : instant où
     * la phrase doit être finie, s'il tombe avant la phrase suivante.
     */
    lines: Array<{ file: string; at: number; end?: number; text: string }>;
  };
  /** Effets sonores (souffles, clics, « ding »), générés par `npm run sfx`. */
  sfx: {
    enabled: boolean;
    /** Volume général des effets, de 0 à 1. */
    volume: number;
  };
  /** Durée de chaque transition entre deux scènes. */
  transitionSeconds: number;
  typography: {
    /** Taille des titres animés, en pixels. */
    titleLandscape: number;
    titlePortrait: number;
  };
  scenes: {
    hook: {
      seconds: number;
      lines: [string, string, string];
      bubbles: [string, string, string];
      flyer: string;
      note: string;
      phone: string;
    };
    brand: { seconds: number };
    discover: { seconds: number; eyebrow: string; title: string; points: [string, string] };
    checkout: { seconds: number; eyebrow: string; beats: [string, string, string] };
    ticket: { seconds: number; eyebrow: string; beats: [string, string] };
    organizer: { seconds: number; eyebrow: string; beats: [string, string, string] };
    benefits: {
      seconds: number;
      public: { title: string; points: [string, string, string] };
      organizers: { title: string; points: [string, string, string] };
    };
    cta: { seconds: number; kicker: string; button: string; subline: string };
  };
  colors: Record<string, string>;
  categories: Record<CategorySlug, Category>;
  data: {
    city: string;
    clock: string;
    buyer: { name: string };
    organizer: { name: string; user: string };
    heroEventId: string;
    heroEventDescription: string;
    doorsOpen: string;
    refundPolicy: string;
    tickets: [TicketCategory, TicketCategory];
    quantity: number;
    orderReference: string;
    events: DemoEvent[];
    discover: { upcomingCount: number; weekendIds: string[] };
    stats: { attendanceRate: number; checkedIn: number; netAmount: number; salesByDay: SalesDay[] };
    finance: {
      available: number;
      pending: number;
      grossSales: number;
      paidOut: number;
      payoutFee: number;
      account: { method: string; masked: string };
    };
    scanner: { entriesBefore: number; manifest: number };
  };
}
