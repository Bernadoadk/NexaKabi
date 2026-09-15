import Link from 'next/link';
import {
  TICKET_STATUS_LABELS,
  buildTicketShareUrl,
  shouldShowQr,
  type Ticket,
} from '@nexakabi/contracts';
import { formatEventRange, formatTimeSpaced } from '@nexakabi/utils';
import { Alert, Button, DigitalTicket, type DigitalTicketTone } from '@nexakabi/ui';
import { renderQrSvg } from '@/lib/qr';
import { BrightnessBoost } from './brightness-boost';

/**
 * Billet numérique (écran A7).
 *
 * Rendu par les deux chemins d'accès — le compte et le lien public — avec
 * exactement la même présentation. Un billet qui n'aurait pas la même tête
 * selon la porte empruntée sèmerait le doute au moment le plus critique.
 */
export async function TicketArticle({
  ticket,
  siteUrl,
  backHref,
}: {
  ticket: Ticket;
  siteUrl: string;
  backHref?: { href: string; label: string };
}) {
  const showQr = shouldShowQr(ticket.status);
  const qrSvg = showQr ? await renderQrSvg(ticket.qrToken) : null;

  const startsAt = new Date(ticket.eventStartsAt);
  const venue = [ticket.eventVenueName, ticket.eventCityName].filter(Boolean).join(' · ') || null;

  return (
    <div className="flex flex-col gap-5">
      {/* Le QR est illisible sur un écran assombri par l'économie de batterie.
          Le prototype impose de forcer la luminosité sur cet écran-là. */}
      {showQr ? <BrightnessBoost /> : null}

      {ticket.status === 'CANCELLED' || ticket.status === 'REFUNDED' ? (
        <Alert tone="warning" title="Ce billet a été annulé">
          Il ne donne plus accès à l’événement. Si tu n’es pas à l’origine de cette annulation,
          contacte l’organisateur.
        </Alert>
      ) : null}

      {ticket.status === 'USED' ? (
        <Alert tone="info" title="Ce billet a déjà servi">
          L’entrée a été enregistrée
          {ticket.usedAt ? ` à ${formatTimeSpaced(new Date(ticket.usedAt))}` : ''}. Un billet ne
          permet qu’une seule entrée.
        </Alert>
      ) : null}

      <DigitalTicket
        eventTitle={ticket.eventTitle}
        when={formatEventRange(startsAt, new Date(ticket.eventEndsAt))}
        venue={venue}
        attendeeName={ticket.attendeeName}
        ticketTypeName={ticket.ticketTypeName}
        reference={ticket.reference}
        qrSvg={qrSvg}
        tone={toneFor(ticket.status)}
        statusLabel={TICKET_STATUS_LABELS[ticket.status]}
        notes={
          <div className="flex flex-col gap-1">
            {ticket.eventDoorsOpenAt ? (
              <p>Ouverture des portes à {formatTimeSpaced(new Date(ticket.eventDoorsOpenAt))}</p>
            ) : null}
            {ticket.eventAddress ? <p>{ticket.eventAddress}</p> : null}
            {ticket.eventAccessInstructions ? <p>{ticket.eventAccessInstructions}</p> : null}
          </div>
        }
        actions={
          <>
            {showQr ? (
              <Button asChild variant="primary" size="primary" block>
                <a
                  href={buildTicketShareUrl({
                    siteUrl,
                    accessToken: ticket.accessToken,
                    eventTitle: ticket.eventTitle,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-center"
                >
                  Envoyer sur WhatsApp
                </a>
              </Button>
            ) : null}

            {showQr ? (
              <Button asChild variant="secondary" size="primary" block>
                {/* Quatrième filet, après le compte, le lien et le cache :
                    un billet imprimé fonctionne sans téléphone du tout. */}
                <a href={`/api/billets/${ticket.accessToken}/pdf`} className="text-center">
                  Télécharger le PDF
                </a>
              </Button>
            ) : null}

            {backHref ? (
              <Button asChild variant="tertiary" size="primary" block>
                <Link href={backHref.href} className="text-center">
                  {backHref.label}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <p className="text-center text-micro text-text-3">
        Présente ce code à l’entrée. Il fonctionne sans connexion une fois cette page ouverte.
      </p>
    </div>
  );
}

function toneFor(status: Ticket['status']): DigitalTicketTone {
  if (status === 'USED' || status === 'EXPIRED') return 'used';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'cancelled';
  return 'valid';
}
