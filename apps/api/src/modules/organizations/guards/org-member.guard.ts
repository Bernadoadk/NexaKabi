import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  canActOnEvent,
  hasOrgPermission,
  isEventScopedRole,
  type OrgPermission,
  type OrgRole,
} from '@nexakabi/contracts';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { AuthenticatedRequest } from '../../auth/guards/session.guard';
import { ORG_PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Permissions qui portent sur les données d'un événement précis.
 *
 * Pour un rôle à portée limitée — le contrôleur —, ces permissions exigent que
 * la route désigne un événement, et que celui-ci figure dans son périmètre.
 */
const EVENT_BOUND_PERMISSIONS: ReadonlySet<OrgPermission> = new Set([
  'attendee:read',
  'attendee:export',
  'checkin:scan',
  'checkin:override',
]);

export interface OrgContext {
  readonly organizationId: string;
  readonly role: OrgRole;
  readonly scopedEventIds: readonly string[];
  readonly gate: string | null;
}

export interface OrgScopedRequest extends AuthenticatedRequest {
  organization?: OrgContext;
}

/**
 * Garde d'appartenance à une organisation.
 *
 * Résout l'organisation active, charge l'appartenance de l'utilisateur, puis
 * vérifie la permission déclarée par `@RequirePermission()`.
 *
 * La table de vérité vit dans `@nexakabi/contracts` et y est testée de façon
 * exhaustive : ce garde ne fait que l'appliquer. Aucun contrôleur ne compare un
 * rôle en dur — c'est la règle qui empêche les divergences.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §5.2 et §5.4.
 */
@Injectable()
export class OrgMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<OrgPermission>(ORG_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sans permission déclarée, ce garde n'a rien à dire.
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<OrgScopedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Connecte-toi pour accéder à cette organisation.');
    }

    const eventId = resolveEventId(request);

    /**
     * Organisation active.
     *
     * ── L'ÉVÉNEMENT fait autorité, jamais l'en-tête ─────────────────────────
     * Quand la route désigne un événement, l'organisation est celle qui le
     * possède — point. L'en-tête `X-Organization-Id` est fourni par le client :
     * le laisser l'emporter permettait à un attaquant de présenter SA propre
     * organisation (dont il est légitimement propriétaire, donc avec toutes les
     * permissions) tout en visant l'événement d'un tiers. Le garde validait
     * alors une appartenance réelle sur un objet qui n'avait rien à voir.
     *
     * Le repli par l'événement reste indispensable : la PWA du contrôleur ne
     * connaît QUE l'identifiant d'événement — c'est tout ce que contient le
     * lien d'invitation qu'il a reçu. L'en-tête ne sert donc qu'aux écrans
     * transverses, ceux dont l'URL ne porte aucun événement.
     */
    const declared = resolveOrganizationId(request);
    const owner = eventId ? await this.organizationOfEvent(eventId) : null;

    if (eventId && !owner) {
      // Message identique à celui d'un refus d'appartenance : distinguer
      // « cet événement n'existe pas » de « il ne t'appartient pas » permettrait
      // d'énumérer les événements de la plateforme.
      throw new ForbiddenException("Tu n'as pas accès à cet événement.");
    }

    if (owner && declared && declared !== owner) {
      throw new ForbiddenException('Cet événement n’appartient pas à cette organisation.');
    }

    const organizationId = owner ?? declared;

    if (!organizationId) {
      throw new BadRequestException(
        "Aucune organisation indiquée. Précise l'en-tête X-Organization-Id.",
      );
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { role: true, status: true, scopedEventIds: true, gate: true, expiresAt: true },
    });

    // Message identique qu'on ne soit pas membre ou que l'organisation
    // n'existe pas : la différence ne renseignerait qu'un curieux.
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException("Tu n'as pas accès à cette organisation.");
    }

    // Un accès limité dans le temps — celui d'un contrôleur recruté pour une
    // soirée — se ferme de lui-même. La ligne reste : ses scans lui restent
    // attribués, et l'organisation garde de quoi le payer.
    if (membership.expiresAt && membership.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException(
        'Ton accès à cette équipe est terminé. L’organisateur peut te réinviter.',
      );
    }

    const scoped = isEventScopedRole(membership.role);

    // Un rôle à portée limitée ne peut exercer une permission PORTANT SUR DES
    // DONNÉES D'ÉVÉNEMENT que sur les événements qui lui sont assignés. Les
    // permissions transverses — lire l'organisation, par exemple — suivent la
    // matrice comme pour tout le monde : sans cette nuance, un contrôleur ne
    // pourrait même pas afficher le nom de l'organisation qui l'a invité.
    if (scoped && EVENT_BOUND_PERMISSIONS.has(permission) && eventId === null) {
      throw new ForbiddenException('Ton accès est limité aux événements qui te sont assignés.');
    }

    const allowed =
      scoped && eventId !== null
        ? canActOnEvent(membership.role, permission, eventId, membership.scopedEventIds)
        : hasOrgPermission(membership.role, permission);

    if (!allowed) {
      throw new ForbiddenException('Ton rôle ne permet pas cette action.');
    }

    request.organization = {
      organizationId,
      role: membership.role,
      scopedEventIds: membership.scopedEventIds,
      gate: membership.gate,
    };

    return true;
  }

  /** Organisation propriétaire d'un événement. `null` s'il n'existe pas. */
  private async organizationOfEvent(eventId: string): Promise<string | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { organizationId: true },
    });

    return event?.organizationId ?? null;
  }
}

/**
 * Organisation active.
 *
 * Deux sources acceptées, dans cet ordre : le segment de route, puis l'en-tête.
 * Le sélecteur d'organisation du prototype ne change pas l'URL des écrans
 * transverses, d'où l'en-tête.
 */
function resolveOrganizationId(request: OrgScopedRequest): string | null {
  const fromParams = (request.params as Record<string, string | undefined>)?.organizationId;
  if (fromParams) return fromParams;

  const header = request.headers['x-organization-id'];
  if (typeof header === 'string' && header.trim() !== '') return header.trim();

  return null;
}

/** Événement visé, pour les rôles à portée limitée. */
function resolveEventId(request: OrgScopedRequest): string | null {
  const params = request.params as Record<string, string | undefined> | undefined;
  return params?.eventId ?? params?.id ?? null;
}
