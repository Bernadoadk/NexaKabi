import { createHash, randomBytes } from 'node:crypto';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  INVITATION_TTL_DAYS,
  ORG_ROLE_DEFINITIONS,
  IDENTITY_CONSENT,
  canRequestDocument,
  documentSpec,
  isPersonalDocument,
  type CreateOrganizationInput,
  type CreatePayoutAccountInput,
  type DocumentType,
  type InviteMemberInput,
  type Invitation,
  type Member,
  type OrgRole,
  type Organization,
  type OrganizationSummary,
  type PayoutAccount,
  type SubmitVerificationInput,
  type UpdateMemberRoleInput,
  type UpdateOrganizationInput,
  type VerificationRequestDetail,
} from '@nexakabi/contracts';
import { maskPhone, slugify, uniqueSlug } from '@nexakabi/utils';
import type { DocumentType as PrismaDocumentType } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import type { OrgContext } from './guards/org-member.guard';

/**
 * Organisations et équipes.
 *
 * Deux règles structurantes :
 *
 *  1. Le PROPRIÉTAIRE est unique et non révocable. Sans cette distinction, un
 *     administrateur invité pourrait évincer le créateur de son organisation.
 *  2. La vérification conditionne le RETRAIT, pas la vente : on ne freine pas
 *     l'activité légitime, on sécurise l'argent.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  // ── Organisation ──────────────────────────────────────────────────────────

  async create(userId: string, input: CreateOrganizationInput): Promise<Organization> {
    const slug = await this.buildUniqueSlug(input.name);

    const organization = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          slug,
          name: input.name,
          type: input.type,
          cityName: input.cityName,
          address: input.address,
          phone: input.phone,
          whatsapp: input.whatsapp,
          email: input.email,
          description: input.description,
          ownerId: userId,
        },
      });

      // Le créateur devient membre OWNER dans la même transaction : une
      // organisation sans propriétaire actif serait ingérable.
      await tx.organizationMember.create({
        data: {
          organizationId: created.id,
          userId,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      return created;
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.organizationCreated,
      entityType: 'Organization',
      entityId: organization.id,
      organizationId: organization.id,
      actorUserId: userId,
    });

    return toOrganization(organization);
  }

  /** Organisations dont l'utilisateur est membre actif — le sélecteur en tête de sidebar. */
  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE', organization: { deletedAt: null } },
      include: {
        organization: {
          include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      slug: membership.organization.slug,
      name: membership.organization.name,
      logoUrl: membership.organization.logoUrl,
      type: membership.organization.type,
      verificationStatus: membership.organization.verificationStatus,
      role: membership.role,
      memberCount: membership.organization._count.members,
    }));
  }

  async findById(organizationId: string): Promise<Organization> {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });

    if (!organization) {
      throw new NotFoundException("Cette organisation n'existe pas.");
    }

    return toOrganization(organization);
  }

  async update(
    context: OrgContext,
    userId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization> {
    const before = await this.findById(context.organizationId);

    const updated = await this.prisma.organization.update({
      where: { id: context.organizationId },
      data: {
        name: input.name,
        legalName: input.legalName,
        type: input.type,
        description: input.description,
        cityName: input.cityName,
        address: input.address,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        logoUrl: input.logoUrl,
        coverUrl: input.coverUrl,
        website: emptyToNull(input.website),
        facebook: emptyToNull(input.facebook),
        instagram: emptyToNull(input.instagram),
        tiktok: emptyToNull(input.tiktok),
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.organizationUpdated,
      entityType: 'Organization',
      entityId: context.organizationId,
      organizationId: context.organizationId,
      actorUserId: userId,
      changes: { before: { name: before.name }, after: { name: updated.name } },
    });

    return toOrganization(updated);
  }

  // ── Membres ───────────────────────────────────────────────────────────────

  async listMembers(context: OrgContext, currentUserId: string): Promise<Member[]> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: context.organizationId, status: { not: 'REMOVED' } },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    // Un contrôleur ne voit jamais les coordonnées complètes de l'équipe.
    const scope = ORG_ROLE_DEFINITIONS[context.role].attendeeScope;
    const hideContacts = scope !== 'full';

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      fullName: member.user.fullName,
      phone: hideContacts ? maskPhone(member.user.phone) : member.user.phone,
      email: hideContacts ? null : member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      status: member.status,
      scopedEventIds: member.scopedEventIds,
      gate: member.gate,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      accessEndsAt: member.expiresAt?.toISOString() ?? null,
      isCurrentUser: member.userId === currentUserId,
    }));
  }

  /**
   * Invitation par lien à usage unique, valable 7 jours.
   *
   * Le jeton n'est stocké que haché : une fuite de la base ne permettrait pas
   * de rejoindre une organisation.
   */
  async invite(
    context: OrgContext,
    invitedById: string,
    input: InviteMemberInput,
  ): Promise<{ invitationId: string; token: string; expiresAt: string }> {
    if (input.role === 'SCANNER' && input.scopedEventIds.length === 0) {
      throw new BadRequestException(
        'Choisis le ou les événements auxquels ce contrôleur aura accès.',
      );
    }

    const existing = await this.findExistingMember(context.organizationId, input);

    if (existing) {
      throw new BadRequestException('Cette personne fait déjà partie de ton équipe.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.memberInvitation.create({
      data: {
        organizationId: context.organizationId,
        tokenHash: hashToken(token),
        phone: input.phone,
        email: input.email,
        role: input.role,
        scopedEventIds: input.scopedEventIds,
        gate: input.gate,
        invitedById,
        expiresAt,
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.memberInvited,
      entityType: 'MemberInvitation',
      entityId: invitation.id,
      organizationId: context.organizationId,
      actorUserId: invitedById,
      changes: { role: input.role },
    });

    return { invitationId: invitation.id, token, expiresAt: expiresAt.toISOString() };
  }

  /** Détail d'une invitation, avant acceptation. */
  async describeInvitation(token: string): Promise<Invitation> {
    const invitation = await this.prisma.memberInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: true, invitedBy: true },
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throw new NotFoundException("Cette invitation n'est plus valide.");
    }

    if (invitation.expiresAt <= new Date()) {
      throw new NotFoundException(
        "Cette invitation a expiré. Demande à l'organisateur de t'en envoyer une nouvelle.",
      );
    }

    const definition = ORG_ROLE_DEFINITIONS[invitation.role];

    return {
      id: invitation.id,
      organizationName: invitation.organization.name,
      organizationLogoUrl: invitation.organization.logoUrl,
      role: invitation.role,
      roleLabel: definition.label,
      roleDescription: definition.description,
      invitedByName: invitation.invitedBy.fullName,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Invitations en attente sur le numéro de la personne qui vient de se
   * connecter : elles sont acceptées d'office.
   *
   * ── Le parcours que cela rend possible ──────────────────────────────────
   * L'organisateur saisit le numéro d'un bénévole et l'événement. Le bénévole
   * reçoit un mot sur WhatsApp, ouvre le site, tape son numéro et son code —
   * et il est déjà dans l'équipe, sans lien à cliquer ni bouton à trouver. La
   * possession du numéro est la preuve d'identité de tout le produit ; elle
   * suffit ici comme partout.
   *
   * Le lien d'invitation continue d'exister : il reste le moyen de prévenir
   * quelqu'un, et le seul chemin pour une invitation par e-mail.
   */
  @OnEvent('auth.session.opened')
  async claimPendingInvitations(payload: { userId: string; phone: string }): Promise<void> {
    const now = new Date();

    const pending = await this.prisma.memberInvitation.findMany({
      where: { phone: payload.phone, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      include: { organization: true },
    });

    for (const invitation of pending) {
      try {
        await this.join(invitation, payload.userId, now);

        await this.audit.record({
          action: AUDIT_ACTIONS.memberJoined,
          entityType: 'OrganizationMember',
          entityId: invitation.id,
          organizationId: invitation.organizationId,
          actorUserId: payload.userId,
          changes: { role: invitation.role, via: 'phone' },
        });
      } catch {
        // Une invitation consommée entre-temps n'est pas une erreur de
        // connexion : la session s'ouvre quoi qu'il arrive.
      }
    }
  }

  /**
   * Fin d'accès d'un rôle limité dans le temps.
   *
   * Un contrôleur assigné à des événements précis n'a rien à faire dans
   * l'organisation une fois le dernier passé : son accès se ferme 24 h après —
   * le temps de synchroniser d'éventuels scans hors ligne. Les rôles
   * permanents, et un contrôleur sans événement assigné, n'expirent pas.
   */
  private async accessExpiry(role: string, scopedEventIds: string[]): Promise<Date | null> {
    if (role !== 'SCANNER' || scopedEventIds.length === 0) return null;

    const last = await this.prisma.event.aggregate({
      where: { id: { in: scopedEventIds } },
      _max: { endsAt: true },
    });

    return last._max.endsAt ? new Date(last._max.endsAt.getTime() + 24 * 3_600_000) : null;
  }

  /** Consomme une invitation et crée ou met à jour l'appartenance, atomiquement. */
  private async join(
    invitation: {
      id: string;
      tokenHash: string;
      organizationId: string;
      role: OrgRole;
      scopedEventIds: string[];
      gate: string | null;
      invitedById: string;
    },
    userId: string,
    now: Date,
  ): Promise<void> {
    const expiresAt = await this.accessExpiry(invitation.role, invitation.scopedEventIds);

    await this.prisma.$transaction(async (tx) => {
      // Consommation et adhésion dans la même transaction : sans cela, deux
      // clics simultanés sur le lien créeraient deux adhésions.
      const consumed = await tx.memberInvitation.updateMany({
        where: { tokenHash: invitation.tokenHash, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: now, acceptedByUserId: userId },
      });

      if (consumed.count === 0) {
        throw new NotFoundException('Cette invitation a déjà été utilisée.');
      }

      await tx.organizationMember.upsert({
        where: {
          organizationId_userId: { organizationId: invitation.organizationId, userId },
        },
        create: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          status: 'ACTIVE',
          scopedEventIds: invitation.scopedEventIds,
          gate: invitation.gate,
          expiresAt,
          invitedById: invitation.invitedById,
          joinedAt: now,
        },
        update: {
          role: invitation.role,
          status: 'ACTIVE',
          scopedEventIds: invitation.scopedEventIds,
          gate: invitation.gate,
          expiresAt,
          joinedAt: now,
        },
      });
    });
  }

  async acceptInvitation(token: string, userId: string): Promise<OrganizationSummary> {
    const now = new Date();
    const tokenHash = hashToken(token);

    const invitation = await this.prisma.memberInvitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throw new NotFoundException("Cette invitation n'est plus valide.");
    }

    if (invitation.expiresAt <= now) {
      throw new NotFoundException('Cette invitation a expiré.');
    }

    await this.join(invitation, userId, now);

    await this.audit.record({
      action: AUDIT_ACTIONS.memberJoined,
      entityType: 'OrganizationMember',
      entityId: invitation.id,
      organizationId: invitation.organizationId,
      actorUserId: userId,
      changes: { role: invitation.role },
    });

    const memberCount = await this.prisma.organizationMember.count({
      where: { organizationId: invitation.organizationId, status: 'ACTIVE' },
    });

    return {
      id: invitation.organization.id,
      slug: invitation.organization.slug,
      name: invitation.organization.name,
      logoUrl: invitation.organization.logoUrl,
      type: invitation.organization.type,
      verificationStatus: invitation.organization.verificationStatus,
      role: invitation.role,
      memberCount,
    };
  }

  async updateMemberRole(
    context: OrgContext,
    actorUserId: string,
    memberId: string,
    input: UpdateMemberRoleInput,
  ): Promise<Member[]> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: context.organizationId },
    });

    if (!member) {
      throw new NotFoundException("Ce membre n'existe pas dans cette organisation.");
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException(
        "Le rôle du propriétaire ne peut pas être modifié. Transfère l'organisation à la place.",
      );
    }

    if (input.role === 'SCANNER' && (input.scopedEventIds ?? member.scopedEventIds).length === 0) {
      throw new BadRequestException(
        'Choisis le ou les événements auxquels ce contrôleur aura accès.',
      );
    }

    await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        role: input.role,
        scopedEventIds: input.scopedEventIds ?? member.scopedEventIds,
        gate: input.gate === undefined ? member.gate : input.gate,
      },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.memberRoleChanged,
      entityType: 'OrganizationMember',
      entityId: memberId,
      organizationId: context.organizationId,
      actorUserId,
      changes: { before: member.role, after: input.role },
    });

    return this.listMembers(context, actorUserId);
  }

  async removeMember(context: OrgContext, actorUserId: string, memberId: string): Promise<void> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: context.organizationId },
    });

    if (!member) {
      throw new NotFoundException("Ce membre n'existe pas dans cette organisation.");
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException('Le propriétaire ne peut pas être retiré de son organisation.');
    }

    await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { status: 'REMOVED' },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.memberRemoved,
      entityType: 'OrganizationMember',
      entityId: memberId,
      organizationId: context.organizationId,
      actorUserId,
      changes: { role: member.role },
    });
  }

  // ── Comptes de retrait ────────────────────────────────────────────────────

  async listPayoutAccounts(context: OrgContext): Promise<PayoutAccount[]> {
    const accounts = await this.prisma.payoutAccount.findMany({
      where: { organizationId: context.organizationId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return accounts.map(toPayoutAccount);
  }

  async addPayoutAccount(
    context: OrgContext,
    actorUserId: string,
    input: CreatePayoutAccountInput,
  ): Promise<PayoutAccount> {
    const account = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.payoutAccount.updateMany({
          where: { organizationId: context.organizationId },
          data: { isDefault: false },
        });
      }

      const count = await tx.payoutAccount.count({
        where: { organizationId: context.organizationId, deletedAt: null },
      });

      return tx.payoutAccount.create({
        data: {
          organizationId: context.organizationId,
          type: input.type,
          provider: input.provider,
          accountNumber: input.accountNumber,
          accountHolderName: input.accountHolderName,
          bankName: input.bankName,
          // Le premier compte enregistré devient le compte par défaut.
          isDefault: input.isDefault || count === 0,
        },
      });
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.payoutAccountAdded,
      entityType: 'PayoutAccount',
      entityId: account.id,
      organizationId: context.organizationId,
      actorUserId,
      changes: { type: input.type },
    });

    return toPayoutAccount(account);
  }

  // ── Vérification ──────────────────────────────────────────────────────────

  /**
   * Ce que ce chantier comble.
   *
   * `VerificationRequest` et son écran de revue existaient déjà côté
   * administration — mais rien, côté organisateur, ne créait jamais une seule
   * de ces demandes en dehors d'un script de démonstration : le dépôt d'un
   * dossier était, concrètement, impossible dans le produit qui tourne.
   */
  async getMyVerification(organizationId: string): Promise<VerificationRequestDetail | null> {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { organizationId },
      include: { documents: { orderBy: { createdAt: 'asc' } } },
    });

    return request ? toVerificationRequestDetail(request) : null;
  }

  /**
   * Soumet — ou complète — le dossier de vérification.
   *
   * Un dossier `INCOMPLETE` ou `REJECTED` peut être soumis à nouveau : c'est
   * le même dossier qui reprend son instruction, pas un second qui s'ajoute.
   * Un dossier déjà `VERIFIED` ou `PENDING`, non — le premier n'a plus rien à
   * prouver, le second est déjà entre les mains d'un modérateur.
   */
  async submitVerification(
    context: OrgContext,
    actorUserId: string,
    input: SubmitVerificationInput,
  ): Promise<VerificationRequestDetail> {
    const existing = await this.prisma.verificationRequest.findUnique({
      where: { organizationId: context.organizationId },
    });

    if (existing?.status === 'VERIFIED') {
      throw new BadRequestException('Cette organisation est déjà vérifiée.');
    }

    if (existing?.status === 'PENDING') {
      throw new BadRequestException('Un dossier est déjà en cours d’instruction.');
    }

    const request = existing
      ? await this.prisma.verificationRequest.update({
          where: { id: existing.id },
          data: {
            contactName: input.contactName,
            contactPhone: input.contactPhone,
            status: 'PENDING',
            submittedAt: new Date(),
            reviewedAt: null,
            decisionNote: null,
          },
          include: { documents: { orderBy: { createdAt: 'asc' } } },
        })
      : await this.prisma.verificationRequest.create({
          data: {
            organizationId: context.organizationId,
            contactName: input.contactName,
            contactPhone: input.contactPhone,
          },
          include: { documents: { orderBy: { createdAt: 'asc' } } },
        });

    await this.prisma.organization.update({
      where: { id: context.organizationId },
      data: { verificationStatus: 'PENDING' },
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.verificationSubmitted,
      entityType: 'VerificationRequest',
      entityId: request.id,
      actorUserId,
      organizationId: context.organizationId,
    });

    return toVerificationRequestDetail(request);
  }

  /**
   * Dépose une pièce à l'appui du dossier.
   *
   * L'upload passe par `MediaService.uploadVerificationDocument()`, qui
   * existait déjà : stockage privé, ré-encodage des images, jamais d'URL
   * publique. Ce qui manquait était l'appelant, pas le stockage.
   */
  async addVerificationDocument(
    context: OrgContext,
    input: { type: DocumentType; consent?: number },
    file: { buffer: Buffer; mimeType: string; originalName?: string },
  ): Promise<VerificationRequestDetail> {
    const { type, consent } = input;

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { type: true },
    });

    const request = await this.prisma.verificationRequest.findUnique({
      where: { organizationId: context.organizationId },
      include: { documents: { where: { purgedAt: null }, select: { id: true, type: true, fileKey: true } } },
    });

    if (!request) {
      throw new BadRequestException(
        'Renseigne d’abord tes coordonnées de contact avant de déposer une pièce.',
      );
    }

    // ── Trois portes, dans cet ordre ────────────────────────────────────────

    if (!canRequestDocument(type, organization.type)) {
      throw new BadRequestException(
        'Cette pièce ne correspond pas au statut déclaré par ton organisation.',
      );
    }

    // Une pièce PERSONNELLE ne peut arriver que sur demande écrite d'un
    // modérateur. C'est la ligne que trace le Code du numérique béninois : une
    // carte d'identité reçue sans avoir été réclamée est une collecte que rien
    // ne justifie. Un document d'ENTITÉ — RCCM, IFU, récépissé, acte de
    // création — n'est pas une donnée personnelle et vient de registres
    // publics : l'organisateur le dépose quand il veut, et l'en empêcher
    // obligerait un modérateur à réclamer formellement, dossier après dossier,
    // ce que l'organisateur lui aurait donné de lui-même.
    if (isPersonalDocument(type) && !request.requestedDocuments.includes(type)) {
      throw new BadRequestException(
        `Cette pièce n’a pas été demandée (${documentSpec(type).short}). ` +
          'Une pièce d’identité ne se dépose que si un modérateur l’a réclamée.',
      );
    }

    // Le consentement exprès, pour l'image d'un visage, n'est pas une case de
    // confort : c'est ce qui rend le traitement licite. Il est exigé ici, au
    // plus près de l'écriture, et pas seulement dans l'interface.
    if (isPersonalDocument(type) && consent !== IDENTITY_CONSENT.version) {
      throw new BadRequestException(
        'Le consentement à la vérification d’identité n’a pas été recueilli.',
      );
    }

    const stored = await this.media.uploadVerificationDocument(
      file.buffer,
      file.mimeType,
      file.originalName,
      { allowPdf: documentSpec(type).accept.includes('application/pdf') },
    );

    // Une pièce reprise remplace la précédente. Empiler trois selfies parce
    // que les deux premiers étaient flous ne sert personne, et chaque copie
    // qui traîne est une copie à protéger.
    const previous = request.documents.filter((document) => document.type === type);

    await this.prisma.$transaction(async (tx) => {
      if (previous.length > 0) {
        await tx.verificationDocument.deleteMany({
          where: { id: { in: previous.map((document) => document.id) } },
        });
      }

      await tx.verificationDocument.create({
        data: {
          requestId: request.id,
          type,
          fileKey: stored.key,
          fileName: file.originalName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          consentVersion: consent ?? null,
          consentAt: consent ? new Date() : null,
        },
      });
    });

    for (const document of previous) {
      await this.media.removeQuietly(document.fileKey);
    }

    await this.closeRequestWhenComplete(request.id, type, context.organizationId);

    const updated = await this.prisma.verificationRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { documents: { orderBy: { createdAt: 'asc' } } },
    });

    return toVerificationRequestDetail(updated);
  }

  /**
   * Quand la dernière pièce réclamée arrive, le dossier repart tout seul.
   *
   * ── Pourquoi automatiquement ────────────────────────────────────────────
   * Parce que sinon il ne repart pas. Un organisateur qui vient de déposer ce
   * qu'on lui demandait considère avoir fini — il ne cherche pas un second
   * bouton « soumettre à nouveau », et son dossier dort jusqu'à ce qu'il
   * s'inquiète de ne pas avoir de réponse. La liste des pièces demandées est
   * vidée dans le même geste : ce qui a été fourni n'est plus dû.
   */
  private async closeRequestWhenComplete(
    requestId: string,
    justAdded: DocumentType,
    organizationId: string,
  ): Promise<void> {
    const request = await this.prisma.verificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        requestedDocuments: true,
        documents: { where: { purgedAt: null }, select: { type: true } },
      },
    });

    const present = new Set<string>([...request.documents.map((d) => d.type), justAdded]);
    const missing = request.requestedDocuments.filter((type) => !present.has(type));

    if (missing.length > 0) return;

    await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: requestId },
        data: {
          requestedDocuments: [],
          status: 'PENDING',
          submittedAt: new Date(),
          reviewedAt: null,
          decisionNote: null,
        },
      }),
      this.prisma.organization.update({
        where: { id: organizationId },
        data: { verificationStatus: 'PENDING' },
      }),
    ]);

    await this.audit.record({
      action: AUDIT_ACTIONS.verificationSubmitted,
      entityType: 'VerificationRequest',
      entityId: requestId,
      organizationId,
      changes: { reason: 'Toutes les pièces demandées ont été fournies.' },
    });
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  private async buildUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'organisation';

    const taken = await this.prisma.organization.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });

    return uniqueSlug(
      base,
      taken.map((row) => row.slug),
    );
  }

  private async findExistingMember(organizationId: string, input: InviteMemberInput) {
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(input.phone ? [{ phone: input.phone }] : []),
          ...(input.email ? [{ email: input.email }] : []),
        ],
      },
    });

    if (!user) return null;

    return this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.id, status: { in: ['ACTIVE', 'INVITED'] } },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? null : value;
}

