'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import {
  SPOTLIGHT_BOOKING_STATUS_LABELS,
  SPOTLIGHT_PAYMENT_METHOD_LABELS,
  unstartedSpotlightDays,
  type SpotlightBooking,
  type SpotlightBookingStatus,
  type SpotlightOffer,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Badge, Button, Surface, cn } from '@nexakabi/ui';
import { cancelSpotlightAction } from './actions';
import { runSpotlightPayment } from './payment';

const TIME_ZONE = 'Africa/Porto-Novo';
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
});
const momentFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const noon = (day: string) => new Date(`${day}T12:00:00+01:00`);

const STATUS_TONES: Record<
  SpotlightBookingStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'
> = {
  AWAITING_PAYMENT: 'warning',
  PENDING_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  INTERRUPTED: 'neutral',
  EXPIRED: 'neutral',
  COMPLETED: 'neutral',
};

const PHASE_LABELS = {
  SCHEDULED: 'Programmée',
  LIVE: 'À la une en ce moment',
  ENDED: 'Diffusion terminée',
} as const;

/**
 * Les places de cet événement : où chacune en est, ce qu'elle a rapporté, et
 * ce qu'on peut encore en faire — payer, annuler, télécharger le reçu.
 */
export function BookingList({
  eventId,
  bookings,
  providerMethods,
}: {
  eventId: string;
  bookings: SpotlightBooking[];
  providerMethods: SpotlightOffer['providerMethods'];
}) {
  if (bookings.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
        Mes mises en avant
      </h2>
      <div className="flex flex-col gap-3">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            eventId={eventId}
            booking={booking}
            providerMethods={providerMethods}
          />
        ))}
      </div>
    </section>
  );
}

