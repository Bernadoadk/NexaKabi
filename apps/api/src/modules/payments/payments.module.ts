import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FinanceModule } from '../finance/finance.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsService } from './payments.service';
import { PaymentRoutingService } from './payment-routing.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhooksController } from './webhooks.controller';
import { PaymentProviderRegistry } from './provider.registry';
import { BictorysProvider } from './providers/bictorys.provider';
import { KkiapayProvider } from './providers/kkiapay.provider';
import type { PaymentProvider } from './providers/payment-provider';
import type { Env } from '../../config/env';

/**
 * Paiements.
 *
 * ── Comment les prestataires se branchent ───────────────────────────────────
 * Chaque clé renseignée branche SON prestataire, et ils coexistent. En V1,
 * Kkiapay est le seul prestataire ACTIF — Mobile Money et carte, en francs
 * CFA ; Bictorys, hérité, n'est branché que pour relire ce qu'il a déjà
 * encaissé.
 *
 * ── Aucun paiement simulé ───────────────────────────────────────────────────
 * Tout paiement passe par un vrai prestataire. La seule façon d'essayer sans
 * argent réel est celle du prestataire lui-même : ses clés de bac à sable
 * (`KKIAPAY_SANDBOX=true`, obligatoire hors production). Sans clé Kkiapay,
 * aucun prestataire actif n'est branché — en développement comme en
 * production — et le tunnel dit honnêtement qu'aucun moyen de paiement n'est
 * disponible.
 *
 * Cette coexistence est ce qui rend une bascule POSSIBLE. Le prestataire d'un
 * moyen se change dans la configuration d'un pays, ligne par ligne, sans
 * déploiement ; et un paiement déjà lancé continue d'être interrogé chez le
 * prestataire qui l'a pris, puisqu'il porte son code.
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
        const providers: PaymentProvider[] = [];

        // Les quatre valeurs Kkiapay vont ensemble — `config/env.ts` refuse de
        // démarrer sur une configuration partielle.
        if (config.get('KKIAPAY_PUBLIC_KEY', { infer: true })) {
          providers.push(new KkiapayProvider(config));
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
