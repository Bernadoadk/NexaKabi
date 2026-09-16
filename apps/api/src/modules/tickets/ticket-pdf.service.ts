import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import './pdf-standard-fonts';
import QRCode from 'qrcode';
import type { Ticket } from '@nexakabi/contracts';
import { formatEventRange, formatTimeSpaced } from '@nexakabi/utils';

/** Couleurs du billet imprimé, reprises des jetons de la marque. */
const INK = '#12102B';
const MUTED = '#6B6884';
const CORAL = '#FF4D2E';

/**
 * Billet au format PDF.
 *
 * ── Pourquoi un PDF, alors qu'il y a déjà trois chemins d'accès ─────────────
 * C'est le quatrième filet, et le seul qui fonctionne **sans téléphone**.
 * Batterie vide dans la file, écran cassé la veille, téléphone laissé à la
 * maison : un billet imprimé passe quand même. Sur ce marché, ce n'est pas un
 * cas marginal.
 *
 * ── Le QR est en PNG, pas en SVG ────────────────────────────────────────────
 * PDFKit ne dessine pas de SVG. Le PNG est rendu à 600 px pour une impression
 * à 45 mm, soit environ 340 dpi — au-delà de ce qu'une imprimante domestique
 * restitue, ce qui garantit que la limite ne vient jamais du fichier.
 */
@Injectable()
export class TicketPdfService {
  private readonly logger = new Logger(TicketPdfService.name);

  async render(ticket: Ticket): Promise<Buffer> {
    const qr = await QRCode.toBuffer(ticket.qrToken, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 600,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Billet ${ticket.reference} — ${ticket.eventTitle}`,
        Author: 'Nexa-Kabi',
        Subject: ticket.eventTitle,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.compose(doc, ticket, qr);
    doc.end();

    return done;
  }

  private compose(doc: PDFKit.PDFDocument, ticket: Ticket, qr: Buffer): void {
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    // ── Bandeau d'identité ──────────────────────────────────────────────────
    doc.rect(left, 48, width, 96).fill(INK);

    doc
      .fillColor('#FFFFFF')
      .fontSize(9)
      .text('NEXA-KABI · BILLET', left + 24, 70, {
        characterSpacing: 1.5,
      });

    doc.fontSize(22).text(truncate(ticket.eventTitle, 46), left + 24, 88, {
      width: width - 48,
      lineBreak: false,
    });

    doc
      .fontSize(10)
      .fillColor('#FFFFFFAA')
      .text(
        formatEventRange(new Date(ticket.eventStartsAt), new Date(ticket.eventEndsAt)),
        left + 24,
        118,
        { width: width - 48, lineBreak: false },
      );

    // ── QR, centré et généreusement dimensionné ─────────────────────────────
    const qrSize = 220;
    const qrX = left + (width - qrSize) / 2;
    doc.image(qr, qrX, 180, { width: qrSize, height: qrSize });

    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text('Présente ce code à l’entrée', left, 180 + qrSize + 10, {
        width,
        align: 'center',
      });

    // ── Informations du porteur ─────────────────────────────────────────────
    let y = 180 + qrSize + 44;

    y = this.field(doc, left, y, width, 'Au nom de', ticket.attendeeName);
    y = this.field(doc, left, y, width, 'Catégorie', ticket.ticketTypeName);
    y = this.field(doc, left, y, width, 'Référence du billet', ticket.reference);
    y = this.field(doc, left, y, width, 'Commande', ticket.orderReference);

    const venue = [ticket.eventVenueName, ticket.eventAddress, ticket.eventCityName]
      .filter(Boolean)
      .join(', ');

    if (venue) y = this.field(doc, left, y, width, 'Lieu', venue);

    if (ticket.eventDoorsOpenAt) {
      y = this.field(
        doc,
        left,
        y,
        width,
        'Ouverture des portes',
        formatTimeSpaced(new Date(ticket.eventDoorsOpenAt)),
      );
    }

    if (ticket.eventAccessInstructions) {
      y = this.field(doc, left, y, width, 'À savoir', ticket.eventAccessInstructions);
    }

    // ── Pied de page ────────────────────────────────────────────────────────
    doc
      .moveTo(left, y + 12)
      .lineTo(left + width, y + 12)
      .strokeColor('#E6E4EF')
      .stroke();

    doc
      .fillColor(CORAL)
      .fontSize(9)
      .text('Un billet = une entrée.', left, y + 24, { continued: true });

    doc
      .fillColor(MUTED)
      .text(' Ce code ne peut être scanné qu’une seule fois. Ne le partage pas publiquement.', {
        width,
      });
  }

  /** Une ligne « libellé / valeur », et renvoie l'ordonnée suivante. */
  private field(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
  ): number {
    doc.fillColor(MUTED).fontSize(8).text(label.toUpperCase(), x, y, { characterSpacing: 1 });
    doc
      .fillColor(INK)
      .fontSize(12)
      .text(value, x, y + 12, { width });

    return y + 12 + doc.heightOfString(value, { width }) + 12;
  }
}

/** Tronque un titre trop long pour la ligne du bandeau. */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
