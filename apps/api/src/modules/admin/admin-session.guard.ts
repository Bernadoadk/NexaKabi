import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ADMIN_SPACES,
  canMoveMoney,
  hasAdminAccess,
  type AdminAccessLevel,
  type AdminMe,
  type AdminSpace,
} from '@nexakabi/contracts';
import { AdminAuthService } from './admin-auth.service';

/**
 * Ce qu'une route d'administration exige.
 *
 * ── Pourquoi des espaces et non une hiérarchie ─────────────────────────────
 * L'ancien modèle était une échelle (support < admin < superadmin). Une
 * entreprise ne s'organise pas en échelle : le comptable lit les retraits
 * sans toucher aux signalements, le modérateur décide sur les événements
 * sans jamais voir une pièce d'identité. Chaque route déclare donc SON espace
 * et le niveau qu'elle demande — `read` pour consulter, `act` pour décider —
 * et le propriétaire compose les droits de chacun depuis l'écran Équipe.
 *
 * L'argent est un droit à part (`@RequireMoney()`), jamais impliqué par un
 * espace : accorder « Retraits · décision » ne suffit pas à verser un centime.
 *
 * Sans marqueur, une route n'exige qu'une session valide — c'est le cas du
 * tableau de bord et du profil. Toute route qui lit ou modifie une file doit
 * porter le sien : un oubli laisserait passer n'importe quel employé.
 */
export const ADMIN_ACCESS = 'admin:access';
export const ADMIN_MONEY = 'admin:money';
export const ADMIN_OWNER = 'admin:owner';

export interface AdminAccessRequirement {
  space: AdminSpace;
  level: AdminAccessLevel;
}

export const RequireAdminAccess = (space: AdminSpace, level: AdminAccessLevel = 'read') =>
  SetMetadata<string, AdminAccessRequirement>(ADMIN_ACCESS, { space, level });

/** Mouvements d'argent : verser, enregistrer un versement, geler ou dégeler. */
export const RequireMoney = () => SetMetadata(ADMIN_MONEY, true);

/** Réservé au propriétaire : composition de l'équipe. */
export const OwnerOnly = () => SetMetadata(ADMIN_OWNER, true);

export interface AdminRequest extends Request {
  admin: AdminMe;
  adminToken: string;
}

/**
 * Garde des routes d'administration.
 *
 * ── Pourquoi il ne réutilise pas `SessionGuard` ───────────────────────────
 * Les deux authentifications sont volontairement disjointes : cookies
 * différents, durées différentes, révocation immédiate d'un seul côté. Un
 * garde commun paramétré par un drapeau finirait par laisser passer une
 * session participant sur une route d'administration le jour où le drapeau
 * serait oublié — exactement le genre d'erreur qu'on ne voit qu'après.
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

    const admin = await this.auth.requireSession(token);
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_OWNER, targets) && admin.role !== 'OWNER') {
      throw new ForbiddenException('Seul le propriétaire peut faire ceci.');
    }

    const requirement = this.reflector.getAllAndOverride<AdminAccessRequirement | undefined>(
      ADMIN_ACCESS,
      targets,
    );

    if (requirement && !hasAdminAccess(admin, requirement.space, requirement.level)) {
      const label = ADMIN_SPACES.find((space) => space.key === requirement.space)?.label;

      throw new ForbiddenException(
        requirement.level === 'act' && hasAdminAccess(admin, requirement.space, 'read')
          ? `Tu peux consulter « ${label} », pas y décider. Demande ce droit au propriétaire.`
          : `Ton compte n’a pas accès à « ${label} ». Demande ce droit au propriétaire.`,
      );
    }

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_MONEY, targets) && !canMoveMoney(admin)) {
      throw new ForbiddenException(
        'Les mouvements d’argent demandent un droit explicite, accordé par le propriétaire.',
      );
    }

    request.admin = admin;
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
