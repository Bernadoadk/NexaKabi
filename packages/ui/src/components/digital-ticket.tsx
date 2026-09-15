import * as React from 'react';
import { cn } from '../lib/cn';
import { Badge } from './badge';
import { QrDisplay } from './qr-display';

/**
 * Billet numérique.
 *
 * Le prototype en fait un OBJET, pas une fiche : deux volets séparés par une
 * perforation, comme un billet de cinéma. Ce n'est pas de la décoration — c'est
 * ce qui fait comprendre en un coup d'œil, sans lire, qu'on tient un titre
 * d'accès et non une confirmation de commande.
 *
 * La perforation est dessinée par deux encoches et une ligne pointillée. Les
 * encoches sont de la couleur du FOND de la page, pas du billet : c'est ce qui
 * donne l'illusion du papier découpé.
 */

export type DigitalTicketTone = 'valid' | 'used' | 'cancelled';

export interface DigitalTicketProps {
  eventTitle: string;
  /** « lun. 14 septembre 2026 · 18h00 » */
  when: string;
  venue: string | null;
  attendeeName: string;
  ticketTypeName: string;
  reference: string;
  /** SVG du QR, rendu côté serveur. */
  qrSvg: string | null;
  tone: DigitalTicketTone;
  statusLabel: string;
  /** « Ouverture des portes à 17 h 30 », consignes d'accès… */
  notes?: React.ReactNode;
  /** Actions sous le billet : partager, PDF. */
  actions?: React.ReactNode;
  /**
   * Classe de fond des encoches de perforation.
   *
   * Elles doivent valoir la couleur de la surface qui ENTOURE le billet, pas
   * celle du billet : c'est ce décalage qui donne l'illusion du papier découpé.
   * Le défaut correspond au fond crème des pages qui affichent un billet ; si
   * le billet est un jour posé sur une autre surface, c'est ici qu'on l'ajuste.
   */
  notchClassName?: string;
  className?: string;
}

const TONE_STYLES: Record<DigitalTicketTone, { badge: 'success' | 'neutral' | 'danger' }> = {
  valid: { badge: 'success' },
  used: { badge: 'neutral' },
  cancelled: { badge: 'danger' },
};

export function DigitalTicket({
  eventTitle,
  when,
  venue,
  attendeeName,
  ticketTypeName,
  reference,
  qrSvg,
  tone,
  statusLabel,
  notes,
  actions,
  notchClassName = 'bg-paper',
  className,
}: DigitalTicketProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <article
        className={cn(
          'overflow-hidden rounded-block bg-surface shadow-lg',
          tone === 'cancelled' && 'opacity-70',
        )}
      >
        {/* Volet haut — l'identité de l'événement. */}
        <header className="flex flex-col gap-2 bg-ink px-6 pb-6 pt-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow text-white/60">{when}</p>
            <Badge tone={TONE_STYLES[tone].badge}>{statusLabel}</Badge>
          </div>

          <h1 className="font-display text-h2 font-bold leading-tight tracking-[-0.02em]">
            {eventTitle}
          </h1>

          {venue ? <p className="text-body-s text-white/70">{venue}</p> : null}
        </header>

        {/* Perforation : deux encoches et une ligne pointillée. */}
        <div className="relative h-6 bg-ink">
          <span
            className={cn(
              'absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full',
              notchClassName,
            )}
          />
          <span
            className={cn(
              'absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full',
              notchClassName,
            )}
          />
          <span className="absolute inset-x-6 top-1/2 border-t border-dashed border-white/25" />
        </div>

        {/* Volet bas — le titre d'accès proprement dit. */}
        <div className="flex flex-col items-center gap-4 bg-ink px-6 pb-7 pt-2 text-white">
          {qrSvg ? (
            <QrDisplay svg={qrSvg} dimmedLabel={tone === 'used' ? 'Déjà utilisé' : undefined} />
          ) : (
            <p className="rounded-card bg-white/10 px-5 py-8 text-center text-body-s text-white/70">
              Ce billet a été annulé.
              <br />
              Son code d’accès n’est plus valable.
            </p>
          )}

          <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-3 border-t border-white/12 pt-4">
            <Cell label="Au nom de" value={attendeeName} />
            <Cell label="Catégorie" value={ticketTypeName} />
            <Cell
              label="Référence"
              value={reference}
              className="col-span-2"
              valueClassName="tabular"
            />
          </dl>

          {notes ? <div className="w-full text-micro text-white/60">{notes}</div> : null}
        </div>
      </article>

      {actions ? <div className="flex flex-col gap-2.5">{actions}</div> : null}
    </div>
  );
}

function Cell({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="text-micro text-white/50">{label}</dt>
      <dd className={cn('text-body font-semibold', valueClassName)}>{value}</dd>
    </div>
  );
}
