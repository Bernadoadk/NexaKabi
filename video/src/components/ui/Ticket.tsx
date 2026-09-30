import React, { useMemo } from 'react';
import QRCode from 'qrcode';
import { cn } from '../../lib/layout';
import { Badge } from './Badge';

/**
 * Un vrai QR code, calculé à partir d'un texte.
 * Celui du billet de la vidéo mène au site : un spectateur qui le scanne
 * tombe sur Nexa Kabi, pas sur un faux billet.
 */
export const QrCode: React.FC<{ text: string; size: number; className?: string }> = ({
  text,
  size,
  className,
}) => {
  const { count, path } = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const modules = qr.modules;
    let d = '';
    for (let row = 0; row < modules.size; row++) {
      for (let column = 0; column < modules.size; column++) {
        if (modules.data[row * modules.size + column]) d += `M${column} ${row}h1v1h-1z`;
      }
    }
    return { count: modules.size, path: d };
  }, [text]);

  return (
    <svg
      viewBox={`-1 -1 ${count + 2} ${count + 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={-1} y={-1} width={count + 2} height={count + 2} fill="#FFFFFF" />
      <path d={path} fill="#000000" />
    </svg>
  );
};

/** Copie de `QrDisplay` : marge blanche, noir pur sur blanc pur. */
export const QrDisplay: React.FC<{ text: string; size?: number; className?: string }> = ({
  text,
  size = 208,
  className,
}) => (
  <div className={cn('relative inline-flex rounded-card bg-white p-3 shadow-sm', className)}>
    <QrCode text={text} size={size} />
  </div>
);

/**
 * Copie de `packages/ui/src/components/digital-ticket.tsx`.
 *
 * Les encoches de la perforation sont ici de vrais trous (dégradés
 * transparents) : le billet peut flotter sur n'importe quel fond.
 */
export const DigitalTicket: React.FC<{
  eventTitle: string;
  when: string;
  venue: string;
  attendeeName: string;
  ticketTypeName: string;
  reference: string;
  qrText: string;
  statusLabel?: string;
  notes?: React.ReactNode;
  qrSize?: number;
  /** Calque posé sur le billet (reflet animé). */
  overlay?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}> = ({
  eventTitle,
  when,
  venue,
  attendeeName,
  ticketTypeName,
  reference,
  qrText,
  statusLabel = 'Valide',
  notes,
  qrSize = 208,
  overlay,
  className,
  style,
}) => (
  <article
    className={cn('relative flex flex-col overflow-hidden rounded-block', className)}
    style={style}
  >
    <header className="flex flex-col gap-2 bg-ink px-6 pb-6 pt-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-white/60">{when}</p>
        <Badge tone="success">{statusLabel}</Badge>
      </div>
      <h1 className="font-display text-h2 font-bold leading-tight tracking-[-0.02em]">
        {eventTitle}
      </h1>
      <p className="text-body-s text-white/70">{venue}</p>
    </header>

    <div
      className="relative h-6"
      style={{
        background:
          'radial-gradient(circle at 0 50%, transparent 12px, var(--color-ink) 12.5px) left / 50.5% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 12px, var(--color-ink) 12.5px) right / 50.5% 100% no-repeat',
      }}
    >
      <span className="absolute inset-x-6 top-1/2 border-t border-dashed border-white/25" />
    </div>

    <div className="flex flex-col items-center gap-4 bg-ink px-6 pb-7 pt-2 text-white">
      <QrDisplay text={qrText} size={qrSize} />

      <dl className="m-0 grid w-full grid-cols-2 gap-x-4 gap-y-3 border-t border-white/12 pt-4">
        <Cell label="Au nom de" value={attendeeName} />
        <Cell label="Catégorie" value={ticketTypeName} />
        <Cell label="Référence" value={reference} className="col-span-2" valueClassName="tabular" />
      </dl>

      {notes ? <div className="w-full text-micro text-white/60">{notes}</div> : null}
    </div>
    {overlay}
  </article>
);

const Cell: React.FC<{
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}> = ({ label, value, className, valueClassName }) => (
  <div className={cn('flex flex-col gap-0.5', className)}>
    <dt className="text-micro text-white/50">{label}</dt>
    <dd className={cn('m-0 text-body font-semibold', valueClassName)}>{value}</dd>
  </div>
);
