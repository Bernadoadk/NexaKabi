import 'server-only';
import { cookies } from 'next/headers';
import type { Order, PaymentMethod, PaymentState, Ticket } from '@nexakabi/contracts';
import { apiFetch, type ApiResult } from './api';
import { readAccessToken } from './session';

/**
 * Accès à une commande en cours.
 *
 * Le tunnel fonctionne sans compte : l'autorisation vient d'un jeton émis à la
 * création de la commande, conservé en cookie httpOnly. Il ne franchit jamais
 * la frontière du navigateur — comme les jetons de session.
 */
export const CHECKOUT_COOKIE = 'nk_checkout';
export const CHECKOUT_TOKEN_HEADER = 'x-checkout-token';

/** Durée de vie du cookie : la réservation dure 30 minutes, on garde une marge. */
const CHECKOUT_COOKIE_MAX_AGE = 45 * 60;

export const checkoutCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: CHECKOUT_COOKIE_MAX_AGE,
};

export async function readCheckoutToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CHECKOUT_COOKIE)?.value;
}

/**
 * En-têtes d'autorisation du tunnel.
 *
 * Les deux portes coexistent : le jeton de checkout pour l'acheteur sans
 * compte, la session pour celui qui reprend un paiement depuis « Mes
 * commandes ».
 */
export async function checkoutHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  const checkoutToken = await readCheckoutToken();
  if (checkoutToken) headers[CHECKOUT_TOKEN_HEADER] = checkoutToken;

  const accessToken = await readAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return headers;
}

export async function fetchOrder(reference: string): Promise<ApiResult<Order>> {
  return apiFetch<Order>(`/checkout/orders/${encodeURIComponent(reference)}`, {
    headers: await checkoutHeaders(),
  });
}

export interface PaymentMethodsResponse {
  methods: PaymentMethod[];
  notice: string;
}

export async function fetchPaymentMethods(): Promise<PaymentMethodsResponse> {
  const result = await apiFetch<PaymentMethodsResponse>('/checkout/payment-methods', {
    revalidate: 60,
  });

  // Une liste vide vaut mieux qu'une page en erreur : l'écran affichera alors
  // qu'aucun moyen de paiement n'est disponible, ce qui est l'information utile.
  return result.ok ? result.data : { methods: [], notice: '' };
}

/** Dernier paiement d'une commande, pour reprendre un écran d'attente interrompu. */
export async function fetchPaymentState(
  reference: string,
  paymentId: string,
): Promise<ApiResult<PaymentState>> {
  return apiFetch<PaymentState>(
    `/checkout/orders/${encodeURIComponent(reference)}/payments/${encodeURIComponent(paymentId)}`,
    { headers: await checkoutHeaders() },
  );
}

/**
 * Billets d'une commande, servis au porteur du jeton de checkout.
 *
 * C'est ce qui permet à l'écran de confirmation de livrer les billets tout de
 * suite, sans exiger de compte : « du lien WhatsApp au billet en poche ».
 */
export async function fetchOrderTickets(reference: string): Promise<Ticket[]> {
  const result = await apiFetch<Ticket[]>(
    `/checkout/orders/${encodeURIComponent(reference)}/tickets`,
    { headers: await checkoutHeaders() },
  );

  return result.ok ? result.data : [];
}
