import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  checks: {
    database: 'up' | 'down';
  };
  timestamp: string;
  /**
   * Détails de déploiement.
   *
   * Réservés au développement : sur une sonde PUBLIQUE, annoncer la version et
   * l'environnement ne sert qu'à celui qui cherche une faille connue dans une
   * version précise. La supervision, elle, interroge depuis le réseau interne
   * et connaît déjà ce qu'elle a déployé.
   */
  version?: string;
  environment?: string;
}

@ApiTags('Système')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Sonde de disponibilité',
    description:
      "Renvoie l'état du service et de ses dépendances. Utilisée par l'orchestrateur et la supervision.",
  })
  async check(): Promise<HealthResponse> {
    const databaseUp = await this.prisma.isReachable();
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      status: databaseUp ? 'ok' : 'degraded',
      service: 'nexa-kabi-api',
      checks: {
        database: databaseUp ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
      ...(isProduction
        ? {}
        : {
            version: process.env.npm_package_version ?? '0.1.0',
            environment: process.env.NODE_ENV ?? 'development',
          }),
    };
  }
}
