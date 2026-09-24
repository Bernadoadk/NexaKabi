'use client';

import type { KkiapayWidget, PaymentWidget } from '@nexakabi/contracts';

/**
 * Fenêtres de paiement des prestataires, côté navigateur.
 *
 * ── Ce que ce module ne fait PAS ────────────────────────────────────────────
 * Il ne confirme aucun paiement. Il ouvre la fenêtre du prestataire avec la
 * configuration reçue de l'API — clé publique et mode bac à sable compris,
 * jamais choisis ici — et rapporte à la page la RÉFÉRENCE de la transaction
 * que la fenêtre annonce. La page la transmet au serveur, qui la lit chez le
 * prestataire : c'est cette lecture, et elle seule, qui émet des billets.
 * Un « succès » vu d'ici peut être fabriqué par n'importe quel script de la
 * page ; il n'est qu'une piste.
 *
 * Un lanceur par prestataire à widget — Kkiapay aujourd'hui.
 */

export interface WidgetHandlers {
  /** La fenêtre annonce un paiement réussi, avec la référence de sa transaction. */
  onSuccess(providerReference: string): void;
  /** La fenêtre annonce un échec, avec la référence de la transaction si elle existe. */
  onFailed(providerReference: string | null): void;
  /** Une transaction est en cours de validation (demande envoyée sur le téléphone). */
  onPending(providerReference: string): void;
  /** L'acheteur a refermé la fenêtre. */
  onClose(): void;
}

export async function openPaymentWidget(
  widget: PaymentWidget,
  handlers: WidgetHandlers,
): Promise<void> {
  switch (widget.provider) {
    case 'kkiapay':
      return openKkiapay(widget, handlers);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kkiapay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le SDK JavaScript officiel, à l'adresse que donne sa documentation
 * (docs.kkiapay.me → SDK Javascript). Il ouvre la fenêtre dans un cadre servi
 * par `widget-v3.kkiapay.me` — deux origines que la politique de sécurité du
 * site autorise nommément.
 */
const KKIAPAY_SDK_URL = 'https://cdn.kkiapay.me/k.js';

interface KkiapayListenerData {
  transactionId?: unknown;
}

/**
 * Fonctions que le SDK installe sur `window`. `openKkiapayWidget`,
 * `addSuccessListener` et `addFailedListener` sont documentées ; les autres
 * figurent dans les définitions de type du SDK officiel, et ne sont utilisées
 * que si elles existent.
 */
interface KkiapaySdk {
  openKkiapayWidget(config: Record<string, unknown>): void;
  addSuccessListener(callback: (data: KkiapayListenerData) => void): void;
  addFailedListener(callback: (data: KkiapayListenerData) => void): void;
  addPendingListener?(callback: (data: KkiapayListenerData) => void): void;
  addKkiapayCloseListener?(callback: () => void): void;
  closeKkiapayWidget?(): void;
}

let sdkLoading: Promise<KkiapaySdk> | null = null;

function readSdk(): KkiapaySdk | null {
  const candidate = window as unknown as Partial<KkiapaySdk>;

  return typeof candidate.openKkiapayWidget === 'function' &&
    typeof candidate.addSuccessListener === 'function' &&
    typeof candidate.addFailedListener === 'function'
    ? (candidate as KkiapaySdk)
    : null;
}

function loadKkiapaySdk(): Promise<KkiapaySdk> {
  const ready = readSdk();
  if (ready) return Promise.resolve(ready);

  if (!sdkLoading) {
    sdkLoading = new Promise<KkiapaySdk>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = KKIAPAY_SDK_URL;
      script.async = true;

      script.onload = () => {
        const sdk = readSdk();

        if (sdk) {
          resolve(sdk);
        } else {
          sdkLoading = null;
          reject(new Error('Le SDK Kkiapay est incomplet.'));
        }
      };

      script.onerror = () => {
        // Réseau coupé, bloqueur : on retire la balise pour qu'un nouvel
        // essai recharge vraiment le script.
        script.remove();
        sdkLoading = null;
        reject(new Error('Le SDK Kkiapay est injoignable.'));
      };

      document.head.appendChild(script);
    });
  }

  return sdkLoading;
}

function transactionIdOf(data: KkiapayListenerData | undefined): string | null {
  const value = data?.transactionId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function openKkiapay(widget: KkiapayWidget, handlers: WidgetHandlers): Promise<void> {
  const sdk = await loadKkiapaySdk();

  // Le SDK garde UN écouteur par événement : chaque ouverture remplace ceux
  // de la précédente, et une fenêtre rouverte ne rapporte qu'une fois.
  let settled = false;

  sdk.addSuccessListener((data) => {
    const reference = transactionIdOf(data);
    if (settled || !reference) return;

    settled = true;
    sdk.closeKkiapayWidget?.();
    handlers.onSuccess(reference);
  });

  sdk.addFailedListener((data) => {
    if (settled) return;

    // Pas de fermeture ici : la fenêtre propose elle-même de réessayer, sur
    // le même paiement. La page, elle, affiche la cause dès que le serveur
    // l'a lue chez Kkiapay.
    handlers.onFailed(transactionIdOf(data));
  });

  sdk.addPendingListener?.((data) => {
    const reference = transactionIdOf(data);
    if (!settled && reference) handlers.onPending(reference);
  });

  sdk.addKkiapayCloseListener?.(() => {
    handlers.onClose();
  });

  // Les attributs documentés du SDK, tels que l'API les a préparés.
  sdk.openKkiapayWidget({
    amount: widget.amount,
    key: widget.key,
    sandbox: widget.sandbox,
    partnerId: widget.partnerId,
    data: widget.data,
    paymentmethod: widget.paymentmethod,
    ...(widget.countries ? { countries: widget.countries } : {}),
    ...(widget.name ? { name: widget.name } : {}),
    ...(widget.email ? { email: widget.email } : {}),
    position: widget.position,
    ...(widget.theme ? { theme: widget.theme } : {}),
  });
}
