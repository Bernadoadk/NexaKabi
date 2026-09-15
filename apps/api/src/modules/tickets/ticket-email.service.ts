import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OutboundService } from '../notifications/outbound.service';
import { TicketPdfService } from './ticket-pdf.service';
import { TicketsService } from './tickets.service';

export interface OrderPaidEvent {
  readonly orderId: string;
}

/**
 * Billet par e-mail, à la confirmation d'une commande.
 *
 * ── Pourquoi un écouteur d'événement, pas un appel direct depuis le paiement ──
 * `order.paid` était déjà émis après le commit du paiement — « la phase 7 s'y
 * abonne pour émettre les billets », disait le commentaire d'origine — mais
 * rien ne l'écoutait : les billets sont en réalité émis plus tôt, dans la
 * même transaction que l'encaissement. L'événement partait dans le vide.
 *
 * S'y brancher plutôt que d'appeler ce service depuis `OrdersService.markPaid`
 * respecte la même règle que le reste des diffusions sortantes : l'envoi ne
 * doit jamais retenir la transaction qui encaisse, et son échec ne doit
 * annuler ni le paiement ni l'émission des billets déjà faite.
 */
@Injectable()
export class TicketEmailService {
  private readonly logger = new Logger(TicketEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbound: OutboundService,
    private readonly tickets: TicketsService,
    private readonly pdf: TicketPdfService,
  ) {}

  @OnEvent('order.paid')
  async sendTicketEmail({ orderId }: OrderPaidEvent): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          reference: true,
          buyerName: true,
          buyerEmail: true,
          userId: true,
          event: {
            select: {
              title: true,
              startsAt: true,
              venue: { select: { name: true } },
              city: { select: { name: true } },
            },
          },
        },
      });

      // Aucune adresse déclarée : la plupart des acheteurs de ce marché
      // n'en donnent pas, WhatsApp suffit. Rien à envoyer, silencieusement —
      // ce n'est pas un échec.
      if (!order?.buyerEmail) return;

      const ticketList = await this.tickets.listForOrder(order.reference);
      if (ticketList.length === 0) return;

      const attachments = await Promise.all(
        ticketList.map(async (ticket) => ({
          filename: `billet-${ticket.reference}.pdf`,
          content: await this.pdf.render(ticket),
          contentType: 'application/pdf',
        })),
      );

      await this.outbound.sendEmail({
        userId: order.userId ?? undefined,
        to: order.buyerEmail,
        subject: `Ton billet pour ${order.event.title}`,
        html: renderTicketEmail({
          buyerName: order.buyerName,
          eventTitle: order.event.title,
          when: formatEventCaptionWithTime(order.event.startsAt),
          where: [order.event.venue?.name, order.event.city?.name].filter(Boolean).join(', '),
          orderReference: order.reference,
          ticketCount: ticketList.length,
        }),
        text:
          `Ton billet pour ${order.event.title} est prêt (commande ${order.reference}). ` +
          `Il est joint à ce message en PDF, et reste aussi disponible dans ton espace : ` +
          `https://nexakabi.bj/mon-compte/billets`,
        attachments,
      });
    } catch (error) {
      // Ne jamais remonter : cet écouteur tourne après le commit du paiement,
      // un billet a déjà été émis et reste valable même si son e-mail échoue.
      this.logger.warn(`Envoi du billet par e-mail échoué pour la commande ${orderId}`, error);
    }
  }
}

/** Gabarit de l'e-mail de billet — sobre, un CTA, le PDF fait le reste. */
function renderTicketEmail(input: {
  buyerName: string;
  eventTitle: string;
  when: string;
  where: string;
  orderReference: string;
  ticketCount: number;
}): string {
  const firstName = input.buyerName.trim().split(/\s+/)[0] ?? '';

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:32px 16px;background:#F5F4F8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#12102B;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;">
      <tr><td style="background:#12102B;padding:24px 28px;">
        <span style="color:#FFFFFF;font-weight:800;font-size:16px;">Nexa-Kabi</span>
      </td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 4px;font-size:20px;">${escapeHtml(firstName ? `${firstName}, ton billet est prêt` : 'Ton billet est prêt')}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3A3752;">
          ${input.ticketCount > 1 ? `Tes ${input.ticketCount} billets sont` : 'Ton billet est'} joint${input.ticketCount > 1 ? 's' : ''} à ce message, prêt${input.ticketCount > 1 ? 's' : ''} à imprimer ou à présenter depuis ton téléphone.
        </p>
        <table role="presentation" width="100%" style="background:#F5F4F8;border-radius:12px;">
          <tr><td style="padding:16px 20px;">
            <div style="font-weight:700;font-size:16px;margin-bottom:4px;">${escapeHtml(input.eventTitle)}</div>
            <div style="font-size:13px;color:#6B6884;">${escapeHtml(input.when)}${input.where ? ` · ${escapeHtml(input.where)}` : ''}</div>
            <div style="font-size:12px;color:#6B6884;margin-top:8px;">Commande ${escapeHtml(input.orderReference)}</div>
          </td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6B6884;">
          Retrouve-le aussi à tout moment dans « Mes billets », sans réseau requis à l’entrée.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
