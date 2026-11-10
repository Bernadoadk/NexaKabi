import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SPOTLIGHT_PAYMENT_HOLD_MINUTES,
  SPOTLIGHT_REVIEW_HOURS,
  addSpotlightDays,
  buildSpotlightBookingMessage,
  countSpotlightDays,
  hasOrgPermission,
  listSpotlightDays,
  organizationLink,
  spotlightDayEnd,
  spotlightDayOf,
  spotlightDayStart,
  unstartedSpotlightDays,
  type CreateSpotlightBookingInput,
  type PaymentMethodCode,
  type PaymentState,
  type SpotlightBooking,
  type SpotlightBookingAdmin,
  type SpotlightBookingCreated,
  type SpotlightBookingOutcome,
  type SpotlightCalendarDay,
  type SpotlightCreditReason,
  type SpotlightIneligibility,
  type SpotlightOffer,
  type SpotlightSettings,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { runInBackground } from '../../infra/scheduling/background';
import type { Prisma } from '../../generated/prisma/client';
import { AUDIT_ACTIONS, AuditService } from '../audit/audit.service';
import { CountriesService } from '../countries/countries.service';
import { eventWithRelations, toEventSummary } from '../events/events.mapper';
import { LedgerService } from '../finance/ledger.service';
import { StorageProvider } from '../media/storage.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationAudienceService } from '../notifications/organization-audience.service';
import type { OrgContext } from '../organizations/guards/org-member.guard';
import { PaymentRoutingService } from '../payments/payment-routing.service';
import { PaymentsService } from '../payments/payments.service';
import {
  PAYMENT_GRACE_MS,
  bookingPreview,
  bookingWithRelations,
  dateColumn,
  dayOf,
  toSpotlightBooking,
  toSpotlightBookingAdmin,
  type BookingRow,
} from './spotlight-booking.mapper';
import { SpotlightCreditsService } from './spotlight-credits.service';
import { SpotlightSettingsService } from './spotlight-settings.service';
import { SpotlightStatsService } from './spotlight-stats.service';

type EventRow = Prisma.EventGetPayload<typeof eventWithRelations>;

/** Ce qui retire un événement de la vente — et donc de la une. */
export type EventUnavailableCause = 'CANCELLED' | 'UNPUBLISHED' | 'DELETED' | 'SOLD_OUT';

const CAUSE_LABELS: Readonly<Record<EventUnavailableCause, string>> = {
  CANCELLED: 'ton événement a été annulé',
  UNPUBLISHED: 'ton événement a été dépublié',
  DELETED: 'ton événement a été supprimé',
  SOLD_OUT: 'ton événement est complet — bravo',
};

/** Places montrées à l'organisateur pour un événement, les plus récentes d'abord. */
const BOOKINGS_PER_EVENT = 30;

/** Places récentes montrées dans la console, hors demandes à valider. */
const RECENT_BOOKINGS = 40;

const PERIOD_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Porto-Novo',
  day: 'numeric',
  month: 'short',
});

/**
 * Places à la une achetées par les organisateurs.
 *
 * ── Les règles, en une phrase chacune ───────────────────────────────────────
 *  · À la journée (minuit–minuit, Porto-Novo), dans `paidSlotsPerDay` places
 *    par jour et par pays, pour un événement publié d'une organisation
 *    vérifiée, au plus tôt dans `minLeadDays` jours — le temps de valider.
 *  · Payée par Mobile Money ou carte (fenêtre du prestataire), par le solde,
 *    ou par un avoir — en tout ou en partie.
 *  · Validée par l'équipe avant diffusion. Un REFUS rend l'argent au solde :
 *    c'est le seul cas où de l'argent revient.
 *  · Tout le reste — l'organisateur qui annule, l'événement annulé, dépublié
 *    ou complet, un retrait par l'équipe, une validation tardive — rend les
 *    jours NON COMMENCÉS en avoir de mise en avant, valable douze mois. Un
 *    jour entamé est dû.
 *
 * ── Pourquoi aucune tâche n'est indispensable ───────────────────────────────
 * Ce qui s'affiche se lit sur les dates. La tâche horaire (`settle`) ne fait
 * que CONCLURE : délais de paiement écoulés, bilans des places terminées. Elle
 * est aussi appelée à l'ouverture de l'onglet et de la console : un
 * planificateur en retard ne laisse jamais une place dans un état faux sous
 * les yeux de quelqu'un.
 */
