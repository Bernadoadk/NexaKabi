import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/http-exception.filter';
import { toApiError } from './common/errors/to-api-error';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    /**
     * Conserve le corps BRUT des requêtes.
     *
     * La signature d'un webhook porte sur les octets reçus. Un `JSON.parse`
     * suivi d'un `JSON.stringify` réordonne les clés et change les espaces :
     * la signature ne correspondrait plus, et tous les encaissements seraient
     * rejetés.
     */
    rawBody: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  const prefix = config.get('API_PREFIX', { infer: true });
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  const swaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  /**
   * Confiance au proxy d'entrée.
   *
   * Sans cette ligne, `request.ip` vaut l'adresse du proxy et le code est
   * tenté de lire `x-forwarded-for` lui-même — un en-tête que n'importe quel
   * client fixe à la valeur de son choix. Toute limitation par IP devient
   * alors décorative, et le journal d'audit enregistre l'adresse que
   * l'attaquant a bien voulu donner.
   *
   * `1` : un seul intermédiaire de confiance devant l'API. Le relever revient
   * à faire confiance à un saut de plus — donc à rendre l'usurpation possible
   * pour qui atteint ce saut.
   */
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      /**
       * HSTS : le navigateur refuse le HTTP en clair pendant deux ans, une
       * fois la première réponse HTTPS reçue. Désactivé hors production, où
       * tout est en clair sur localhost — l'activer y verrouillerait le poste
       * du développeur sur `https://localhost`.
       */
      hsts: isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
    }),
  );
  app.use(cookieParser());

  /**
   * Fichiers déposés en développement.
   *
   * Seuls les dossiers PUBLICS sont servis. `storage/verification/` porte des
   * pièces d'identité : les exposer par URL directe, fût-ce derrière un UUID
   * non devinable, contredirait la raison même pour laquelle le stockage les
   * marque privées. En production, tout passe par le stockage objet.
   */
  if (!isProduction) {
    for (const folder of ['events', 'organizations']) {
      app.useStaticAssets(join(process.cwd(), 'storage', folder), {
        prefix: `/${prefix}/media/${folder}/`,
      });
    }
  }

  app.setGlobalPrefix(prefix);
  app.useGlobalFilters(new ApiExceptionFilter());

  app.enableCors({
    origin: corsOrigins,
    // Les sessions circulent en cookies httpOnly.
    credentials: true,
  });

  // La documentation n'est jamais exposée en production.
  if (swaggerEnabled && !isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Nexa-Kabi — API')
        .setDescription(
          'API de la plateforme de billetterie et de gestion d’événements. ' +
            'Le contrat est dérivé des schémas Zod de @nexakabi/contracts.',
        )
        .setVersion('0.1.0')
        .addCookieAuth('nk_session')
        .build(),
    );
    SwaggerModule.setup(`${prefix}/docs`, app, document);
  }

  /**
   * Route inconnue.
   *
   * Nest installe par défaut un gestionnaire qui répond une page HTML Express.
   * On le remplace : aucune réponse de l'API ne doit échapper au format
   * d'erreur unique, pas même un 404.
   */
  app.enableShutdownHooks();

  // `init()` monte les routes des contrôleurs et la documentation. Le
  // gestionnaire de route inconnue doit être installé APRÈS, sinon il
  // intercepterait tout le trafic.
  await app.init();

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.setNotFoundHandler?.((request: Request, response: Response) => {
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? undefined;
    const payload = toApiError(
      new NotFoundException(`La ressource « ${request.path} » n'existe pas.`),
      requestId,
    );
    response.status(payload.statusCode).json(payload);
  });

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
