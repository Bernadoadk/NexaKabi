import type { AdminSpace } from '@nexakabi/contracts';
import type { SectionNavEntry } from '@nexakabi/ui';

/**
 * Entrées de la console.
 *
 * Chaque entrée porte l'ESPACE qu'elle ouvre : le cadre (`shell.tsx`) ne
 * montre à un employé que les espaces auxquels le propriétaire lui a donné
 * accès. Le tableau de bord n'a pas d'espace : tout le monde y entre, il
 * filtre lui-même ses compteurs.
 *
 * Le principe reste celui d'origine : chaque entrée correspond à une file
 * réelle, jamais à un back-office complet.
 */
export interface AdminNavEntry extends SectionNavEntry {
  space?: AdminSpace;
  /** Réservée au propriétaire. */
  ownerOnly?: boolean;
}

export const ADMIN_NAV_ENTRIES: readonly AdminNavEntry[] = [
  { href: '/', label: 'Tableau de bord', exact: true },
  { href: '/evenements', label: 'Événements', space: 'events' },
  { href: '/verifications', label: 'Vérifications', space: 'verifications' },
  { href: '/signalements', label: 'Signalements', space: 'reports' },
  { href: '/organisations', label: 'Organisations', space: 'organizations' },
  { href: '/utilisateurs', label: 'Utilisateurs', space: 'users' },
  { href: '/retraits', label: 'Retraits', space: 'payouts' },
  { href: '/equipe', label: 'Équipe', ownerOnly: true },
];
