import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  logoutSchema,
  refreshSessionSchema,
  requestOtpSchema,
  updateProfileSchema,
  verifyOtpSchema,
  type RequestOtpResponse,
  type Session,
  type SessionUser,
} from '@nexakabi/contracts';
import { AuthService, type RequestContext } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ReqContext } from './decorators/request-context.decorator';
import type { AuthenticatedUser } from './guards/session.guard';
import {
  LogoutDto,
  RefreshSessionDto,
  RequestOtpDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './dto/auth.dto';

/**
 * Authentification.
 *
 * Le contrat complet est défini dans `@nexakabi/contracts` : les DTO en sont
 * dérivés, ce qui garantit qu'une modification casse la compilation des deux
 * côtés à la fois.
 */
@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  // Second rempart, par adresse IP : le service limite déjà par numéro.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Demander un code à 6 chiffres',
    description:
      "La réponse est identique que le numéro soit connu ou non, afin qu'on ne " +
      'puisse pas énumérer les comptes existants.',
  })
  requestCode(
    @Body() body: RequestOtpDto,
    @ReqContext() context: RequestContext,
  ): Promise<RequestOtpResponse> {
    return this.auth.requestCode(requestOtpSchema.parse(body), context);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Vérifier le code et ouvrir une session',
    description:
      'Le compte est créé silencieusement si le numéro est inconnu : imposer une ' +
      'inscription avant le paiement coûterait une part importante des conversions.',
  })
  verifyCode(@Body() body: VerifyOtpDto, @ReqContext() context: RequestContext): Promise<Session> {
    return this.auth.verifyCode(verifyOtpSchema.parse(body), context);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renouveler la session',
    description:
      'Le jeton présenté est consommé et remplacé. Présenter un jeton déjà ' +
      'consommé révoque toute la lignée : c’est la signature d’un vol.',
  })
  refresh(@Body() body: RefreshSessionDto): Promise<Session> {
    const { refreshToken } = refreshSessionSchema.parse(body);
    return this.auth.refresh(refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Fermer la session' })
  async logout(@Body() body: LogoutDto): Promise<void> {
    const { refreshToken, allDevices } = logoutSchema.parse(body);
    await this.auth.logout(refreshToken, allDevices);
  }

  @Get('me')
  @ApiOperation({ summary: 'Utilisateur de la session en cours' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<SessionUser> {
    return this.auth.getCurrentUser(user.id);
  }

  @Patch('me/profile')
  @ApiOperation({
    summary: 'Compléter ou modifier le profil',
    description:
      'Étape 3 de l’inscription — nom, e-mail facultatif, consentement — ET écran « Mon ' +
      'compte » par la suite, pour corriger un champ ou déposer une photo de profil ' +
      '(`avatarUrl`, obtenue via `POST /media/avatar`). Même route, comme le numéro et le ' +
      'code de connexion sont les mêmes qu’on vienne organiser ou acheter.',
  })
  completeProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileDto,
  ): Promise<SessionUser> {
    return this.auth.completeProfile(user.id, updateProfileSchema.parse(body));
  }
}
