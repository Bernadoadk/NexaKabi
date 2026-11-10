'use client';

import type { PaymentState } from '@nexakabi/contracts';
import { openPaymentWidget } from '@/lib/payment-widget';
import {
  confirmSpotlightPaymentAction,
  paySpotlightAction,
  spotlightPaymentStateAction,
} from './actions';

/**
 * Le paiement d'une place, depuis le navigateur.
 *
 * Même règle que le tunnel d'achat : la fenêtre du prestataire ne fait que
 * RAPPORTER une transaction ; c'est le serveur qui la lit chez Kkiapay et dit
 * si la place est payée. Un « succès » annoncé ici n'est qu'une piste.
 *
 *  1. le serveur prépare la fenêtre (montant, référence de la place) ;
 *  2. la fenêtre s'ouvre ; l'organisateur paie ;
 *  3. la transaction annoncée est relue par le serveur ;
 *  4. en attente (validation sur le téléphone), on relit toutes les trois
 *     secondes — la notification du prestataire peut aussi conclure seule.
 */
export type PaymentRun =
  | { outcome: 'paid' }
  | { outcome: 'pending'; message: string }
  | { outcome: 'failed'; message: string }
  | { outcome: 'closed' };

const POLL_INTERVAL_MS = 3_000;
const POLL_LIMIT_MS = 120_000;

export async function runSpotlightPayment(
  eventId: string,
  bookingId: string,
  method: string,
  onStatus: (message: string) => void,
): Promise<PaymentRun> {
  const opened = await paySpotlightAction(eventId, bookingId, method);

  if (!opened.ok) return { outcome: 'failed', message: opened.message };
  if (opened.data.status === 'SUCCEEDED') return { outcome: 'paid' };

  const widget = opened.data.widget;
  if (!widget) {
    return {
      outcome: 'failed',
      message: 'La fenêtre de paiement n’a pas pu s’ouvrir. Réessaie dans un instant.',
    };
  }

  const paymentId = opened.data.paymentId;

  return new Promise<PaymentRun>((resolve) => {
    let finished = false;
    const finish = (run: PaymentRun) => {
      if (finished) return;
      finished = true;
      resolve(run);
    };

    const verify = async (providerReference: string) => {
      onStatus('Vérification du paiement auprès de Kkiapay…');
      const confirmed = await confirmSpotlightPaymentAction(
        eventId,
        bookingId,
        paymentId,
        providerReference,
      );

      if (!confirmed.ok) {
        finish({ outcome: 'failed', message: confirmed.message });
        return;
      }

      finish(await settle(confirmed.data));
    };

    const settle = async (state: PaymentState): Promise<PaymentRun> => {
      if (state.status === 'SUCCEEDED') return { outcome: 'paid' };
      if (state.status === 'FAILED' || state.status === 'EXPIRED' || state.status === 'CANCELLED') {
        return {
          outcome: 'failed',
          message: state.failureReason ?? 'Le paiement n’a pas abouti. Tu peux réessayer.',
        };
      }

      return poll();
    };

    const poll = async (): Promise<PaymentRun> => {
      const started = Date.now();
      onStatus('Paiement en cours de validation…');

      while (Date.now() - started < POLL_LIMIT_MS) {
        await new Promise((wait) => setTimeout(wait, POLL_INTERVAL_MS));
        // Une autre annonce de la fenêtre a déjà conclu : inutile de relire.
        if (finished) return { outcome: 'closed' };

        const state = await spotlightPaymentStateAction(eventId, bookingId, paymentId);

        if (!state.ok) continue;
        if (state.data.status === 'SUCCEEDED') return { outcome: 'paid' };
        if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(state.data.status)) {
          return {
            outcome: 'failed',
            message: state.data.failureReason ?? 'Le paiement n’a pas abouti. Tu peux réessayer.',
          };
        }
      }

      return {
        outcome: 'pending',
        message:
          'Ton paiement est encore en cours de validation. Si tu l’as validé sur ton téléphone, la confirmation arrivera d’elle-même : recharge la page dans un instant.',
      };
    };

    void openPaymentWidget(widget, {
      onSuccess: (reference) => void verify(reference),
      onFailed: () => onStatus('Le paiement n’a pas abouti. Tu peux réessayer dans la fenêtre.'),
      onPending: (reference) => void verify(reference),
      onClose: () => {
        // Fenêtre refermée sans succès annoncé : un paiement validé sur le
        // téléphone peut encore arriver — on relit une fois avant de conclure.
        window.setTimeout(async () => {
          if (finished) return;
          const state = await spotlightPaymentStateAction(eventId, bookingId, paymentId);
          finish(
            state.ok && state.data.status === 'SUCCEEDED'
              ? { outcome: 'paid' }
              : { outcome: 'closed' },
          );
        }, 800);
      },
    }).catch(() => {
      finish({
        outcome: 'failed',
        message: 'La fenêtre de paiement est injoignable. Vérifie ta connexion et réessaie.',
      });
    });
  });
}