function BookingCard({
  eventId,
  booking,
  providerMethods,
}: {
  eventId: string;
  booking: SpotlightBooking;
  providerMethods: SpotlightOffer['providerMethods'];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'pay' | 'cancel' | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState(providerMethods[0]?.code ?? null);

  const period =
    booking.startDay === booking.endDay
      ? `Le ${dayFormat.format(noon(booking.startDay))}`
      : `Du ${dayFormat.format(noon(booking.startDay))} au ${dayFormat.format(noon(booking.endDay))}`;

  // Ce qu'une annulation rendrait, à l'instant : les jours pas encore commencés.
  const refundableDays =
    booking.status === 'AWAITING_PAYMENT'
      ? 0
      : unstartedSpotlightDays({ startDay: booking.startDay, endDay: booking.endDay }, new Date());
  const refundable = Math.min(
    refundableDays * booking.pricePerDay,
    booking.totalAmount - booking.creditedAmount - booking.refundedAmount,
  );

  async function pay() {
    if (!method) return;

    setBusy('pay');
    setError(null);

    const run = await runSpotlightPayment(eventId, booking.id, method, setStatus);

    setBusy(null);
    setStatus(null);

    if (run.outcome === 'paid') {
      router.refresh();
      return;
    }

    if (run.outcome === 'failed' || run.outcome === 'pending') setError(run.message);
    router.refresh();
  }

  async function cancel() {
    setBusy('cancel');
    setError(null);

    const result = await cancelSpotlightAction(eventId, booking.id);

    setBusy(null);
    setConfirming(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.refresh();
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-bold tabular-nums">{booking.reference}</span>
            <Badge tone={STATUS_TONES[booking.status]} dot={booking.phase === 'LIVE'}>
              {booking.status === 'APPROVED' && booking.phase
                ? PHASE_LABELS[booking.phase]
                : SPOTLIGHT_BOOKING_STATUS_LABELS[booking.status]}
            </Badge>
          </div>
          <p className="text-body-s text-text-2">
            {period} · {booking.days} jour{booking.days > 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-body font-bold tabular-nums">
            {formatMoney(booking.totalAmount, booking.currency)}
          </span>
          <span className="text-micro text-text-3">
            {booking.chargedAmount > 0
              ? SPOTLIGHT_PAYMENT_METHOD_LABELS[booking.paymentMethod]
              : 'Avoir'}
            {booking.creditAmount > 0 && booking.chargedAmount > 0
              ? ` · dont ${formatMoney(booking.creditAmount, booking.currency)} d’avoir`
              : ''}
          </span>
        </div>
      </div>

      {booking.status === 'AWAITING_PAYMENT' && booking.holdExpiresAt ? (
        <p className="text-body-s text-amber-700">
          Jours réservés jusqu’à {momentFormat.format(new Date(booking.holdExpiresAt))} : paie pour
          envoyer ta demande.
        </p>
      ) : null}

      {booking.status === 'PENDING_REVIEW' ? (
        <p className="text-body-s text-text-2">
          Payée. L’équipe vérifie ta demande ; tu seras prévenu dès qu’elle est validée.
        </p>
      ) : null}

      {booking.rejectionReason ? (
        <p className="text-body-s text-red-700">Motif : {booking.rejectionReason}.</p>
      ) : null}

      {booking.interruptionReason ? (
        <p className="text-body-s text-text-2">Interrompue : {booking.interruptionReason}.</p>
      ) : null}

      {booking.refundedAmount > 0 || booking.creditedAmount > 0 ? (
        <p className="text-body-s text-mint-700">
          {[
            booking.refundedAmount > 0
              ? `${formatMoney(booking.refundedAmount, booking.currency)} rendus à ton solde`
              : null,
            booking.creditedAmount > 0
              ? `${formatMoney(booking.creditedAmount, booking.currency)} rendus en avoir`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          .
        </p>
      ) : null}

      {booking.stats ? (
        <dl className="grid grid-cols-3 gap-2 rounded-panel bg-paper p-3 text-center">
          <Figure label="Vues" value={booking.stats.views} />
          <Figure label="Clics" value={booking.stats.clicks} />
          <Figure label="Billets vendus" value={booking.stats.tickets ?? 0} />
        </dl>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {status ? (
        <p role="status" className="text-body-s font-semibold text-text-2">
          {status}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {booking.canPay ? (
          <>
            {providerMethods.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {providerMethods.map((candidate) => (
                  <button
                    key={candidate.code}
                    type="button"
                    onClick={() => setMethod(candidate.code)}
                    aria-pressed={method === candidate.code}
                    className={cn(
                      'rounded-chip border px-3 py-1.5 text-micro font-bold transition',
                      method === candidate.code
                        ? 'border-text-strong bg-ink text-white'
                        : 'border-border bg-surface text-text-2',
                    )}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size="compact"
              loading={busy === 'pay'}
              disabled={busy !== null || !method}
              onClick={() => void pay()}
            >
              Payer {formatMoney(booking.chargedAmount, booking.currency)}
            </Button>
          </>
        ) : null}

        {booking.hasReceipt ? (
          <Button asChild variant="secondary" size="compact">
            <a
              href={`/api/pro/spotlight/${encodeURIComponent(eventId)}/${encodeURIComponent(booking.id)}/receipt`}
              download
            >
              <FileText className="size-4" aria-hidden /> Reçu
            </a>
          </Button>
        ) : null}

        {booking.canCancel && !confirming ? (
          <Button
            type="button"
            variant="tertiary"
            size="compact"
            disabled={busy !== null}
            onClick={() => setConfirming(true)}
          >
            Annuler
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-panel border border-border p-3">
          <p className="text-body-s">
            {booking.status === 'AWAITING_PAYMENT'
              ? 'Rien n’a été prélevé : tes jours seront libérés.'
              : refundable > 0
                ? `${refundableDays} jour${refundableDays > 1 ? 's' : ''} pas encore commencé${refundableDays > 1 ? 's' : ''} : ${formatMoney(refundable, booking.currency)} te seront rendus en avoir, valable 12 mois. Le jour en cours reste dû.`
                : 'Tous les jours ont commencé : rien ne peut être rendu.'}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="compact"
              loading={busy === 'cancel'}
              onClick={() => void cancel()}
            >
              Confirmer l’annulation
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="compact"
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
            >
              Garder ma place
            </Button>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-micro text-text-3">{label}</dt>
      <dd className="text-body font-bold tabular-nums">{value.toLocaleString('fr-FR')}</dd>
    </div>
  );
}
