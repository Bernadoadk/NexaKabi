'use server';

import { revalidatePath } from 'next/cache';
import type {
  ApiError,
  CreateSpotlightBookingInput,
  PaymentState,
  SpotlightBooking,
  SpotlightBookingCreated,
  SpotlightVideo,
  SpotlightVideoTicket,
  StagedUpload,
} from '@nexakabi/contracts';
import { orgFetch, resolveActiveOrganizationId } from '@/lib/organizations';

/**
 * Mutations de l'onglet « Mise en avant ».
 *
 * Côté serveur, comme toutes celles de l'espace organisateur : le jeton de
 * session ne quitte jamais son cookie httpOnly. L'organisation est déduite de
 * l'événement par l'API — l'en-tête n'est qu'une indication, revérifiée.
 */

export type SpotlightActionResult<T> =
  { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string[]> };

function fail(error: ApiError): SpotlightActionResult<never> {
  return { ok: false, message: error.message, fields: error.fields };
}

const base = (eventId: string) => `/organizer/events/${encodeURIComponent(eventId)}/spotlight`;

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<SpotlightActionResult<T>> {
  const organizationId = await resolveActiveOrganizationId();

  if (!organizationId) {
    return { ok: false, message: 'Aucune organisation active. Recharge la page.' };
  }

  const result = await orgFetch<T>(organizationId, path, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  return result.ok ? { ok: true, data: result.data } : fail(result.error);
}

export async function requestSpotlightAction(
  eventId: string,
  input: CreateSpotlightBookingInput,
): Promise<SpotlightActionResult<SpotlightBookingCreated>> {
  const result = await call<SpotlightBookingCreated>(`${base(eventId)}/bookings`, {
    method: 'POST',
    body: input,
  });

  if (result.ok) revalidatePath(`/pro/evenements/${eventId}/mise-en-avant`);
  return result;
}

export async function paySpotlightAction(
  eventId: string,
  bookingId: string,
  method: string,
): Promise<SpotlightActionResult<PaymentState>> {
  return call<PaymentState>(`${base(eventId)}/bookings/${encodeURIComponent(bookingId)}/payment`, {
    method: 'POST',
    body: { method },
  });
}

export async function spotlightPaymentStateAction(
  eventId: string,
  bookingId: string,
  paymentId: string,
): Promise<SpotlightActionResult<PaymentState>> {
  return call<PaymentState>(
    `${base(eventId)}/bookings/${encodeURIComponent(bookingId)}/payments/${encodeURIComponent(paymentId)}`,
  );
}

export async function confirmSpotlightPaymentAction(
  eventId: string,
  bookingId: string,
  paymentId: string,
  providerReference: string,
): Promise<SpotlightActionResult<PaymentState>> {
  return call<PaymentState>(
    `${base(eventId)}/bookings/${encodeURIComponent(bookingId)}/payments/${encodeURIComponent(paymentId)}/confirm`,
    { method: 'POST', body: { providerReference } },
  );
}

export async function cancelSpotlightAction(
  eventId: string,
  bookingId: string,
): Promise<SpotlightActionResult<SpotlightBooking>> {
  const result = await call<SpotlightBooking>(
    `${base(eventId)}/bookings/${encodeURIComponent(bookingId)}/cancel`,
    { method: 'POST' },
  );

  if (result.ok) revalidatePath(`/pro/evenements/${eventId}/mise-en-avant`);
  return result;
}

/** Recharge l'onglet après un paiement : la place est passée en validation. */
export async function refreshSpotlightAction(eventId: string): Promise<void> {
  revalidatePath(`/pro/evenements/${eventId}/mise-en-avant`);
}

export async function spotlightVideoTicketAction(
  eventId: string,
): Promise<SpotlightActionResult<SpotlightVideoTicket>> {
  return call<SpotlightVideoTicket>(`${base(eventId)}/video-ticket`, { method: 'POST' });
}

export async function confirmSpotlightVideoAction(
  eventId: string,
  staged: StagedUpload,
): Promise<SpotlightActionResult<SpotlightVideo>> {
  return call<SpotlightVideo>(`${base(eventId)}/video`, { method: 'POST', body: staged });
}
