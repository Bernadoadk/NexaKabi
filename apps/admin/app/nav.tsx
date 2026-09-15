import type { SectionNavEntry } from '@nexakabi/ui';

/**
 * Entrées de la console admin.
 *
 * ── Ce qui a changé ────────────────────────────────────────────────────────
 * Quatre entrées à l'origine, avec ce commentaire : « L'administration n'a
 * pas vocation à devenir un back-office complet ». Le principe reste juste —
 * chaque entrée doit correspondre à une file réelle —, mais trois files
 * réelles n'avaient PAS d'écran du tout : geler un compte n'était possible
 * qu'en passant par un signalement déjà ouvert contre lui, exécuter un
 * retrait exigeait de déjà connaître son identifiant, et rien ne permettait
 * de chercher un compte utilisateur pour lui-même.
 */
export const ADMIN_NAV_ENTRIES: readonly SectionNavEntry[] = [
  { href: '/', label: 'Tableau de bord', exact: true },
  { href: '/evenements', label: 'Événements' },
  { href: '/verifications', label: 'Vérifications' },
  { href: '/signalements', label: 'Signalements' },
  { href: '/organisations', label: 'Organisations' },
  { href: '/utilisateurs', label: 'Utilisateurs' },
  { href: '/retraits', label: 'Retraits' },
];
