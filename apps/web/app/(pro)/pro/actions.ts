'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import type {
  ApiError,
  Organization,
  OrganizationSummary,
  PayoutAccount,
  VerificationRequestDetail,
} from '@nexakabi/contracts';
import { apiFetchAuthenticated } from '@/lib/session';
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_MAX_AGE, orgFetch } from '@/lib/organizations';

/**
 * Mutations de l'espace organisateur.
 *
 * Les Server Actions s'exécutent côté serveur : le jeton de session reste dans
 * son cookie httpOnly et ne traverse jamais le navigateur.
 */

export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string[]> };

function toFailure(error: ApiError): ActionResult<never> {
  return { ok: false, message: error.message, fields: error.fields };
}

export async function createOrganizationAction(
  formData: FormData,
): Promise<ActionResult<Organization>> {
  const payload = {
    name: String(formData.get('name') ?? '').trim(),
    type: String(formData.get('type') ?? 'INDIVIDUAL'),
    description: emptyToUndefined(formData.get('description')),
    cityName: emptyToUndefined(formData.get('cityName')),
    address: emptyToUndefined(formData.get('address')),
    phone: emptyToUndefined(formData.get('phone')),
    whatsapp: emptyToUndefined(formData.get('whatsapp')),
    email: emptyToUndefined(formData.get('email')),
  };

  const result = await apiFetchAuthenticated<Organization>('/organizer/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!result.ok) return toFailure(result.error);

  // La nouvelle organisation devient active.
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, result.data.id, {
    path: '/',
    sameSite: 'lax',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });

  revalidatePath('/pro', 'layout');
  return { ok: true, data: result.data };
}

/**
 * Met à jour l'identité et les coordonnées de l'organisation active.
 *
 * `PATCH /organizer/organizations/current` existait déjà côté API — seule la
 * page qui l'appelle manquait (`finances/page.tsx` renvoyait vers « les
 * paramètres de ton organisation » sans que cet écran existe).
 */
export async function updateOrganizationAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<Organization>> {
  const payload = {
    name: String(formData.get('name') ?? '').trim(),
    legalName: emptyToUndefined(formData.get('legalName')),
    countryCode: emptyToUndefined(formData.get('countryCode')),
    cityName: emptyToUndefined(formData.get('cityName')),
    address: emptyToUndefined(formData.get('address')),
    description: emptyToUndefined(formData.get('description')),
    phone: emptyToUndefined(formData.get('phone')),
    whatsapp: emptyToUndefined(formData.get('whatsapp')),
    email: emptyToUndefined(formData.get('email')),
    website: emptyToUndefined(formData.get('website')),
    facebook: emptyToUndefined(formData.get('facebook')),
    instagram: emptyToUndefined(formData.get('instagram')),
    tiktok: emptyToUndefined(formData.get('tiktok')),
  };

  const result = await orgFetch<Organization>(organizationId, '/organizer/organizations/current', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro', 'layout');
  return { ok: true, data: result.data };
}

/**
 * Logo ou bannière — déposés puis enregistrés aussitôt, sans repasser par le
 * reste du formulaire : `PATCH .../current` ignore tout champ absent du
 * corps (voir `OrganizationsService.update`), donc envoyer CE seul champ ne
 * touche à rien d'autre.
 */
export async function updateOrganizationLogoAction(
  organizationId: string,
  logoUrl: string | null,
): Promise<ActionResult<Organization>> {
  const result = await orgFetch<Organization>(organizationId, '/organizer/organizations/current', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logoUrl }),
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro', 'layout');
  return { ok: true, data: result.data };
}

export async function updateOrganizationCoverAction(
  organizationId: string,
  coverUrl: string | null,
): Promise<ActionResult<Organization>> {
  const result = await orgFetch<Organization>(organizationId, '/organizer/organizations/current', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coverUrl }),
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro', 'layout');
  return { ok: true, data: result.data };
}

export async function switchOrganizationAction(organizationId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, organizationId, {
    path: '/',
    sameSite: 'lax',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });
  revalidatePath('/pro', 'layout');
}

/** Ajoute un compte de retrait (Mobile Money ou bancaire). */
export async function addPayoutAccountAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<PayoutAccount>> {
  const type = String(formData.get('type') ?? 'MOBILE_MONEY');

  const payload = {
    type,
    methodCode: String(formData.get('methodCode') ?? ''),
    accountNumber: String(formData.get('accountNumber') ?? '').trim(),
    accountHolderName: String(formData.get('accountHolderName') ?? '').trim(),
    bankName: emptyToUndefined(formData.get('bankName')),
    isDefault: formData.get('isDefault') === 'on',
  };

  const result = await orgFetch<PayoutAccount>(
    organizationId,
    '/organizer/organizations/current/payout-accounts',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/parametres');
  return { ok: true, data: result.data };
}

export async function inviteMemberAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  const role = String(formData.get('role') ?? 'MANAGER');
  const contact = String(formData.get('contact') ?? '').trim();
  const isEmail = contact.includes('@');

  const scopedEventIds = String(formData.get('scopedEventIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const result = await orgFetch<{ token: string; expiresAt: string }>(
    organizationId,
    '/organizer/organizations/current/invitations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [isEmail ? 'email' : 'phone']: contact,
        role,
        scopedEventIds,
        gate: emptyToUndefined(formData.get('gate')),
      }),
    },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/equipe');
  return { ok: true, data: result.data };
}

