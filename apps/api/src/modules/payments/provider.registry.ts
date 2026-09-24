import { BadRequestException, Injectable } from '@nestjs/common';
import type { PaymentProviderCode } from '@nexakabi/contracts';
import { PaymentProvider } from './providers/payment-provider';

/**
 * Annuaire des PRESTATAIRES branchés.
 *
 * Indexé par prestataire — `kkiapay`, `bictorys` — et non par moyen de paiement :
 * un prestataire en traite plusieurs, dans plusieurs pays. Qui traite quel
 * moyen où est une question de configuration, tranchée par
 * `PaymentRoutingService` ; ici, on ne fait que retrouver une implémentation
 * par son code.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: ReadonlyMap<PaymentProviderCode, PaymentProvider>;

  constructor(providers: PaymentProvider[]) {
    for (const provider of providers) {
      // Une capacité annoncée sans méthode pour la fournir a déjà existé : le
      // registre disait « sait verser », et rien ne versait. Refuser de
      // démarrer est le seul moment où l'écart se voit avant un vrai retrait.
      if (provider.capabilities.payout && (!provider.payout || !provider.getPayoutStatus)) {
        throw new Error(
          `Le prestataire ${provider.code} annonce savoir verser sans implémenter payout() et getPayoutStatus().`,
        );
      }

      // Même garde pour une fenêtre de paiement : sans `widget()`, un paiement
      // lancé ne pourrait plus être repris après une fenêtre fermée.
      const usesWidget = (['MOBILE_MONEY', 'CARD'] as const).some(
        (kind) => provider.checkoutFlow(kind) === 'widget',
      );

      if (usesWidget && !provider.widget) {
        throw new Error(
          `Le prestataire ${provider.code} se valide dans sa fenêtre de paiement sans implémenter widget().`,
        );
      }
    }

    this.providers = new Map(providers.map((provider) => [provider.code, provider]));
  }

  /** Codes réellement disponibles, dans l'ordre d'enregistrement. */
  get availableCodes(): PaymentProviderCode[] {
    return [...this.providers.keys()];
  }

  has(code: PaymentProviderCode): boolean {
    return this.providers.has(code);
  }

  /**
   * Renvoie le prestataire demandé.
   *
   * Échoue explicitement plutôt que de renvoyer `undefined` : un prestataire
   * absent doit se voir au moment du clic, pas produire un plantage trois
   * appels plus loin.
   */
  get(code: PaymentProviderCode): PaymentProvider {
    const provider = this.providers.get(code);

    if (!provider) {
      throw new BadRequestException(
        "Ce moyen de paiement n'est pas disponible pour le moment. Choisis-en un autre.",
      );
    }

    return provider;
  }
}
