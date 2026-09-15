import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_PHONE,
  OTP_REQUEST_WINDOW_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  type RequestOtpInput,
  type RequestOtpResponse,
  type Session,
  type SessionUser,
  type UpdateProfileInput,
  type VerifyOtpInput,
} from '@nexakabi/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { maskPhone } from '@nexakabi/utils';
import type { User } from '../../generated/prisma/client';
import { SmsProvider } from '../notifications/sms.provider';
import { OtpService } from './domain/otp.service';
import { TokenService } from './domain/token.service';
import { AuthRepository } from './repositories/auth.repository';

export interface RequestContext {
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/** NestJS n'expose pas d'exception dédiée pour le code 429. */
class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super({ message, code: 'TOO_MANY_REQUESTS' }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * Authentification par numéro de téléphone et code à 6 chiffres.
 *
 * Trois règles structurantes, reprises du prototype :
 *
 *  1. La réponse à une demande de code est IDENTIQUE que le numéro soit connu
 *     ou non. Révéler l'existence d'un compte permettrait de l'énumérer.
 *  2. Le compte est créé silencieusement à la première vérification réussie.
 *  3. La session dure 90 jours sur l'appareil, avec rotation du jeton de
 *     rafraîchissement et détection de réutilisation.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly sms: SmsProvider,
    private readonly events: EventEmitter2,
  ) {}

  // ── Étape 1 : demander un code ────────────────────────────────────────────

  async requestCode(input: RequestOtpInput, context: RequestContext): Promise<RequestOtpResponse> {
    const now = new Date();
    const { phone, channel } = input;

    await this.assertRequestAllowed(phone, now);

    // Un nouveau code annule les précédents : un seul code valide à la fois.
    await this.repository.invalidateChallenges(phone, now);

    const code = this.otp.generateCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    await this.repository.createOtpChallenge({
      phone,
      codeHash: this.otp.hash(code, phone),
      channel,
      expiresAt,
      ipAddress: context.ipAddress,
    });

    await this.sms.send({ phone, code, channel, expiresInSeconds: OTP_TTL_SECONDS });

    return {
      resendAt: new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString(),
      expiresAt: expiresAt.toISOString(),
      channel,
      maskedPhone: maskPhone(phone),
      // Uniquement avec le fournisseur simulé, jamais en production.
      devCode: this.sms.exposesCode ? code : undefined,
    };
  }

  /**
   * Limitation de débit par numéro.
   *
   * Deux garde-fous distincts : un délai minimal entre deux demandes, et un
   * plafond par fenêtre glissante. Le premier protège l'utilisateur d'un
   * double-clic, le second d'un abus — le SMS a un coût réel.
   */
  private async assertRequestAllowed(phone: string, now: Date): Promise<void> {
    const last = await this.repository.findLastChallenge(phone);

    if (last) {
      const elapsedSeconds = (now.getTime() - last.createdAt.getTime()) / 1000;

      if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
        throw new TooManyRequestsException(
          `Un code vient d'être envoyé. Réessaie dans ${wait} secondes.`,
        );
      }
    }

    const since = new Date(now.getTime() - OTP_REQUEST_WINDOW_SECONDS * 1000);
    const recent = await this.repository.countRecentChallenges(phone, since);