export async function removeMemberAction(
  organizationId: string,
  memberId: string,
): Promise<ActionResult> {
  const result = await orgFetch(
    organizationId,
    `/organizer/organizations/current/members/${memberId}`,
    { method: 'DELETE' },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/equipe');
  return { ok: true, data: undefined };
}

export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<OrganizationSummary>> {
  const result = await apiFetchAuthenticated<OrganizationSummary>(`/invitations/${token}/accept`, {
    method: 'POST',
  });

  if (!result.ok) return toFailure(result.error);

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, result.data.id, {
    path: '/',
    sameSite: 'lax',
    maxAge: ACTIVE_ORG_COOKIE_MAX_AGE,
  });

  revalidatePath('/pro', 'layout');
  return { ok: true, data: result.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vérification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soumet le dossier de vérification.
 *
 * `POST /organizer/organizations/current/verification` existait déjà côté
 * API : c'est la page qui l'appelle qui manquait — un organisateur n'avait,
 * jusqu'ici, aucun moyen de déposer son dossier dans le produit qui tourne.
 */
export async function submitVerificationAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<VerificationRequestDetail>> {
  const result = await orgFetch<VerificationRequestDetail>(
    organizationId,
    '/organizer/organizations/current/verification',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactName: String(formData.get('contactName') ?? '').trim(),
        contactPhone: String(formData.get('contactPhone') ?? '').trim(),
      }),
    },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/verification');
  return { ok: true, data: result.data };
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Événements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée un brouillon d'événement.
 *
 * Seul le titre est demandé : l'assistant complète le reste étape par étape, et
 * le brouillon est conservé si l'organisateur ferme l'onglet.
 */
export async function createEventAction(
  organizationId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const result = await orgFetch<{ id: string; slug: string }>(organizationId, '/organizer/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: String(formData.get('title') ?? '').trim() }),
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/evenements');
  return { ok: true, data: result.data };
}

export async function publishEventAction(
  organizationId: string,
  eventId: string,
): Promise<ActionResult<{ missing: string[] }>> {
  const result = await orgFetch<{ missing: string[] }>(
    organizationId,
    `/organizer/events/${eventId}/publish`,
    { method: 'POST' },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/evenements');
  return { ok: true, data: { missing: result.data.missing } };
}

/**
 * Annule un événement publié.
 *
 * `POST .../cancel` existait déjà côté API et déclenche déjà la notification
 * aux détenteurs de billets (« tu seras remboursé ») — seul le bouton, côté
 * assistant, manquait pour que l'action soit atteignable autrement qu'en
 * tapant l'URL.
 */
export async function cancelEventAction(
  organizationId: string,
  eventId: string,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(organizationId, `/organizer/events/${eventId}/cancel`, {
    method: 'POST',
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/evenements');
  revalidatePath(`/pro/evenements/${eventId}`);
  return { ok: true, data: result.data };
}

/** Enregistre une étape de l'assistant. Le brouillon survit à la fermeture de l'onglet. */
export async function saveEventStepAction(
  organizationId: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(organizationId, `/organizer/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath(`/pro/evenements/${eventId}`);
  return { ok: true, data: result.data };
}

export async function addTicketTypeAction(
  organizationId: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(organizationId, `/organizer/events/${eventId}/ticket-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath(`/pro/evenements/${eventId}`);
  return { ok: true, data: result.data };
}

/** Modifie un type de billet existant — `PATCH .../ticket-types/:id` existait
 *  déjà côté API : seule l'édition (par opposition à créer/supprimer) manquait
 *  côté écran. */
export async function updateTicketTypeAction(
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(
    organizationId,
    `/organizer/events/${eventId}/ticket-types/${ticketTypeId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath(`/pro/evenements/${eventId}`);
  return { ok: true, data: result.data };
}

export async function removeTicketTypeAction(
  organizationId: string,
  eventId: string,
  ticketTypeId: string,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(
    organizationId,
    `/organizer/events/${eventId}/ticket-types/${ticketTypeId}`,
    { method: 'DELETE' },
  );

  if (!result.ok) return toFailure(result.error);

  revalidatePath(`/pro/evenements/${eventId}`);
  return { ok: true, data: result.data };
}

/**
 * Dépublie un événement — retour au brouillon.
 *
 * L'API refuse dès qu'un billet a été vendu (voir `EventsService.unpublish`) ;
 * le message qu'elle renvoie explique alors qu'il faut annuler, pas retirer.
 */
export async function unpublishEventAction(
  organizationId: string,
  eventId: string,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(organizationId, `/organizer/events/${eventId}/unpublish`, {
    method: 'POST',
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/evenements');
  revalidatePath(`/pro/evenements/${eventId}`);
  return { ok: true, data: result.data };
}

/** Supprime (logiquement) un événement. Refusé par l'API s'il est en ligne avec des ventes. */
export async function deleteEventAction(
  organizationId: string,
  eventId: string,
): Promise<ActionResult<unknown>> {
  const result = await orgFetch(organizationId, `/organizer/events/${eventId}`, {
    method: 'DELETE',
  });

  if (!result.ok) return toFailure(result.error);

  revalidatePath('/pro/evenements');
  return { ok: true, data: result.data };
}