/** N'expose que les quatre derniers caractères d'un compte de réception. */
function maskAccountNumber(accountNumber: string): string {
  const tail = accountNumber.slice(-4);
  return `••••${tail}`;
}

interface VerificationRequestRow {
  id: string;
  status: VerificationRequestDetail['status'];
  contactName: string;
  contactPhone: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  decisionNote: string | null;
  checks: unknown;
  requestedDocuments: PrismaDocumentType[];
  documents: {
    id: string;
    type: PrismaDocumentType;
    fileName: string | null;
    status: VerificationRequestDetail['documents'][number]['status'];
    rejectionReason: string | null;
    purgedAt: Date | null;
    createdAt: Date;
  }[];
}

/** Jamais `fileKey` : ce champ ne quitte pas ce module, l'organisateur ne consulte pas ses propres fichiers via cette route. */
function toVerificationRequestDetail(request: VerificationRequestRow): VerificationRequestDetail {
  return {
    id: request.id,
    status: request.status,
    contactName: request.contactName,
    contactPhone: request.contactPhone,
    submittedAt: request.submittedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    decisionNote: request.decisionNote,
    checks: (request.checks as VerificationRequestDetail['checks'] | null) ?? null,
    requestedDocuments: request.requestedDocuments,
    documents: request.documents.map((document) => ({
      id: document.id,
      type: document.type,
      fileName: document.fileName,
      status: document.status,
      rejectionReason: document.rejectionReason,
      // Le fichier a été détruit après décision : la ligne reste, pour que le
      // dossier continue de dire ce qui avait été fourni.
      available: document.purgedAt === null,
      createdAt: document.createdAt.toISOString(),
    })),
  };
}

interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  type: Organization['type'];
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  cityName: string | null;
  address: string | null;
  status: Organization['status'];
  verificationStatus: Organization['verificationStatus'];
  verifiedAt: Date | null;
  payoutFrozen: boolean;
  completedEventsCount: number;
  createdAt: Date;
}

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legalName: row.legalName,
    type: row.type,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    website: row.website,
    facebook: row.facebook,
    instagram: row.instagram,
    tiktok: row.tiktok,
    cityName: row.cityName,
    address: row.address,
    status: row.status,
    verificationStatus: row.verificationStatus,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    payoutFrozen: row.payoutFrozen,
    completedEventsCount: row.completedEventsCount,
    createdAt: row.createdAt.toISOString(),
  };
}

interface PayoutAccountRow {
  id: string;
  type: PayoutAccount['type'];
  provider: string | null;
  accountNumber: string;
  accountHolderName: string;
  bankName: string | null;
  isDefault: boolean;
  verifiedAt: Date | null;
  lastFailureReason: string | null;
}

function toPayoutAccount(row: PayoutAccountRow): PayoutAccount {
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    maskedAccountNumber: maskAccountNumber(row.accountNumber),
    accountHolderName: row.accountHolderName,
    bankName: row.bankName,
    isDefault: row.isDefault,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastFailureReason: row.lastFailureReason,
  };
}
