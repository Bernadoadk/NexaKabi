import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { ACCESS_TOKEN_TTL_SECONDS } from '@nexakabi/contracts';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './domain/otp.service';
import { TokenService } from './domain/token.service';
import { AuthRepository } from './repositories/auth.repository';
import { SessionGuard } from './guards/session.guard';
import { GlobalRoleGuard } from './guards/global-role.guard';
import type { Env } from '../../config/env';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          issuer: 'nexa-kabi',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    OtpService,
    TokenService,
    /**
     * Les gardes sont GLOBAUX : une route est protégée par défaut, et l'accès
     * public est une exception explicite marquée par `@Public()`.
     * L'inverse — protéger route par route — finit toujours par un oubli.
     */
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: GlobalRoleGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
