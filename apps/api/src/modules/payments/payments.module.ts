import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentProviderCode } from '@nexakabi/contracts';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsService } from './payments.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhooksController } from './webhooks.controller';
import { PaymentProviderRegistry } from './provider.registry';
import { FedaPayProvider } from './providers/fedapay.provider';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import type { PaymentProvider } from './providers/payment-provider';
import type { Env } from '../../config/env';

/**
 * Moyens de paiement Mobile Money du Bénin.
 *
 * Trois opérateurs, un seul agrégateur : FedaPay les expose derrière une API
 * unique, avec un contrat unique. Contracter séparément avec chacun prendrait
 * des mois — c'est le principal risque de calendrier du projet
 * (DEVELOPMENT_ROADMAP.md §4).
 */
const MOBILE_MONEY_CODES: readonly PaymentProviderCode[] = [
  'mtn_momo',
  'moov_money',
  'celtiis_cash',
];

/**
 * Paiements.
 *
 * ── Comment le choix du fournisseur se fait ─────────────────────────────────
 * Une clé FedaPay renseignée suffit à brancher les trois opérateurs, en bac à
 * sable comme en production. Sans elle, hors production, le simulateur prend
 * leur place : le produit reste intégralement construisible et testable sans
 * dépendre d'une validation de compte marchand.
 *
 * En production sans clé, l'annuaire reste VIDE. Le tunnel affiche alors
 * honnêtement qu'aucun moyen de paiement n'est disponible, plutôt que de
 * proposer un simulateur qui n'encaisse rien.
 */
@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [WebhooksController],
  providers: [
    {
      provide: PaymentProviderRegistry,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
        const fedapayKey = config.get('FEDAPAY_SECRET_KEY', { infer: true });

        const providers: PaymentProvider[] = [];

        if (fedapayKey) {
          for (const code of MOBILE_MONEY_CODES) {
            providers.push(new FedaPayProvider(config, code));
          }
        } else if (!isProduction) {
          // Le simulateur endosse l'identité des opérateurs : l'écran de choix
          // du moyen de paiement est celui du prototype, et tout le parcours se
          // vérifie sans attendre de compte marchand.
          for (const code of MOBILE_MONEY_CODES) {
            providers.push(new MockPaymentProvider(config, code));
          }
        }

        // Le paiement de démonstration reste disponible hors production, même
        // quand FedaPay est branché : il permet de rejouer un échec ou une
        // expiration à volonté, ce que le bac à sable ne garantit pas.
        if (!isProduction) {
          providers.push(new MockPaymentProvider(config));
        }

        return new PaymentProviderRegistry(providers);
      },
    },
    PaymentsService,
    ReconciliationService,
  ],
  exports: [PaymentsService, PaymentProviderRegistry, ReconciliationService],
})
export class PaymentsModule {}
