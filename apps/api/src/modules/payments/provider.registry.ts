import { BadRequestException, Injectable } from '@nestjs/common';
import type { PaymentProviderCode } from '@nexakabi/contracts';
import { PaymentProvider } from './providers/payment-provider';

/**
 * Annuaire des moyens de paiement branchés.
 *
 * Le reste du code ne connaît jamais un opérateur par son nom : il demande
 * celui dont le code correspond. Brancher Wave ou Orange Money consiste à
 * déposer une implémentation de plus dans le module — aucun service métier,
 * aucun écran à modifier.
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: ReadonlyMap<PaymentProviderCode, PaymentProvider>;

  constructor(providers: PaymentProvider[]) {
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
   * Renvoie le fournisseur demandé.
   *
   * Échoue explicitement plutôt que de renvoyer `undefined` : un moyen de
   * paiement absent doit se voir au moment du clic, pas produire un plantage
   * trois appels plus loin.
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
