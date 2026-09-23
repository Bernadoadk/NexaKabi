import 'server-only';
import { cookies } from 'next/headers';
import type {
  Member,
  Organization,
  OrganizationSummary,
  PayoutAccount,
  PayoutMethods,
} from '@nexakabi/contracts';
import { apiFetchAuthenticated } from './session';
import type { ApiResult } from './api';

/**
 * Accès aux organisations.
 *
 * L'organisation active est mémorisée dans un cookie lisible : elle n'a aucune
 * valeur de sécurité — l'API revérifie systématiquement l'appartenance — mais
 * elle évite de la redemander à chaque navigation.
 */

const ACTIVE_ORG_COOKIE = 'nk_org';

export async function readActiveOrganizationId(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ACTIVE_ORG_COOKIE)?.value;
}

/**
 * Organisation active, RÉSOLUE : le cookie s'il existe, sinon la première
 * organisation de la personne.
 *
 * ── Le trou que cette fonction bouche ────────────────────────────────────
 * Les relais d'API — dépôt de visuel, finances, recherche de lieu — lisaient
 * le cookie et échouaient sans lui : « Aucune organisation indiquée ». Or le
 * cookie n'est posé que par le sélecteur d'organisation ou la création
 * depuis le site, et pas de façon durable. Un organisateur qui rouvrait son
 * navigateur le lendemain perdait le dépôt d'image et ses finances, alors que
 * toutes ses pages s'affichaient — le layout, lui, retombait déjà sur la
 * première organisation. Les relais font maintenant pareil.
 *
 * Un appel à l'API quand le cookie manque, jamais quand il est là.
 */
export async function resolveActiveOrganizationId(): Promise<string | undefined> {
  const fromCookie = await readActiveOrganizationId();
  if (fromCookie) return fromCookie;

  const organizations = await listOrganizations();
  return organizations[0]?.id;
}

/** Durée du cookie d'organisation active : un an, comme le choix qu'il mémorise. */
export const ACTIVE_ORG_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Appelle l'API dans le contexte d'une organisation. */
async function orgFetch<T>(
  organizationId: string,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  return apiFetchAuthenticated<T>(path, {
    ...init,
    headers: { ...init?.headers, 'X-Organization-Id': organizationId },
  });
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const result = await apiFetchAuthenticated<OrganizationSummary[]>('/organizer/organizations');
  return result.ok ? result.data : [];
}

/**
 * Organisation active : celle du cookie si elle est toujours accessible,
 * sinon la première de la liste.
 */
export async function resolveActiveOrganization(): Promise<{
  organizations: OrganizationSummary[];
  active: OrganizationSummary | null;
}> {
  const organizations = await listOrganizations();
  const preferred = await readActiveOrganizationId();

  const active =
    organizations.find((organization) => organization.id === preferred) ?? organizations[0] ?? null;

  return { organizations, active };
}

export async function getOrganization(organizationId: string): Promise<Organization | null> {
  const result = await orgFetch<Organization>(organizationId, '/organizer/organizations/current');
  return result.ok ? result.data : null;
}

export async function listMembers(organizationId: string): Promise<Member[]> {
  const result = await orgFetch<Member[]>(
    organizationId,
    '/organizer/organizations/current/members',
  );
  return result.ok ? result.data : [];
}

export async function listPayoutAccounts(organizationId: string): Promise<PayoutAccount[]> {
  const result = await orgFetch<PayoutAccount[]>(
    organizationId,
    '/organizer/organizations/current/payout-accounts',
  );
  return result.ok ? result.data : [];
}

/**
 * Moyens de réception ouverts pour le pays de l'organisation.
 *
 * C'est cette liste — et rien d'autre — que le formulaire de compte de
 * réception propose : un organisateur béninois voit MTN et Moov, un
 * organisateur sénégalais Wave et Orange Money.
 */
export async function fetchPayoutMethods(organizationId: string): Promise<PayoutMethods> {
  const result = await orgFetch<PayoutMethods>(organizationId, '/organizer/finance/payout-methods');
  return result.ok
    ? result.data
    : { countryCode: 'BJ', currency: 'XOF', dialCode: '229', methods: [] };
}

export { ACTIVE_ORG_COOKIE, orgFetch };