@Injectable()
export class SpotlightBookingsService {
  private readonly logger = new Logger(SpotlightBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SpotlightSettingsService,
    private readonly countries: CountriesService,
    private readonly ledger: LedgerService,
    private readonly credits: SpotlightCreditsService,
    private readonly stats: SpotlightStatsService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    private readonly routing: PaymentRoutingService,
    private readonly storage: StorageProvider,
    private readonly notifications: NotificationsService,
    private readonly audience: OrganizationAudienceService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Espace organisateur
  // ───────────────────────────────────────────────────────────────────────────

  /** Tout l'onglet « Mise en avant » d'un événement, en une lecture. */
  async offer(context: OrgContext, eventId: string): Promise<SpotlightOffer> {
    const now = new Date();
    await this.settle(now, { organizationId: context.organizationId });

    const [settings, event, organization] = await Promise.all([
      this.settings.get(),
      this.requireEvent(context, eventId),
      this.loadOrganization(context.organizationId),
    ]);

    const country = await this.countries.find(event.countryCode);
    const currency = country?.currency ?? 'XOF';
    const price = settings.pricePerDay[event.countryCode] ?? null;
    const window = this.bookableWindow(settings, event, now);
    const ineligibility = this.ineligibility(settings, event, organization, price, window, now);

    const [calendar, credits, creditAvailable, balance, providerMethods, rows] = await Promise.all([
      window ? this.calendar(settings, event, window, now, ineligibility === null) : [],
      this.credits.list(context.organizationId, now),
      this.credits.available(this.prisma, context.organizationId, currency, now),
      hasOrgPermission(context.role, 'finance:read')
        ? this.ledger.balance(context.organizationId, now)
        : Promise.resolve(null),
      this.providerMethods(event.countryCode),
      this.prisma.spotlightBooking.findMany({
        ...bookingWithRelations,
        where: { eventId, organizationId: context.organizationId },
        orderBy: { createdAt: 'desc' },
        take: BOOKINGS_PER_EVENT,
      }),
    ]);

    const stats = await this.statsFor(rows);
    const canPayWithBalance =
      hasOrgPermission(context.role, 'payout:request') &&
      !organization.payoutFrozen &&
      organization.currency === currency;

    return {
      eligible: ineligibility === null,
      ineligibility,
      ineligibilityMessage: ineligibility
        ? this.ineligibilityMessage(ineligibility, settings, window)
        : null,
      countryCode: event.countryCode,
      currency,
      pricePerDay: price,
      paidSlotsPerDay: settings.paidSlotsPerDay,
      minLeadDays: settings.minLeadDays,
      maxDaysPerBooking: settings.maxDaysPerBooking,
      reviewHours: SPOTLIGHT_REVIEW_HOURS,
      holdMinutes: SPOTLIGHT_PAYMENT_HOLD_MINUTES,
      calendar,
      creditAvailable,
      credits: credits.filter((credit) => credit.currency === currency),
      balanceAvailable: balance?.availableAmount ?? null,
      canPayWithBalance,
      providerAvailable: providerMethods.length > 0,
      providerMethods,
      preview: bookingPreview(
        event,
        {
          id: 'apercu',
          imageUrl: null,
          videoUrl: null,
          videoPosterUrl: null,
          videoDurationSeconds: null,
        },
        settings,
        now,
      ),
      bookings: rows.map((row) => toSpotlightBooking(row, stats.get(row.id) ?? null, now)),
    };
  }

  /**
   * Demande une place.
   *
   * Tout se décide dans UNE transaction, sous le verrou de capacité du pays :
   * deux organisateurs qui visent la dernière place du même jour ne peuvent
   * pas l'obtenir tous les deux. Le solde, s'il paie, est relu sous son
   * propre verrou — un retrait parti au même instant ne dépense pas le même
   * argent (`LedgerService.lockBalance`).
   */
  async create(
    context: OrgContext,
    userId: string,
    eventId: string,
    input: CreateSpotlightBookingInput,
  ): Promise<SpotlightBookingCreated> {
    const now = new Date();
    const [settings, event, organization] = await Promise.all([
      this.settings.get(),
      this.requireEvent(context, eventId),
      this.loadOrganization(context.organizationId),
    ]);

    const country = await this.countries.requireActive(event.countryCode);
    const price = settings.pricePerDay[event.countryCode] ?? null;
    const window = this.bookableWindow(settings, event, now);
    const ineligibility = this.ineligibility(settings, event, organization, price, window, now);

    if (ineligibility || !window || price === null) {
      throw new BadRequestException(
        this.ineligibilityMessage(ineligibility ?? 'SALES_CLOSED', settings, window),
      );
    }

    if (input.startDay < window.first || input.endDay > window.last) {
      throw new BadRequestException(
        `Choisis des jours entre le ${formatDay(window.first)} et le ${formatDay(window.last)}.`,
      );
    }

    const days = countSpotlightDays(input.startDay, input.endDay);

    if (days > settings.maxDaysPerBooking) {
      throw new BadRequestException(
        `${settings.maxDaysPerBooking} jours au plus par demande. Fais-en une seconde pour la suite.`,
      );
    }

    // Un visuel ou une vidéo d'organisateur doit avoir été déposé chez nous :
    // la une le montrera à tous les visiteurs.
    if (input.imageUrl && !this.storage.isOwnPublicUrl(input.imageUrl)) {
      throw new BadRequestException(
        'Ce visuel n’a pas été déposé sur Nexa Kabi. Dépose-le de nouveau.',
      );
    }

    if (
      input.video &&
      (!this.storage.isOwnPublicUrl(input.video.url) ||
        !this.storage.isOwnPublicUrl(input.video.posterUrl))
    ) {
      throw new BadRequestException(
        'Cette vidéo n’a pas été déposée sur Nexa Kabi. Dépose-la de nouveau.',
      );
    }

    // Une organisation paie dans SA devise : un grand livre ne mélange jamais
    // deux devises, et un remboursement au solde doit pouvoir s'y écrire.
    if (country.currency !== organization.currency) {
      throw new BadRequestException(
        'Cet événement se déroule dans un pays dont la devise n’est pas celle de ton organisation : la mise en avant n’y est pas encore possible.',
      );
    }

    if (input.paymentMethod === 'BALANCE') {
      if (!hasOrgPermission(context.role, 'payout:request')) {
        throw new ForbiddenException(
          'Payer avec le solde demande le droit de retirer l’argent de l’organisation. Choisis Mobile Money ou carte.',
        );
      }

      if (organization.payoutFrozen) {
        throw new BadRequestException('Ton solde est gelé : paie par Mobile Money ou carte.');
      }
    }

    if (
      input.paymentMethod === 'PROVIDER' &&
      (await this.providerMethods(event.countryCode)).length === 0
    ) {
      throw new BadRequestException(
        'Le paiement par Mobile Money ou carte n’est pas disponible dans ce pays pour le moment.',
      );
    }

    const total = days * price;
    const reference = await this.uniqueReference();
    const holdUntil = new Date(now.getTime() + SPOTLIGHT_PAYMENT_HOLD_MINUTES * 60_000);

    const row = await this.prisma.$transaction(
      async (tx) => {
        await lockCapacity(tx, event.countryCode);

        const holding = await this.holdingBookings(
          tx,
          event.countryCode,
          input.startDay,
          input.endDay,
          now,
        );

        if (holding.some((booking) => booking.eventId === eventId)) {
          throw new ConflictException(
            'Cet événement a déjà une place à la une sur une partie de ces jours.',
          );
        }

        for (const day of listSpotlightDays(input.startDay, input.endDay)) {
          const taken = holding.filter((booking) => covers(booking, day)).length;

          if (taken >= settings.paidSlotsPerDay) {
            throw new ConflictException(
              `Plus aucune place le ${formatDay(day)} : quelqu’un vient de la prendre. Choisis d’autres jours.`,
            );
          }
        }

        const editorial = await tx.spotlight.findFirst({
          where: {
            eventId,
            status: 'ACTIVE',
            startsAt: { lt: spotlightDayEnd(input.endDay) },
            endsAt: { gt: spotlightDayStart(input.startDay) },
          },
          select: { id: true },
        });

        if (editorial) {
          throw new ConflictException(
            'L’équipe met déjà cet événement à la une sur une partie de ces jours : choisis d’autres dates.',
          );
        }

        const created = await tx.spotlightBooking.create({
          data: {
            reference,
            organizationId: context.organizationId,
            eventId,
            countryCode: event.countryCode,
            requestedById: userId,
            status: 'AWAITING_PAYMENT',
            startDay: dateColumn(input.startDay),
            endDay: dateColumn(input.endDay),
            days,
            startsAt: spotlightDayStart(input.startDay),
            endsAt: spotlightDayEnd(input.endDay),
            pricePerDay: price,
            totalAmount: total,
            creditAmount: 0,
            chargedAmount: total,
            currency: country.currency,
            paymentMethod: input.paymentMethod,
            holdExpiresAt: holdUntil,
            imageUrl: input.imageUrl ?? null,
            videoUrl: input.video?.url ?? null,
            videoPosterUrl: input.video?.posterUrl ?? null,
            videoDurationSeconds: input.video?.durationSeconds ?? null,
          },
          select: { id: true },
        });

        const covered = await this.credits.consume(tx, {
          organizationId: context.organizationId,
          currency: country.currency,
          amount: total,
          bookingId: created.id,
          now,
        });

        const charged = total - covered;
        let settled = false;

        if (charged > 0 && input.paymentMethod === 'BALANCE') {
          await this.ledger.lockBalance(tx, context.organizationId);
          const available = await this.ledger.availableIn(tx, context.organizationId, now);

          if (available < charged) {
            throw new BadRequestException(
              `Ton solde disponible (${formatMoney(Math.max(available, 0), country.currency)}) ne couvre pas ${formatMoney(charged, country.currency)}. Paie par Mobile Money ou carte.`,
            );
          }

          await this.ledger.write(tx, {
            organizationId: context.organizationId,
            type: 'SPOTLIGHT_PURCHASE',
            amount: -charged,
            currency: country.currency,
            eventId,
            spotlightBookingId: created.id,
            description: `Mise en avant ${reference} · ${days} jour${days > 1 ? 's' : ''} · ${event.title}`,
          });

          settled = true;
        }

        return tx.spotlightBooking.update({
          where: { id: created.id },
          data: {
            creditAmount: covered,
            chargedAmount: charged,
            paymentMethod: charged === 0 ? 'CREDIT' : input.paymentMethod,
            ...(charged === 0 || settled
              ? { status: 'PENDING_REVIEW' as const, paidAt: now, holdExpiresAt: null }
              : {}),
          },
          ...bookingWithRelations,
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightBookingRequested,
      entityType: 'SpotlightBooking',
      entityId: row.id,
      actorUserId: userId,
      organizationId: context.organizationId,
      changes: {
        reference,
        eventId,
        startDay: input.startDay,
        endDay: input.endDay,
        days,
        total,
        creditAmount: row.creditAmount,
        chargedAmount: row.chargedAmount,
        paymentMethod: row.paymentMethod,
      },
    });

    if (row.status === 'PENDING_REVIEW') {
      await this.audit.record({
        action: AUDIT_ACTIONS.spotlightBookingPaid,
        entityType: 'SpotlightBooking',
        entityId: row.id,
        actorUserId: userId,
        organizationId: context.organizationId,
        changes: { paymentMethod: row.paymentMethod, chargedAmount: row.chargedAmount },
      });
    }

    return {
      booking: toSpotlightBooking(row, null, now),
      awaitingPayment: row.status === 'AWAITING_PAYMENT',
    };
  }

  /** Ouvre (ou rouvre) la fenêtre de paiement d'une place qui attend son paiement. */
  async pay(
    context: OrgContext,
    userId: string,
    eventId: string,
    bookingId: string,
    method: PaymentMethodCode,
  ): Promise<PaymentState> {
    const booking = await this.requireOwned(context, eventId, bookingId);
    const now = new Date();

    if (booking.status !== 'AWAITING_PAYMENT' || booking.paymentMethod !== 'PROVIDER') {
      throw new ConflictException('Cette place n’attend aucun paiement.');
    }

    if (!booking.holdExpiresAt || booking.holdExpiresAt <= now) {
      throw new ConflictException(
        'Le délai de paiement est écoulé. Refais ta demande : les jours sont peut-être encore libres.',
      );
    }

    return this.payments.initiateForBooking({
      bookingId: booking.id,
      reference: booking.reference,
      countryCode: booking.countryCode,
      currency: booking.currency,
      amount: booking.chargedAmount,
      method,
      // Les jours restent retenus pendant le délai de grâce : un paiement validé
      // à la dernière seconde arrive sur une place encore réservée.
      expiresAt: new Date(booking.holdExpiresAt.getTime() + PAYMENT_GRACE_MS),
      actorUserId: userId,
    });
  }

  async paymentState(
    context: OrgContext,
    eventId: string,
    bookingId: string,
    paymentId: string,
  ): Promise<PaymentState> {
    const booking = await this.requireOwned(context, eventId, bookingId);
    return this.payments.getBookingPaymentState(booking.id, booking.reference, paymentId);
  }

  async confirmPayment(
    context: OrgContext,
    eventId: string,
    bookingId: string,
    paymentId: string,
    providerReference: string,
  ): Promise<PaymentState> {
    const booking = await this.requireOwned(context, eventId, bookingId);
    return this.payments.confirmForBooking(
      booking.id,
      booking.reference,
      paymentId,
      providerReference,
    );
  }

  /**
   * L'organisateur annule.
   *
   * Pas encore payée : rien n'a été prélevé, l'avoir engagé revient tel quel.
   * Payée : les jours qui n'ont pas commencé reviennent en avoir — y compris
   * avant la validation. Le jour entamé est dû.
   */
  async cancel(
    context: OrgContext,
    userId: string,
    eventId: string,
    bookingId: string,
  ): Promise<SpotlightBooking> {
    await this.requireOwned(context, eventId, bookingId);
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);

      if (booking.status === 'AWAITING_PAYMENT') {
        await this.credits.restore(tx, booking.id, now);
        await tx.spotlightBooking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        return { credit: 0, booking };
      }

      const live = booking.status === 'APPROVED' && booking.endsAt > now;

      if (booking.status !== 'PENDING_REVIEW' && !live) {
        throw new ConflictException('Cette place ne peut plus être annulée.');
      }

      const credit = creditableAmount(booking, now);

      await this.credits.issue(tx, {
        organizationId: booking.organizationId,
        currency: booking.currency,
        amount: credit,
        reason: 'CANCELLATION',
        note: `Annulation de la place ${booking.reference}`,
        bookingId: booking.id,
        now,
      });

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: { status: 'CANCELLED', cancelledAt: now, creditedAmount: { increment: credit } },
      });

      if (booking.spotlightId) await withdrawSpotlight(tx, booking.spotlightId, now);

      return { credit, booking };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightBookingCancelled,
      entityType: 'SpotlightBooking',
      entityId: bookingId,
      actorUserId: userId,
      organizationId: context.organizationId,
      changes: { credit: outcome.credit, from: outcome.booking.status },
    });

    if (outcome.credit > 0) {
      await this.notify(bookingId, 'CANCELLED', { amount: outcome.credit });
    }

    return this.toBooking(await this.requireOwned(context, eventId, bookingId), now);
  }

  /** Une place et ce qu'il faut pour son reçu. */
  async receiptData(context: OrgContext, eventId: string, bookingId: string) {
    const booking = await this.requireOwned(context, eventId, bookingId);

    if (!booking.paidAt) {
      throw new NotFoundException('Cette place n’a pas encore été réglée : aucun reçu n’existe.');
    }

    const [organization, payment] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: booking.organizationId },
        select: { name: true, legalName: true, email: true, phone: true },
      }),
      this.prisma.payment.findFirst({
        where: { spotlightBookingId: booking.id, status: 'SUCCEEDED' },
        select: { methodCode: true, providerReference: true, confirmedAt: true },
      }),
    ]);

    return { booking, organization, payment };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Console
  // ───────────────────────────────────────────────────────────────────────────

  /** Demandes à valider (les plus anciennes d'abord) et places récentes. */
  async adminOverview(): Promise<{
    pending: SpotlightBookingAdmin[];
    recent: SpotlightBookingAdmin[];
  }> {
    const now = new Date();
    await this.settle(now);

    const [settings, pending, recent] = await Promise.all([
      this.settings.get(),
      this.prisma.spotlightBooking.findMany({
        ...bookingWithRelations,
        where: { status: 'PENDING_REVIEW' },
        orderBy: { paidAt: 'asc' },
      }),
      this.prisma.spotlightBooking.findMany({
        ...bookingWithRelations,
        where: { status: { notIn: ['PENDING_REVIEW'] } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_BOOKINGS,
      }),
    ]);

    const rows = [...pending, ...recent];
    const stats = await this.statsFor(rows);
    const previews = await this.previewsFor(pending, settings, now);

    return {
      pending: pending.map((row) =>
        toSpotlightBookingAdmin(row, stats.get(row.id) ?? null, now, previews.get(row.id) ?? null),
      ),
      recent: recent.map((row) =>
        toSpotlightBookingAdmin(row, stats.get(row.id) ?? null, now, null),
      ),
    };
  }

  async adminGet(bookingId: string): Promise<SpotlightBookingAdmin> {
    const now = new Date();
    const row = await this.requireBooking(bookingId);
    const [settings, stats] = await Promise.all([this.settings.get(), this.statsFor([row])]);
    const previews = await this.previewsFor([row], settings, now);

    return toSpotlightBookingAdmin(
      row,
      stats.get(row.id) ?? null,
      now,
      previews.get(row.id) ?? null,
    );
  }

  /**
   * Valider : la place devient une mise en avant, diffusée sur ses dates.
   *
   * Validée APRÈS le début de sa diffusion, la place a perdu des jours de
   * notre fait : chaque jour commencé avant la validation est rendu en avoir.
   */
  async approve(bookingId: string, adminId: string): Promise<SpotlightBookingAdmin> {
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);

      if (booking.status !== 'PENDING_REVIEW') {
        throw new ConflictException('Cette demande n’attend plus de décision.');
      }

      if (booking.endsAt <= now) {
        throw new BadRequestException(
          'Sa période est passée : refuse la demande, l’organisateur sera remboursé.',
        );
      }

      const event = await tx.event.findUnique({
        where: { id: booking.eventId },
        select: { status: true, visibility: true, deletedAt: true, endsAt: true },
      });

      if (
        !event ||
        event.deletedAt ||
        event.status !== 'PUBLISHED' ||
        event.visibility !== 'PUBLIC' ||
        event.endsAt <= now
      ) {
        throw new BadRequestException(
          'L’événement n’est plus en vente : refuse la demande, l’organisateur sera remboursé.',
        );
      }

      const last = await tx.spotlight.aggregate({
        where: { status: 'ACTIVE', endsAt: { gt: now } },
        _max: { position: true },
      });

      const spotlight = await tx.spotlight.create({
        data: {
          kind: 'EVENT',
          source: 'PAID',
          eventId: booking.eventId,
          countryCode: booking.countryCode,
          imageUrl: booking.imageUrl,
          videoUrl: booking.videoUrl,
          videoPosterUrl: booking.videoPosterUrl,
          videoDurationSeconds: booking.videoDurationSeconds,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          position: (last._max.position ?? -1) + 1,
          createdById: adminId,
        },
        select: { id: true },
      });

      // Jours commencés avant la validation : perdus de notre fait.
      const started = booking.days - unstartedSpotlightDays(bookingDays(booking), now);
      const lateCredit = Math.min(
        started * booking.pricePerDay,
        booking.totalAmount - booking.creditedAmount - booking.refundedAmount,
      );

      await this.credits.issue(tx, {
        organizationId: booking.organizationId,
        currency: booking.currency,
        amount: lateCredit,
        reason: 'LATE_REVIEW',
        note: `Validation tardive de la place ${booking.reference}`,
        bookingId: booking.id,
        now,
      });

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: {
          status: 'APPROVED',
          reviewedAt: now,
          reviewedById: adminId,
          spotlightId: spotlight.id,
          creditedAmount: { increment: lateCredit },
        },
      });

      return { spotlightId: spotlight.id, lateCredit };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightBookingApproved,
      entityType: 'SpotlightBooking',
      entityId: bookingId,
      actorType: 'ADMIN',
      actorUserId: adminId,
      changes: outcome,
    });

    await this.notify(bookingId, 'APPROVED', {
      reason:
        outcome.lateCredit > 0
          ? `Validée après le début de la diffusion : les jours concernés te sont rendus en avoir`
          : null,
    });

    return this.adminGet(bookingId);
  }

  /**
   * Refuser : le seul cas où de l'argent revient. La part payée retourne au
   * solde de l'organisation — immédiatement disponible, retirable —, la part
   * payée par avoir retourne à l'avoir.
   */
  async reject(
    bookingId: string,
    adminId: string | null,
    reason: string,
  ): Promise<SpotlightBookingAdmin> {
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);

      if (booking.status !== 'PENDING_REVIEW') {
        throw new ConflictException('Cette demande n’attend plus de décision.');
      }

      const restored = await this.credits.restore(tx, booking.id, now);
      const refund = Math.min(
        booking.chargedAmount,
        booking.totalAmount - booking.creditedAmount - booking.refundedAmount,
      );

      if (refund > 0) {
        const payment = await tx.payment.findFirst({
          where: { spotlightBookingId: booking.id, status: 'SUCCEEDED' },
          select: { id: true },
        });

        await this.ledger.write(tx, {
          organizationId: booking.organizationId,
          type: 'SPOTLIGHT_REFUND',
          amount: refund,
          currency: booking.currency,
          eventId: booking.eventId,
          paymentId: payment?.id,
          spotlightBookingId: booking.id,
          description: `Mise en avant ${booking.reference} refusée : ${formatMoney(refund, booking.currency)} rendus`,
        });
      }

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          reviewedAt: now,
          reviewedById: adminId,
          refundedAmount: { increment: refund },
        },
      });

      return { refund, restored };
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightBookingRejected,
      entityType: 'SpotlightBooking',
      entityId: bookingId,
      actorType: adminId ? 'ADMIN' : 'SYSTEM',
      actorUserId: adminId ?? undefined,
      changes: { reason, ...outcome },
    });

    await this.notify(bookingId, 'REJECTED', {
      amount: outcome.refund,
      restored: outcome.restored,
      reason,
    });

    return this.adminGet(bookingId);
  }

  /** Geste de l'équipe : des jours rendus en avoir — une panne de la une, un incident. */
  async grantCredit(
    bookingId: string,
    adminId: string,
    days: number,
    reason: string,
  ): Promise<SpotlightBookingAdmin> {
    const now = new Date();

    const amount = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);

      if (!['APPROVED', 'COMPLETED', 'INTERRUPTED', 'CANCELLED'].includes(booking.status)) {
        throw new ConflictException('Un avoir se rend sur une place qui a été diffusée.');
      }

      const credit = Math.min(
        days * booking.pricePerDay,
        booking.totalAmount - booking.creditedAmount - booking.refundedAmount,
      );

      if (credit <= 0) {
        throw new BadRequestException('Toute la valeur de cette place a déjà été rendue.');
      }

      await this.credits.issue(tx, {
        organizationId: booking.organizationId,
        currency: booking.currency,
        amount: credit,
        reason: 'GESTURE',
        note: reason,
        bookingId: booking.id,
        grantedById: adminId,
        now,
      });

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: { creditedAmount: { increment: credit } },
      });

      return credit;
    });

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightCreditGranted,
      entityType: 'SpotlightBooking',
      entityId: bookingId,
      actorType: 'ADMIN',
      actorUserId: adminId,
      changes: { days, amount, reason },
    });

    await this.notify(bookingId, 'CREDITED', { amount, reason, unique: true });

    return this.adminGet(bookingId);
  }

  /**
   * La mise en avant d'une place payée vient d'être retirée par l'équipe : la
   * place s'interrompt. Les jours non commencés sont rendus — sauf décision
   * contraire, motivée.
   */
  async interruptByTeam(
    spotlightId: string,
    adminId: string,
    options: { compensate: boolean; reason: string | null },
  ): Promise<void> {
    const booking = await this.prisma.spotlightBooking.findUnique({
      where: { spotlightId },
      select: { id: true },
    });

    if (!booking) return;

    await this.interrupt(booking.id, {
      reasonText: options.reason ?? 'retirée de la une par l’équipe',
      creditReason: 'WITHDRAWAL',
      compensate: options.compensate,
      actorUserId: adminId,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Réactions
  // ───────────────────────────────────────────────────────────────────────────

  /** Un événement quitte la vente : ses places s'interrompent. */
  @OnEvent('event.unavailable')
  onEventUnavailable(payload: { eventId: string; cause: EventUnavailableCause }): void {
    runInBackground(`Places à la une de ${payload.eventId}`, () =>
      this.interruptForEvent(payload.eventId, payload.cause),
    );
  }

  /**
   * Une vente peut rendre l'événement complet : la une n'a alors plus rien à
   * vendre, et ses jours restants reviennent à l'organisateur.
   */
  @OnEvent('order.paid')
  onOrderPaid({ orderId }: { orderId: string }): void {
    runInBackground(`Complet ? (${orderId})`, async () => {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { eventId: true },
      });

      if (!order) return;

      const now = new Date();
      const active = await this.prisma.spotlightBooking.count({
        where: {
          eventId: order.eventId,
          status: { in: ['PENDING_REVIEW', 'APPROVED'] },
          endsAt: { gt: now },
        },
      });

      if (active === 0) return;

      const event = await this.prisma.event.findUnique({
        ...eventWithRelations,
        where: { id: order.eventId },
      });

      if (event && toEventSummary(event, now).isSoldOut) {
        await this.interruptForEvent(order.eventId, 'SOLD_OUT');
      }
    });
  }

  @OnEvent('spotlight-booking.paid')
  onPaid({ bookingId, paymentId }: { bookingId: string; paymentId: string }): void {
    runInBackground(`Place ${bookingId} payée`, () =>
      this.audit.record({
        action: AUDIT_ACTIONS.spotlightBookingPaid,
        entityType: 'SpotlightBooking',
        entityId: bookingId,
        actorType: 'SYSTEM',
        changes: { paymentId, paymentMethod: 'PROVIDER' },
      }),
    );
  }

  @OnEvent('spotlight-booking.unfulfillable')
  onUnfulfillable({ bookingId, paymentId }: { bookingId: string; paymentId: string }): void {
    runInBackground(`Place ${bookingId} réglée trop tard`, async () => {
      const booking = await this.prisma.spotlightBooking.findUnique({
        where: { id: bookingId },
        select: { refundedAmount: true },
      });

      await this.audit.record({
        action: AUDIT_ACTIONS.spotlightBookingUnfulfillable,
        entityType: 'SpotlightBooking',
        entityId: bookingId,
        actorType: 'SYSTEM',
        changes: { paymentId, refunded: booking?.refundedAmount ?? 0 },
      });

      await this.notify(bookingId, 'UNFULFILLABLE', { amount: booking?.refundedAmount ?? 0 });
    });
  }

  async interruptForEvent(eventId: string, cause: EventUnavailableCause): Promise<number> {
    const now = new Date();
    const bookings = await this.prisma.spotlightBooking.findMany({
      where: {
        eventId,
        OR: [
          { status: { in: ['AWAITING_PAYMENT', 'PENDING_REVIEW'] } },
          { status: 'APPROVED', endsAt: { gt: now } },
        ],
      },
      select: { id: true },
    });

    for (const booking of bookings) {
      await this.interrupt(booking.id, {
        reasonText: CAUSE_LABELS[cause],
        creditReason: 'INTERRUPTION',
        compensate: true,
        actorUserId: null,
      });
    }

    return bookings.length;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Conclusions
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Conclut ce que le temps a tranché :
   *  · délais de paiement écoulés (grâce comprise) → non payée, avoir rendu ;
   *  · places validées arrivées à leur fin → terminées, bilan envoyé ;
   *  · demandes jamais examinées avant la fin de leur période → refusées,
   *    argent rendu.
   *
   * Chaque place est reprise sous son verrou, état relu : appelée en même
   * temps par la tâche et par un écran, elle ne conclut qu'une fois.
   */
  async settle(
    now = new Date(),
    scope: { organizationId?: string } = {},
  ): Promise<{ expired: number; completed: number; rejected: number }> {
    const where = scope.organizationId ? { organizationId: scope.organizationId } : {};

    const [stale, ended, unreviewed] = await Promise.all([
      this.prisma.spotlightBooking.findMany({
        where: {
          ...where,
          status: 'AWAITING_PAYMENT',
          holdExpiresAt: { lt: new Date(now.getTime() - PAYMENT_GRACE_MS) },
        },
        select: { id: true },
        take: 100,
      }),
      this.prisma.spotlightBooking.findMany({
        where: { ...where, status: 'APPROVED', endsAt: { lte: now } },
        select: { id: true },
        take: 100,
      }),
      this.prisma.spotlightBooking.findMany({
        where: { ...where, status: 'PENDING_REVIEW', endsAt: { lte: now } },
        select: { id: true },
        take: 100,
      }),
    ]);

    let expired = 0;
    for (const { id } of stale) {
      if (await this.expire(id, now)) expired += 1;
    }

    let completed = 0;
    for (const { id } of ended) {
      if (await this.complete(id, now)) completed += 1;
    }

    let rejected = 0;
    for (const { id } of unreviewed) {
      try {
        await this.reject(
          id,
          null,
          'Ta demande n’a pas pu être examinée avant la fin de sa période',
        );
        rejected += 1;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }

    if (expired + completed + rejected > 0) {
      this.logger.log(
        `Places à la une : ${expired} non payée(s), ${completed} terminée(s), ${rejected} refusée(s) faute d’examen`,
      );
    }

    return { expired, completed, rejected };
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async expire(bookingId: string, now: Date): Promise<boolean> {
    const done = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);
      if (booking.status !== 'AWAITING_PAYMENT') return false;

      await this.credits.restore(tx, booking.id, now);
      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: { status: 'EXPIRED' },
      });

      return true;
    });

    if (done) {
      await this.audit.record({
        action: AUDIT_ACTIONS.spotlightBookingExpired,
        entityType: 'SpotlightBooking',
        entityId: bookingId,
        actorType: 'SYSTEM',
      });
    }

    return done;
  }

  /**
   * Une place validée arrive à sa fin : terminée, et son bilan part.
   *
   * Si l'événement s'est terminé avant elle (dates avancées par
   * l'organisateur), les jours d'après n'ont rien montré : ils sont rendus.
   */
  private async complete(bookingId: string, now: Date): Promise<boolean> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);
      if (booking.status !== 'APPROVED' || booking.endsAt > now) return null;

      const event = await tx.event.findUnique({
        where: { id: booking.eventId },
        select: { endsAt: true },
      });

      let credit = 0;

      if (event && event.endsAt < booking.endsAt) {
        const dead = listSpotlightDays(dayOf(booking.startDay), dayOf(booking.endDay)).filter(
          (day) => spotlightDayStart(day) >= event.endsAt,
        ).length;

        credit = Math.min(
          dead * booking.pricePerDay,
          booking.totalAmount - booking.creditedAmount - booking.refundedAmount,
        );

        await this.credits.issue(tx, {
          organizationId: booking.organizationId,
          currency: booking.currency,
          amount: credit,
          reason: 'INTERRUPTION',
          note: `Jours de la place ${booking.reference} après la fin de l’événement`,
          bookingId: booking.id,
          now,
        });
      }

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          reportSentAt: now,
          creditedAmount: { increment: credit },
        },
      });

      return { credit };
    });

    if (!outcome) return false;

    const row = await this.requireBooking(bookingId);
    const stats = (await this.statsFor([row])).get(row.id);

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightBookingCompleted,
      entityType: 'SpotlightBooking',
      entityId: bookingId,
      actorType: 'SYSTEM',
      changes: { credit: outcome.credit, ...(stats ?? {}) },
    });

    await this.notify(bookingId, 'COMPLETED', {
      report: stats
        ? { views: stats.views, clicks: stats.clicks, tickets: stats.tickets ?? 0 }
        : null,
    });

    return true;
  }

  /** Interrompt une place, quelle qu'en soit la cause. */
  private async interrupt(
    bookingId: string,
    options: {
      reasonText: string;
      creditReason: SpotlightCreditReason;
      compensate: boolean;
      actorUserId: string | null;
    },
  ): Promise<void> {
    const now = new Date();

    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await lockBooking(tx, bookingId);

      if (booking.status === 'AWAITING_PAYMENT') {
        // Rien n'a été payé : l'avoir engagé revient, aucun autre geste.
        await this.credits.restore(tx, booking.id, now);
        await tx.spotlightBooking.update({
          where: { id: booking.id },
          data: {
            status: 'INTERRUPTED',
            interruptedAt: now,
            interruptionReason: options.reasonText,
          },
        });
        return { credit: 0, paid: false };
      }

      const live = booking.status === 'APPROVED' && booking.endsAt > now;
      if (booking.status !== 'PENDING_REVIEW' && !live) return null;

      const credit = options.compensate ? creditableAmount(booking, now) : 0;

      await this.credits.issue(tx, {
        organizationId: booking.organizationId,
        currency: booking.currency,
        amount: credit,
        reason: options.creditReason,
        note: `Place ${booking.reference} : ${options.reasonText}`,
        bookingId: booking.id,
        now,
      });

      await tx.spotlightBooking.update({
        where: { id: booking.id },
        data: {
          status: 'INTERRUPTED',
          interruptedAt: now,
          interruptionReason: options.reasonText,
          creditedAmount: { increment: credit },
        },
      });

      if (booking.spotlightId) await withdrawSpotlight(tx, booking.spotlightId, now);

      return { credit, paid: true };
    });

    if (!outcome) return;

    await this.audit.record({
      action: AUDIT_ACTIONS.spotlightBookingInterrupted,
      entityType: 'SpotlightBooking',
      entityId: bookingId,
      actorType: options.actorUserId ? 'ADMIN' : 'SYSTEM',
      actorUserId: options.actorUserId ?? undefined,
      changes: { reason: options.reasonText, credit: outcome.credit },
    });

    if (outcome.paid) {
      await this.notify(bookingId, 'INTERRUPTED', {
        amount: outcome.credit,
        reason: options.reasonText,
      });
    }
  }

  /** Prévient les membres qui gèrent la promotion de l'organisation. Ne lève jamais. */
  private async notify(
    bookingId: string,
    outcome: SpotlightBookingOutcome,
    extras: {
      amount?: number;
      /** Avoir rendu tel quel (refus d'une place payée par avoir). */
      restored?: number;
      reason?: string | null;
      report?: { views: number; clicks: number; tickets: number } | null;
      unique?: boolean;
    },
  ): Promise<void> {
    try {
      const booking = await this.prisma.spotlightBooking.findUniqueOrThrow({
        where: { id: bookingId },
        select: {
          id: true,
          reference: true,
          organizationId: true,
          eventId: true,
          startDay: true,
          endDay: true,
          currency: true,
          event: { select: { title: true } },
        },
      });

      const message = buildSpotlightBookingMessage({
        outcome,
        eventTitle: booking.event.title,
        periodLabel: periodLabel(dayOf(booking.startDay), dayOf(booking.endDay)),
        amountLabel: extras.amount ? formatMoney(extras.amount, booking.currency) : null,
        restoredCreditLabel: extras.restored
          ? formatMoney(extras.restored, booking.currency)
          : null,
        reason: extras.reason ?? null,
        report: extras.report ?? null,
      });

      const recipients = await this.audience.recipients(booking.organizationId, 'promo:manage', {
        eventId: booking.eventId,
      });

      for (const userId of recipients) {
        await this.notifications.notify({
          userId,
          type: 'SPOTLIGHT_UPDATED',
          title: message.title,
          body: message.body,
          actionUrl: organizationLink(
            booking.organizationId,
            `/pro/evenements/${booking.eventId}/mise-en-avant`,
          ),
          actionLabel: outcome === 'COMPLETED' ? 'Voir le bilan' : 'Voir la mise en avant',
          eventId: booking.eventId,
          // Chaque issue n'arrive qu'une fois par place — sauf un geste de
          // l'équipe, qui peut se répéter.
          dedupeKey: `spotlight:${booking.id}:${outcome}${extras.unique ? `:${Date.now()}` : ''}`,
        });
      }
    } catch (error) {
      this.logger.error({ err: error }, `Annonce de la place ${bookingId} (${outcome}) impossible`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Calendrier
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Premier et dernier jours réservables pour un événement : pas avant
   * `minLeadDays` (le temps de valider), pas au-delà de l'horizon, et pas
   * après le dernier jour où l'événement peut encore vendre.
   */
  private bookableWindow(
    settings: SpotlightSettings,
    event: { startsAt: Date; endsAt: Date },
    now: Date,
  ): { first: string; last: string } | null {
    const today = spotlightDayOf(now);
    const first = addSpotlightDays(today, settings.minLeadDays);
    const byHorizon = addSpotlightDays(today, settings.horizonDays);
    const byEvent = lastPromotableDay(event);
    const last = byHorizon < byEvent ? byHorizon : byEvent;

    return first <= last ? { first, last } : null;
  }

  private ineligibility(
    settings: SpotlightSettings,
    event: EventRow,
    organization: { verificationStatus: string },
    price: number | null,
    window: { first: string; last: string } | null,
    now: Date,
  ): SpotlightIneligibility | null {
    if (!settings.salesEnabled || settings.paidSlotsPerDay === 0) return 'SALES_CLOSED';
    if (price === null) return 'COUNTRY_CLOSED';
    if (organization.verificationStatus !== 'VERIFIED') return 'NOT_VERIFIED';

    if (
      event.status !== 'PUBLISHED' ||
      event.visibility !== 'PUBLIC' ||
      event.endsAt <= now ||
      toEventSummary(event, now).isSoldOut
    ) {
      return 'EVENT_NOT_LIVE';
    }

    if (!window) return 'EVENT_ENDING';

    return null;
  }

  private ineligibilityMessage(
    reason: SpotlightIneligibility,
    settings: SpotlightSettings,
    window: { first: string; last: string } | null,
  ): string {
    switch (reason) {
      case 'SALES_CLOSED':
        return 'La mise en avant n’est pas ouverte pour le moment. Reviens bientôt.';
      case 'COUNTRY_CLOSED':
        return 'La mise en avant n’est pas encore ouverte dans le pays de cet événement.';
      case 'NOT_VERIFIED':
        return 'La mise en avant est réservée aux organisations vérifiées. Fais vérifier la tienne : cela prend moins de 24 h.';
      case 'EVENT_NOT_LIVE':
        return 'Seul un événement publié, public, à venir et pas encore complet peut passer à la une.';
      case 'EVENT_ENDING':
        return window
          ? 'Ton événement a lieu trop tôt pour une mise en avant.'
          : `La diffusion commence au plus tôt dans ${settings.minLeadDays} jours — le temps pour l’équipe de valider : ton événement a lieu trop tôt.`;
    }
  }

  private async calendar(
    settings: SpotlightSettings,
    event: EventRow,
    window: { first: string; last: string },
    now: Date,
    eligible: boolean,
  ): Promise<SpotlightCalendarDay[]> {
    const [holding, editorial] = await Promise.all([
      this.holdingBookings(this.prisma, event.countryCode, window.first, window.last, now),
      this.prisma.spotlight.findMany({
        where: {
          eventId: event.id,
          status: 'ACTIVE',
          startsAt: { lt: spotlightDayEnd(window.last) },
          endsAt: { gt: spotlightDayStart(window.first) },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    return listSpotlightDays(window.first, window.last).map((day) => {
      const taken = holding.filter((booking) => covers(booking, day)).length;
      const free = Math.max(0, settings.paidSlotsPerDay - taken);
      const mine = holding.some((booking) => booking.eventId === event.id && covers(booking, day));
      const featured = editorial.some(
        (spotlight) =>
          spotlight.startsAt < spotlightDayEnd(day) && spotlight.endsAt > spotlightDayStart(day),
      );

      const reason = mine
        ? 'Déjà réservé pour cet événement'
        : featured
          ? 'Déjà à la une (choix de l’équipe)'
          : free === 0
            ? 'Complet'
            : null;

      return {
        day,
        free,
        capacity: settings.paidSlotsPerDay,
        selectable: eligible && reason === null,
        reason,
      };
    });
  }

  /** Places qui retiennent au moins un jour de `[first, last]` dans un pays. */
  private holdingBookings(
    client: PrismaService | Prisma.TransactionClient,
    countryCode: string,
    first: string,
    last: string,
    now: Date,
  ): Promise<Array<{ id: string; eventId: string; startDay: Date; endDay: Date }>> {
    return client.spotlightBooking.findMany({
      where: {
        countryCode,
        startDay: { lte: dateColumn(last) },
        endDay: { gte: dateColumn(first) },
        OR: [
          { status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
          {
            status: 'AWAITING_PAYMENT',
            holdExpiresAt: { gt: new Date(now.getTime() - PAYMENT_GRACE_MS) },
          },
        ],
      },
      select: { id: true, eventId: true, startDay: true, endDay: true },
    });
  }

  private async providerMethods(countryCode: string): Promise<SpotlightOffer['providerMethods']> {
    try {
      const methods = await this.routing.listCollectionMethods(countryCode);
      return methods.methods
        .filter((method) => method.flow === 'widget')
        .map((method) => ({
          code: method.code,
          label: method.label,
          kind: method.kind,
          logo: method.logo,
        }));
    } catch {
      return [];
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async requireEvent(context: OrgContext, eventId: string): Promise<EventRow> {
    const event = await this.prisma.event.findFirst({
      ...eventWithRelations,
      where: { id: eventId, organizationId: context.organizationId, deletedAt: null },
    });

    if (!event) {
      throw new NotFoundException('Cet événement n’existe pas.');
    }

    return event;
  }

  private async loadOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        verificationStatus: true,
        payoutFrozen: true,
        country: { select: { currency: true } },
      },
    });

    return {
      verificationStatus: organization.verificationStatus,
      payoutFrozen: organization.payoutFrozen,
      currency: organization.country.currency,
    };
  }

  private async requireOwned(
    context: OrgContext,
    eventId: string,
    bookingId: string,
  ): Promise<BookingRow> {
    const booking = await this.prisma.spotlightBooking.findFirst({
      ...bookingWithRelations,
      where: { id: bookingId, eventId, organizationId: context.organizationId },
    });

    if (!booking) {
      throw new NotFoundException('Cette place n’existe pas.');
    }

    return booking;
  }

  private async requireBooking(bookingId: string): Promise<BookingRow> {
    const booking = await this.prisma.spotlightBooking.findUnique({
      ...bookingWithRelations,
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Cette place n’existe pas.');
    }

    return booking;
  }

  private async toBooking(row: BookingRow, now: Date): Promise<SpotlightBooking> {
    const stats = await this.statsFor([row]);
    return toSpotlightBooking(row, stats.get(row.id) ?? null, now);
  }

  /** Bilan de chaque place, par sa mise en avant — `null` tant qu'elle n'a pas été validée. */
  private async statsFor(rows: readonly BookingRow[]) {
    const pairs = rows.flatMap((row) =>
      row.spotlight ? [{ bookingId: row.id, spotlight: row.spotlight }] : [],
    );
    const bySpotlight = await this.stats.forSpotlights(pairs.map((pair) => pair.spotlight));

    return new Map(
      pairs.map((pair) => [pair.bookingId, bySpotlight.get(pair.spotlight.id) ?? null] as const),
    );
  }

  private async previewsFor(rows: readonly BookingRow[], settings: SpotlightSettings, now: Date) {
    if (rows.length === 0) return new Map<string, ReturnType<typeof bookingPreview>>();

    const events = await this.prisma.event.findMany({
      ...eventWithRelations,
      where: { id: { in: [...new Set(rows.map((row) => row.eventId))] } },
    });

    const byId = new Map(events.map((event) => [event.id, event]));

    return new Map(
      rows.flatMap((row) => {
        const event = byId.get(row.eventId);
        return event ? [[row.id, bookingPreview(event, row, settings, now)] as const] : [];
      }),
    );
  }

  private async uniqueReference(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = `NKU-${randomBytes(3).toString('hex').toUpperCase()}`;
      const taken = await this.prisma.spotlightBooking.findUnique({
        where: { reference },
        select: { id: true },
      });
      if (!taken) return reference;
    }

    throw new ConflictException('Réessaie dans un instant.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────

type LockedBooking = Prisma.SpotlightBookingGetPayload<object>;

/** Verrou de ligne sur une place, puis sa lecture : tout geste sur une place passe par là. */
async function lockBooking(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<LockedBooking> {
  await tx.$queryRaw`SELECT id FROM "spotlight_booking" WHERE id = ${bookingId} FOR UPDATE`;

  const booking = await tx.spotlightBooking.findUnique({ where: { id: bookingId } });

  if (!booking) {
    throw new NotFoundException('Cette place n’existe pas.');
  }

  return booking;
}

/** Verrou de capacité d'un pays : les demandes du même pays passent une à une. */
async function lockCapacity(tx: Prisma.TransactionClient, countryCode: string): Promise<void> {
  await tx.$queryRaw`
    SELECT 1 AS locked
    FROM pg_advisory_xact_lock(hashtextextended(${`spotlight-capacity:${countryCode}`}, 0))
  `;
}

/** La mise en avant d'une place quitte la une tout de suite ; son bilan reste. */
async function withdrawSpotlight(
  tx: Prisma.TransactionClient,
  spotlightId: string,
  now: Date,
): Promise<void> {
  await tx.spotlight.updateMany({
    where: { id: spotlightId, status: 'ACTIVE' },
    data: { status: 'WITHDRAWN', withdrawnAt: now },
  });
}

function bookingDays(booking: { startDay: Date; endDay: Date }) {
  return { startDay: dayOf(booking.startDay), endDay: dayOf(booking.endDay) };
}

/**
 * Valeur des jours d'une place qui n'ont pas commencé — ce qu'un avoir rend.
 * Jamais plus que ce qui reste de la place, une fois déduit ce qui a déjà été
 * rendu (avoir ou solde).
 */
function creditableAmount(booking: LockedBooking, at: Date): number {
  return Math.max(
    0,
    Math.min(
      unstartedSpotlightDays(bookingDays(booking), at) * booking.pricePerDay,
      booking.totalAmount - booking.creditedAmount - booking.refundedAmount,
    ),
  );
}

function covers(booking: { startDay: Date; endDay: Date }, day: string): boolean {
  return dayOf(booking.startDay) <= day && dayOf(booking.endDay) >= day;
}

/**
 * Le dernier jour où l'événement peut encore profiter de la une.
 *
 * Le jour de sa fin — sauf si elle tombe tôt le matin (une soirée qui finit à
 * 4 h) : ce jour-là, la une n'aurait presque rien à montrer. Jamais avant le
 * jour où il commence.
 */
function lastPromotableDay(event: { startsAt: Date; endsAt: Date }): string {
  const endDay = spotlightDayOf(event.endsAt);
  const hoursIntoEndDay =
    (event.endsAt.getTime() - spotlightDayStart(endDay).getTime()) / 3_600_000;
  const candidate = hoursIntoEndDay < 12 ? addSpotlightDays(endDay, -1) : endDay;
  const startDay = spotlightDayOf(event.startsAt);

  return candidate < startDay ? startDay : candidate;
}

function formatDay(day: string): string {
  return PERIOD_FORMAT.format(new Date(`${day}T12:00:00+01:00`));
}

const DAY_NUMBER_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Porto-Novo',
  day: 'numeric',
});

/** « le 12 nov. », « du 12 au 14 nov. », « du 30 nov. au 2 déc. » */
function periodLabel(startDay: string, endDay: string): string {
  if (startDay === endDay) return `le ${formatDay(startDay)}`;

  const sameMonth = startDay.slice(0, 7) === endDay.slice(0, 7);
  const first = sameMonth
    ? DAY_NUMBER_FORMAT.format(new Date(`${startDay}T12:00:00+01:00`))
    : formatDay(startDay);

  return `du ${first} au ${formatDay(endDay)}`;
}
