import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';

/**
 * Marque une route accessible avec une session dont le TOTP n'est pas encore
 * validé.
 *
 * ── Une seule route devrait porter ce marqueur ─────────────────────────────
 * Celle qui valide justement le code. Toute autre ferait de la double
 * authentification un simple écran de confirmation : un mot de passe volé
 * suffirait à qui sait appeler l'API directement.
 */
export const ALLOW_PENDING_TOTP = 'admin:allowPendingTotp';
export const AllowPendingTotp = () => SetMetadata(ALLOW_PENDING_TOTP, true);

/**
 * Rangs d'administration, du moins au plus étendu.
 *
 * ── Pourquoi une hiérarchie et non une matrice ────────────────────────────
 * Les droits d'ORGANISATION passent par une matrice de permissions, parce
 * qu'un même rôle y combine des capacités sans rapport entre elles — un
 * contrôleur scanne sans rien voir des finances. L'administration, elle, est
 * une échelle : le support lit, l'administrateur décide, le superadministrateur
 * touche à l'argent. Une matrice y ajouterait une table à tenir à jour sans
 * décrire quoi que ce soit de plus.
 */
export const ADMIN_RANKS = { SUPPORT: 1, ADMIN: 2, SUPERADMIN: 3 } as const;

export type AdminRole = keyof typeof ADMIN_RANKS;

export const MINIMUM_ADMIN_ROLE = 'admin:minimumRole';

/**
 * Rang minimal exigé par une route.
 *
 * ── Ce que son absence laissait passer ────────────────────────────────────
 * Le garde ne vérifiait que la validité de la session, jamais le rôle. Un
 * compte de support — le profil le plus large, celui qu'on confie le plus
 * volontiers à un prestataire — pouvait donc exécuter un versement, geler les
 * recettes d'un organisateur, suspendre un compte et ouvrir les pièces
 * d'identité déposées. Le nécessaire existait pourtant : rien ne le posait.
 *
 * Sans marqueur, une route reste ouverte à tout administrateur connecté, ce
 * qui convient à la lecture. Les décisions et les mouvements d'argent le
 * portent explicitement.
 */
export const MinimumAdminRole = (role: AdminRole) => SetMetadata(MINIMUM_ADMIN_ROLE, role);

export interface AdminRequest extends Request {
  admin: { id: string; fullName: string; role: string };
  adminToken: string;
}

/**
 * Garde des routes d'administration.
 *
 * ── Pourquoi il ne réutilise pas `SessionGuard` ───────────────────────────
 * Les deux authentifications sont volontairement disjointes : cookies
 * différents, durées différentes, exigence de TOTP d'un seul côté. Un garde
 * commun paramétré par un drapeau finirait par laisser passer une session
 * participant sur une route d'administration le jour où le drapeau serait
 * oublié — exactement le genre d'erreur qu'on ne voit qu'après.
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Connexion requise.');
    }

    const allowPendingTotp =
      this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_TOTP, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const session = await this.auth.requireSession(token, {
      allowUnverified: allowPendingTotp,
    });

    const required = this.reflector.getAllAndOverride<AdminRole>(MINIMUM_ADMIN_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required) {
      const held = ADMIN_RANKS[session.user.globalRole as AdminRole] ?? 0;

      if (held < ADMIN_RANKS[required]) {
        throw new ForbiddenException(
          'Cette action demande des droits que ton compte n’a pas. ' +
            'Demande à un administrateur de niveau supérieur.',
        );
      }
    }

    request.admin = {
      id: session.user.id,
      fullName: session.user.fullName,
      role: session.user.globalRole,
    };
    request.adminToken = token;

    return true;
  }
}

/**
 * Lit le jeton.
 *
 * L'en-tête `Authorization` est la source normale ; le cookie sert au relais
 * de l'application d'administration, qui garde le jeton en `httpOnly` pour
 * qu'aucun script de la page ne puisse le lire.
 */
function extractToken(request: Request): string | null {
  const header = request.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }

  const cookies = request.cookies as Record<string, string> | undefined;

  return cookies?.nk_admin ?? null;
}
