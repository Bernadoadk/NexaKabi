/**
 * Autorisation : matrice de permissions des rôles d'organisation.
 *
 * Fondation de sécurité du produit. Toute vérification d'accès à une ressource
 * d'organisation passe par `hasOrgPermission` — jamais par une comparaison de
 * rôle en dur dans un contrôleur.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §5.2 pour la table complète et sa
 * justification, et docs/PROJECT_ANALYSIS.md §2.5 pour les libellés produit.
 */

import type { OrgRole } from './enums.js';

export const ORG_PERMISSIONS = [
  'organization:read',
  'organization:update',
  'organization:delete',
  'organization:transfer',
  'organization:verify_submit',
  'member:read',
  'member:invite',
  'member:remove',
  'event:create',
  'event:read',
  'event:update',
  'event:publish',
  'event:cancel',
  'ticket_type:manage',
  'attendee:read',
  'attendee:export',
  'checkin:scan',
  'checkin:override',
  'stats:read',
  'finance:read',
  'payout:request',
  'payout_account:manage',
  'promo:manage',
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

/**
 * Portée de lecture des données participant selon le rôle.
 * - `full`      : coordonnées complètes
 * - `minimal`   : nom, catégorie, référence tronquée, statut d'entrée — c'est
 *                 exactement ce que contient le carnet mis en cache sur le
 *                 téléphone du contrôleur, aussi par protection en cas de perte
 * - `aggregate` : volumétrie et agrégats, sans liste nominative
 * - `none`
 */
export type AttendeeScope = 'full' | 'minimal' | 'aggregate' | 'none';

interface RoleDefinition {
  readonly permissions: ReadonlySet<OrgPermission>;
  readonly attendeeScope: AttendeeScope;
  /** Vrai si la portée du rôle est un ou plusieurs événements, pas l'organisation. */
  readonly isEventScoped: boolean;
  /** Phrase affichée à l'utilisateur. Le prototype refuse les matrices de cases à cocher. */
  readonly label: string;
  readonly description: string;
}

const OWNER_PERMISSIONS: readonly OrgPermission[] = ORG_PERMISSIONS;

const ADMIN_PERMISSIONS: readonly OrgPermission[] = ORG_PERMISSIONS.filter(
  (permission) => permission !== 'organization:delete' && permission !== 'organization:transfer',
);

const MANAGER_PERMISSIONS: readonly OrgPermission[] = [
  'organization:read',
  'member:read',
  'event:create',
  'event:read',
  'event:update',
  'event:publish',
  'ticket_type:manage',
  'attendee:read',
  'attendee:export',
  'checkin:scan',
  'checkin:override',
  'stats:read',
  'promo:manage',
];

const SCANNER_PERMISSIONS: readonly OrgPermission[] = [
  'organization:read',
  'event:read',
  'attendee:read',
  'checkin:scan',
];

const ANALYST_PERMISSIONS: readonly OrgPermission[] = [
  'organization:read',
  'member:read',
  'event:read',
  'attendee:read',
  'attendee:export',
  'stats:read',
  'finance:read',
];

export const ORG_ROLE_DEFINITIONS: Readonly<Record<OrgRole, RoleDefinition>> = {
  OWNER: {
    permissions: new Set(OWNER_PERMISSIONS),
    attendeeScope: 'full',
    isEventScoped: false,
    label: 'Propriétaire',
    description:
      "Peut tout faire, y compris retirer l'argent, transférer et supprimer l'organisation.",
  },
  ADMIN: {
    permissions: new Set(ADMIN_PERMISSIONS),
    attendeeScope: 'full',
    isEventScoped: false,
    label: 'Administrateur',
    description: "Peut tout faire, y compris retirer l'argent.",
  },
  MANAGER: {
    permissions: new Set(MANAGER_PERMISSIONS),
    attendeeScope: 'full',
    isEventScoped: false,
    label: 'Gestionnaire',
    description:
      'Crée et gère les événements, les billets, les participants. Ne voit pas les retraits.',
  },
  SCANNER: {
    permissions: new Set(SCANNER_PERMISSIONS),
    attendeeScope: 'minimal',
    isEventScoped: true,
    label: 'Contrôleur',
    description:
      "Voit uniquement le scanner de l'événement auquel il est assigné. Aucun accès aux données financières ni aux coordonnées complètes.",
  },
  ANALYST: {
    permissions: new Set(ANALYST_PERMISSIONS),
    attendeeScope: 'aggregate',
    isEventScoped: false,
    label: 'Analyste',
    description:
      'Lecture seule sur les statistiques et les finances. Pour un comptable ou un sponsor.',
  },
};

/**
 * Vérifie qu'un rôle d'organisation porte une permission.
 *
 * ⚠️ Ne vérifie PAS la portée événement : pour un rôle `isEventScoped`, l'appelant
 * doit en plus contrôler que l'événement visé figure dans `scopedEventIds`.
 * Utiliser `canActOnEvent` pour la vérification complète.
 */
export function hasOrgPermission(role: OrgRole, permission: OrgPermission): boolean {
  return ORG_ROLE_DEFINITIONS[role].permissions.has(permission);
}

/**
 * Vérification complète pour une action portant sur un événement précis :
 * permission ET portée.
 */
export function canActOnEvent(
  role: OrgRole,
  permission: OrgPermission,
  eventId: string,
  scopedEventIds: readonly string[],
): boolean {
  if (!hasOrgPermission(role, permission)) return false;
  if (!ORG_ROLE_DEFINITIONS[role].isEventScoped) return true;
  return scopedEventIds.includes(eventId);
}

export function getAttendeeScope(role: OrgRole): AttendeeScope {
  return ORG_ROLE_DEFINITIONS[role].attendeeScope;
}

export function isEventScopedRole(role: OrgRole): boolean {
  return ORG_ROLE_DEFINITIONS[role].isEventScoped;
}

/** Liste ordonnée des rôles assignables lors d'une invitation (le propriétaire ne s'invite pas). */
export const ASSIGNABLE_ORG_ROLES: readonly OrgRole[] = ['ADMIN', 'MANAGER', 'SCANNER', 'ANALYST'];
