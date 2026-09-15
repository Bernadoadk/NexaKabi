import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PaymentsModule } from '../payments/payments.module';
import { TicketsModule } from '../tickets/tickets.module';
import { FinanceModule } from '../finance/finance.module';
import { CheckoutController, MyOrdersController } from './checkout.controller';
import { CheckoutTokenService } from './checkout-token.service';
import { CheckoutAccessGuard } from './guards/checkout-access.guard';
import { OrdersService } from './orders.service';
import { StockService } from './stock.service';
import type { Env } from '../../config/env';

@Module({
  imports: [
    /**
     * Jetons de checkout : secret PROPRE, jamais `JWT_SECRET`.
     *
     * ── Ce que le partage de secret rendait possible ────────────────────────
     * Un jeton de checkout est délivré à quiconque crée une commande, sans la
     * moindre authentification. Signé par la clé des sessions, il était un JWT
     * parfaitement valide pour `SessionGuard` — qui ne vérifiait ni portée, ni
     * audience. Créer une commande suffisait donc à franchir le contrôle
     * d'authentification de l'API.
     *
     * Deux secrets, et la confusion devient impossible par construction plutôt
     * que par vigilance.
     */
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('CHECKOUT_TOKEN_SECRET', { infer: true }),
        signOptions: { issuer: 'nexa-kabi', audience: 'checkout' },
      }),
    }),
    forwardRef(() => PaymentsModule),
    TicketsModule,
    // Finance ↔ Paiements ↔ Commandes forment un cycle de fichiers : selon le
    // module chargé en premier (les événements importent désormais la finance
    // pour rembourser une annulation), `FinanceModule` peut être encore
    // indéfini à cet instant. La référence différée le résout au démarrage.
    forwardRef(() => FinanceModule),
  ],
  controllers: [CheckoutController, MyOrdersController],
  providers: [OrdersService, StockService, CheckoutTokenService, CheckoutAccessGuard],
  exports: [OrdersService, StockService],
})
export class OrdersModule {}