    if (recent >= OTP_MAX_REQUESTS_PER_PHONE) {
      throw new TooManyRequestsException(
        'Trop de demandes pour ce numéro. Réessaie dans quelques minutes, ' +
          'ou écris-nous sur WhatsApp si tu ne reçois rien.',
      );
    }
  }

  // ── Étape 2 : vérifier le code ────────────────────────────────────────────

  async verifyCode(input: VerifyOtpInput, context: RequestContext): Promise<Session> {
    const now = new Date();
    const { phone, code } = input;

    const challenge = await this.repository.findActiveChallenge(phone, now);

    if (!challenge) {
      throw new UnauthorizedException(
        "Ce code n'est plus valide. Demande un nouveau code pour continuer.",
      );
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await this.repository.consumeChallenge(challenge.id, now);
      throw new UnauthorizedException(
        'Trop de tentatives. Demande un nouveau code pour continuer.',
      );
    }

    if (!this.otp.verify(code, phone, challenge.codeHash)) {
      const updated = await this.repository.incrementChallengeAttempts(challenge.id);
      const left = Math.max(0, OTP_MAX_ATTEMPTS - updated.attempts);

      throw new UnauthorizedException(
        left > 0
          ? `Code incorrect. Il te reste ${left} ${left > 1 ? 'tentatives' : 'tentative'}.`
          : 'Code incorrect. Demande un nouveau code pour continuer.',
      );
    }

    await this.repository.consumeChallenge(challenge.id, now);

    const existing = await this.repository.findUserByPhone(phone);
    const isNewAccount = existing === null;

    const user = existing
      ? await this.repository.markPhoneVerified(existing.id, now)
      : await this.repository.createUser(phone, now);

    this.assertUsable(user);

    /**
     * Le reste du produit apprend qu'une session vient de s'ouvrir.
     *
     * Ce qui s'y accroche aujourd'hui : les invitations d'équipe en attente
     * sur ce numéro, acceptées d'office. L'authentification n'a pas à
     * connaître les organisations — d'où un événement plutôt qu'un appel.
     */
    this.events.emit('auth.session.opened', { userId: user.id, phone: user.phone });

    return this.openSession(user, context, now, isNewAccount);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  private async openSession(
    user: User,
    context: RequestContext,
    now: Date,
    isNewAccount: boolean,
  ): Promise<Session> {
    const refresh = this.tokens.issueRefreshToken();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    const device = await this.repository.createDevice({
      userId: user.id,
      refreshTokenHash: refresh.hash,
      tokenFamily: this.tokens.newTokenFamily(),
      expiresAt,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      label: describeDevice(context.userAgent),
    });

    return this.buildSession(user, device.id, refresh.token, expiresAt, isNewAccount);
  }

  /**
   * Rotation du jeton de rafraîchissement.
   *
   * Le jeton présenté est consommé et remplacé. S'il a DÉJÀ été consommé, c'est
   * qu'il a été volé : toute la lignée est révoquée d'un bloc, ce qui déconnecte
   * aussi bien le voleur que la victime — le seul comportement sûr.
   */
  async refresh(refreshToken: string): Promise<Session> {
    const now = new Date();
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const device = await this.repository.findDeviceByRefreshHash(hash);

    if (!device) {
      throw new UnauthorizedException('Session expirée. Reconnecte-toi avec ton numéro.');
    }

    if (device.revokedAt) {
      // Jeton d'une lignée déjà révoquée : on coupe tout ce qui en descend.
      await this.repository.revokeTokenFamily(device.tokenFamily, now);
      this.logger.warn(
        { userId: device.userId, tokenFamily: device.tokenFamily },
        'Réutilisation d’un jeton révoqué : lignée coupée',
      );
      throw new UnauthorizedException('Session expirée. Reconnecte-toi avec ton numéro.');
    }

    if (device.expiresAt <= now) {
      await this.repository.revokeDevice(device.id, now);
      throw new UnauthorizedException('Session expirée. Reconnecte-toi avec ton numéro.');
    }

    this.assertUsable(device.user);

    const next = this.tokens.issueRefreshToken();
    const rotated = await this.repository.rotateDevice(device, next.hash, now);
    await this.repository.touchLastSeen(device.userId, now);

    return this.buildSession(device.user, rotated.id, next.token, device.expiresAt, false);
  }

  async logout(refreshToken: string, allDevices: boolean): Promise<void> {
    const now = new Date();
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const device = await this.repository.findDeviceByRefreshHash(hash);

    // Une déconnexion réussit toujours du point de vue de l'appelant : signaler
    // qu'un jeton est inconnu n'apporterait qu'un canal d'énumération.
    if (!device) return;

    if (allDevices) {
      await this.repository.revokeAllUserDevices(device.userId, now);
    } else {
      await this.repository.revokeDevice(device.id, now);
    }
  }

  // ── Profil ────────────────────────────────────────────────────────────────

  async completeProfile(userId: string, input: UpdateProfileInput): Promise<SessionUser> {
    const now = new Date();

    if (input.email) {
      const owner = await this.repository.findUserByEmail(input.email);

      if (owner && owner.id !== userId) {
        throw new BadRequestException(
          'Cette adresse e-mail est déjà utilisée par un autre compte.',
        );
      }
    }

    const user = await this.repository.updateProfile(userId, {
      fullName: input.fullName,
      email: input.email ?? null,
      marketingOptIn: input.marketingOptIn,
      avatarUrl: input.avatarUrl,
      termsAcceptedAt: now,
    });

    return toSessionUser(user);
  }

  async getCurrentUser(userId: string): Promise<SessionUser> {
    const user = await this.repository.findUserById(userId);

    if (!user) {
      throw new UnauthorizedException('Session expirée. Reconnecte-toi avec ton numéro.');
    }

    this.assertUsable(user);
    return toSessionUser(user);
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  private assertUsable(user: User): void {
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException(
        user.suspendedReason ??
          'Ce compte est suspendu. Écris-nous sur WhatsApp pour en connaître la raison.',
      );
    }

    if (user.status === 'DELETED' || user.deletedAt) {
      throw new ForbiddenException('Ce compte a été supprimé.');
    }
  }

  private async buildSession(
    user: User,
    deviceId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
    isNewAccount: boolean,
  ): Promise<Session> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      role: user.globalRole,
      did: deviceId,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      user: toSessionUser(user),
      isNewAccount,
    };
  }
}

function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole,
    status: user.status,
    marketingOptIn: user.marketingOptIn,
    // Tant que le nom est vide, l'étape 3 de l'inscription reste à faire.
    needsProfileCompletion: user.fullName.trim() === '',
  };
}

/** Libellé lisible d'un appareil : « Chrome sur Android ». */
function describeDevice(userAgent?: string): string | undefined {
  if (!userAgent) return undefined;

  const browsers: Array<[RegExp, string]> = [
    [/Edg\//, 'Edge'],
    [/OPR\//, 'Opera'],
    [/Chrome\//, 'Chrome'],
    [/Firefox\//, 'Firefox'],
    [/Safari\//, 'Safari'],
  ];

  const platforms: Array<[RegExp, string]> = [
    [/Android/, 'Android'],
    [/iPhone|iPad|iOS/, 'iOS'],
    [/Windows/, 'Windows'],
    [/Mac OS/, 'macOS'],
    [/Linux/, 'Linux'],
  ];

  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Navigateur';
  const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1];

  return platform ? `${browser} sur ${platform}` : browser;
}
