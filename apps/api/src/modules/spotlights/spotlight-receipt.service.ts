import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import '../tickets/pdf-standard-fonts';
import {
  SPOTLIGHT_BOOKING_STATUS_LABELS,
  SPOTLIGHT_PAYMENT_METHOD_LABELS,
  getPaymentMethodDefinition,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { dayOf, type BookingRow } from './spotlight-booking.mapper';

const INK = '#12102B';
const MUTED = '#6B6884';
const CORAL = '#FF4D2E';
const LINE = '#E6E4EF';

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Porto-Novo',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const MOMENT_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Porto-Novo',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface SpotlightReceiptInput {
  booking: BookingRow;
  organization: {
    name: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
  };
  payment: {
    methodCode: string;
    providerReference: string | null;
    confirmedAt: Date | null;
  } | null;
}

/**
 * Reçu d'une place à la une.
 *
 * On vend un service : l'organisateur doit pouvoir le justifier — à son
 * comptable, à un associé, à un sponsor. Le reçu dit ce qui a été acheté
 * (quels jours, pour quel événement), à quel prix, comment c'est réglé, et ce
 * qui en a été rendu depuis (au solde ou en avoir). Les montants sont ceux,
 * figés, de la place : un changement de tarif ne réécrit pas un reçu.
 */
@Injectable()
export class SpotlightReceiptService {
  async render(input: SpotlightReceiptInput): Promise<Buffer> {
    const { booking } = input;

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Reçu ${booking.reference} — Mise en avant`,
        Author: 'Nexa Kabi',
        Subject: booking.event.title,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.compose(doc, input);
    doc.end();

    return done;
  }

  private compose(
    doc: PDFKit.PDFDocument,
    { booking, organization, payment }: SpotlightReceiptInput,
  ) {
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const money = (amount: number) => pdfSafe(formatMoney(amount, booking.currency));

    // ── Bandeau ─────────────────────────────────────────────────────────────
    doc.rect(left, 48, width, 88).fill(INK);
    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .text('NEXA KABI · REÇU DE MISE EN AVANT', left + 24, 68, { characterSpacing: 1.5 });
    doc
      .fontSize(22)
      .text(booking.reference, left + 24, 86, { width: width - 48, lineBreak: false });
    doc
      .fontSize(10)
      .fillColor('#FFFFFFAA')
      .text(
        `Réglé le ${MOMENT_FORMAT.format(booking.paidAt ?? booking.createdAt)} (heure de Porto-Novo)`,
        left + 24,
        114,
        { width: width - 48, lineBreak: false },
      );

    let y = 164;

    y = this.field(
      doc,
      left,
      y,
      width,
      'Organisation',
      organization.legalName ?? organization.name,
    );
    y = this.field(doc, left, y, width, 'Événement mis en avant', booking.event.title);
    y = this.field(
      doc,
      left,
      y,
      width,
      'Diffusion à la une de Nexa Kabi (Découvrir et accueil)',
      booking.days === 1
        ? `Le ${DAY_FORMAT.format(dayDate(dayOf(booking.startDay)))}`
        : `Du ${DAY_FORMAT.format(dayDate(dayOf(booking.startDay)))} au ${DAY_FORMAT.format(dayDate(dayOf(booking.endDay)))}`,
    );
    y = this.field(
      doc,
      left,
      y,
      width,
      'État',
      SPOTLIGHT_BOOKING_STATUS_LABELS[booking.status] +
        (booking.rejectionReason ? ` — ${booking.rejectionReason}` : '') +
        (booking.interruptionReason ? ` — ${booking.interruptionReason}` : ''),
    );

    // ── Détail du montant ───────────────────────────────────────────────────
    y += 8;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .strokeColor(LINE)
      .stroke();
    y += 14;

    const rows: Array<[string, string, boolean?]> = [
      [
        `${booking.days} jour${booking.days > 1 ? 's' : ''} × ${money(booking.pricePerDay)}`,
        money(booking.totalAmount),
      ],
    ];

    if (booking.creditAmount > 0) {
      rows.push(['Avoir de mise en avant utilisé', `- ${money(booking.creditAmount)}`]);
    }

    rows.push([
      `Réglé — ${SPOTLIGHT_PAYMENT_METHOD_LABELS[booking.paymentMethod]}${
        payment
          ? ` (${getPaymentMethodDefinition(payment.methodCode)?.label ?? payment.methodCode})`
          : ''
      }`,
      money(booking.chargedAmount),
      true,
    ]);

    if (booking.refundedAmount > 0) {
      rows.push(['Rendu au solde Nexa Kabi', money(booking.refundedAmount)]);
    }

    if (booking.creditedAmount > 0) {
      rows.push(['Rendu en avoir de mise en avant (12 mois)', money(booking.creditedAmount)]);
    }

    for (const [label, amount, strong] of rows) {
      doc
        .fillColor(strong ? INK : MUTED)
        .fontSize(strong ? 12 : 11)
        .font(strong ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, left, y, { width: width - 140 });
      doc.text(amount, left + width - 140, y, { width: 140, align: 'right' });
      y += 22;
    }

    doc.font('Helvetica');

    if (payment?.providerReference) {
      y += 4;
      doc
        .fillColor(MUTED)
        .fontSize(9)
        .text(`Référence de la transaction : ${payment.providerReference}`, left, y, { width });
      y += 16;
    }

    // ── Pied de page ────────────────────────────────────────────────────────
    y += 12;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .strokeColor(LINE)
      .stroke();
    y += 14;

    doc
      .fillColor(CORAL)
      .fontSize(9)
      .text('Conditions.', left, y, { continued: true })
      .fillColor(MUTED)
      .text(
        ' Une place refusée par l’équipe est rendue au solde. Les jours non diffusés d’une place annulée ou interrompue sont rendus en avoir, valable douze mois ; un jour entamé est dû.',
        { width },
      );

    doc
      .moveDown(0.6)
      .fillColor(MUTED)
      .fontSize(9)
      .text(
        `Émis le ${MOMENT_FORMAT.format(new Date())} pour ${organization.name}${
          organization.email ? ` · ${organization.email}` : ''
        }.`,
        { width },
      );
  }

  private field(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
  ): number {
    const text = pdfSafe(value);
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(pdfSafe(label).toUpperCase(), x, y, { characterSpacing: 1 });
    doc
      .fillColor(INK)
      .fontSize(12)
      .text(text, x, y + 12, { width });

    return y + 12 + doc.heightOfString(text, { width }) + 12;
  }
}

/**
 * Les polices standard du PDF (WinAnsi) ne connaissent ni l'espace fine
 * insécable des montants français, ni le signe moins typographique : rendus
 * tels quels, ils sortiraient en carrés vides sur le reçu.
 */
function pdfSafe(text: string): string {
  return text.replace(/[\u202f\u2009\u2007]/g, '\u00a0').replace(/\u2212/g, '-');
}

function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00+01:00`);
}
