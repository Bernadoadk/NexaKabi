import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env';
import { PrismaModule } from './infra/prisma/prisma.module';
import { SchedulingModule } from './infra/scheduling/scheduling.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { EventsModule } from './modules/events/events.module';
import { MediaModule } from './modules/media/media.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { CheckInModule } from './modules/checkin/checkin.module';
import { AdminModule } from './modules/admin/admin.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PlacesModule } from './modules/places/places.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Échec rapide : le service refuse de démarrer si la configuration est incomplète.
      validate: validateEnv,
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
        // Ne jamais journaliser de secret ni de donnée personnelle en clair.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.code',
            'req.body.password',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
      },
    }),

    /**
     * Limitation de débit par défaut.
     *
     * L'authentification par OTP applique en plus ses propres limites, par
     * numéro et par IP. Le garde qui APPLIQUE tout cela est déclaré plus bas :
     * sans lui, `ThrottlerModule` n'expose qu'un service que personne
     * n'appelle, et les décorateurs `@Throttle()` des contrôleurs ne
     * produisent aucun effet.
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),

    PrismaModule,
    SchedulingModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    OrganizationsModule,
    EventsModule,
    MediaModule,
    OrdersModule,
    PaymentsModule,
    TicketsModule,
    CheckInModule,
    FinanceModule,
    PlacesModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    /**
     * Garde de limitation de débit, GLOBAL et déclaré en premier.
     *
     * ── Pourquoi il est ici et pas dans un module métier ────────────────────
     * `ThrottlerModule.forRoot()` configure la limite ; il ne l'applique pas.
     * Tant que ce garde n'est pas enregistré, chaque `@Throttle()` posé sur un
     * contrôleur est purement décoratif — un code à six chiffres se force alors
     * à la vitesse du réseau, et une boucle sur la création de commandes épuise
     * le stock d'un événement sans jamais payer.
     *
     * Déclaré AVANT les gardes d'authentification (résolus dans `AuthModule`)
     * pour que le plafond s'applique même aux requêtes qui échoueront ensuite :
     * refuser tôt coûte moins cher que refuser tard.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
