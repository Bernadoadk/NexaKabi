import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPaymentProviderActive } from '@nexakabi/contracts';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsService } from './payments.service';
import { PaymentRoutingService } from './payment-routing.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhooksController } from './webhooks.controller';
import { PaymentProviderRegistry } from './provider.registry';
import { BictorysProvider } from './providers/bictorys.provider';
import { KpayProvider } from './providers/kpay.provider';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import type { PaymentProvider } from './providers/payment-provider';
import type { Env } from '../../config/env';

/**
 * Paiements.
 *
 * ── Comment les prestataires se branchent ───────────────────────────────────
 * Chaque clé renseignée branche SON prestataire, et ils coexistent : Bictorys
 * pour la carte et le Mobile Money là où il est configuré, KPay pour le Mobile
 * Money au Bénin, en Côte d'Ivoire et au Sénégal. C'est alors l'environnement
 * du prestataire — sa clé de test ou de production — qui dit si l'argent est
 * réel : rien d'autre ne simule.
 *
 * Cette coexistence est ce qui rend une bascule POSSIBLE. Le prestataire d'un
 * moyen se change dans la configuration d'un pays, ligne par ligne, sans
 * déploiement ; et un paiement déjà lancé continue d'être interrogé chez le
 * prestataire qui l'a pris, puisqu'il porte son code.
 *
 * Le simulateur n'est enregistré que hors production ET sans aucun
 * prestataire réel : il permet de construire et de vérifier tout le produit
 * sans compte marchand, et disparaît dès qu'une clé est renseignée.
 *
 * En production sans clé, l'annuaire reste VIDE. Le tunnel affiche alors
 * honnêtement qu'aucun moyen de paiement n'est disponible, plutôt que de
 * proposer un simulateur qui n'encaisse rien.
 *
 * Le module métier ne connaît aucun prestataire par son nom : ajouter un
 * PSP consiste à déposer une implémentation ici, et à le désigner dans la
 * configuration des pays.
 */
@Module({
  imports: [forwardRef(() => OrdersModule), forwardRef(() => FinanceModule)],
  controllers: [WebhooksController],
  providers: [
    {
      provide: PaymentProviderRegistry,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

        const providers: PaymentProvider[] = [];

        if (config.get('KPAY_API_KEY', { infer: true })) {
          providers.push(new KpayProvider(config));
        }

        /**
         * Bictorys — HÉRITÉ, branché seulement s'il reste quelque chose à lire.
         *
         * Sa clé ne le remet pas en service : le routage l'écarte de tout
         * nouveau paiement (`status: 'LEGACY'`). L'enregistrer sert uniquement
         * à interroger, rembourser et expliquer ce qu'il a déjà encaissé.
         */
        if (config.get('BICTORYS_API_KEY', { infer: true })) {
          providers.push(new BictorysProvider(config));
        }

        /**
         * Le simulateur ne prend la place de personne.
         *
         * Il n'apparaît qu'en l'absence de prestataire ACTIF — une clé héritée
         * ne compte pas. Sans cette nuance, une clé Bictorys oubliée dans un
         * `.env` de développement laisserait le tunnel sans aucun moyen de
         * paiement : Bictorys est écarté du routage, et le simulateur ne
         * serait jamais enregistré pour le remplacer.
         */
        const hasActiveProvider = providers.some((provider) =>
          isPaymentProviderActive(provider.code),
        );

        if (!hasActiveProvider && !isProduction) {
          providers.push(new MockPaymentProvider(config));
        }

        return new PaymentProviderRegistry(providers);
      },
    },
    PaymentRoutingService,
    PaymentsService,
    ReconciliationService,
  ],
  exports: [PaymentsService, PaymentProviderRegistry, PaymentRoutingService, ReconciliationService],
})
export class PaymentsModule {}
