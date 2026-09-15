import 'server-only';
import type { Ticket, TicketGroup, TicketTab } from '@nexakabi/contracts';
import { apiFetch, type ApiResult } from './api';
import { apiFetchAuthenticated } from './session';

/**
 * Accès aux billets.
 *
 * Deux portes distinctes, et c'est délibéré : celle du compte, protégée par la
 * session, et celle du lien public, ouverte sans compte. Un billet introuvable
 * à la porte de l'événement est un échec produit — la redondance est ici une
 * décision, pas un accident (voir PROJECT_ANALYSIS.md §6.2).
 */

export async function fetchMyTickets(tab?: TicketTab): Promise<TicketGroup[]> {
  const query = tab ? `?tab=${tab}` : '';
  const result = await apiFetchAuthenticated<TicketGroup[]>(`/me/tickets${query}`);

  // Une liste vide vaut mieux qu'une page en erreur : l'écran affichera son
  // état vide, qui dit quoi faire ensuite.
  return result.ok ? result.data : [];
}

export function fetchMyTicket(id: string): Promise<ApiResult<Ticket>> {
  return apiFetchAuthenticated<Ticket>(`/me/tickets/${encodeURIComponent(id)}`);
}

/** Billet atteint par son lien public. Aucune session requise. */
export function fetchTicketByToken(token: string): Promise<ApiResult<Ticket>> {
  return apiFetch<Ticket>(`/t/${encodeURIComponent(token)}`);
}
