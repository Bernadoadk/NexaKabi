'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ImageOff, ShieldCheck, Video } from 'lucide-react';
import {
  SPOTLIGHT_BOOKING_STATUS_LABELS,
  SPOTLIGHT_PAYMENT_METHOD_LABELS,
  type SpotlightBookingAdmin,
  type SpotlightBookingStatus,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Badge, Button, Input, Surface, Textarea, cn } from '@nexakabi/ui';
import { formatPortoNovo } from './dates';

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Porto-Novo',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const noon = (day: string) => new Date(`${day}T12:00:00+01:00`);

function period(booking: { startDay: string; endDay: string; days: number }): string {
  return booking.startDay === booking.endDay
    ? `${dayFormat.format(noon(booking.startDay))} · 1 jour`
    : `${dayFormat.format(noon(booking.startDay))} → ${dayFormat.format(noon(booking.endDay))} · ${booking.days} jours`;
}

const STATUS_TONES: Record<
  SpotlightBookingStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
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

async function post(path: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(`/api/admin/spotlights/bookings/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });

    if (response.ok) return null;

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return payload?.message ?? 'L’action a échoué.';
  } catch {
    return 'L’API n’est pas joignable.';
  }
}

/**
 * Places payées qui attendent la décision de l'équipe, les plus anciennes
 * d'abord — l'organisateur s'est vu promettre une réponse sous 24 h.
 *
 * Valider : la place sera diffusée sur ses dates. Refuser : le montant payé
 * revient au solde de l'organisation, l'avoir engagé à son avoir — c'est le
 * seul cas où de l'argent est rendu, d'où le motif obligatoire.
 */
export function PendingBookings({
  items,
  canAct,
}: {
  items: SpotlightBookingAdmin[];
  canAct: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((booking) => (
        <PendingCard key={booking.id} booking={booking} canAct={canAct} />
      ))}
    </div>
  );
}

function PendingCard({ booking, canAct }: { booking: SpotlightBookingAdmin; canAct: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'idle' | 'rejecting'>('idle');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState<'approve' | 'reject' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const preview = booking.preview;
  const visual = preview?.imageUrl ?? preview?.video?.posterUrl ?? booking.event.coverImageUrl;
  const started = new Date(booking.startsAt) <= new Date();

  async function run(action: 'approve' | 'reject') {
    setPending(action);
    setError(null);

    const failure = await post(
      `${encodeURIComponent(booking.id)}/${action}`,
      action === 'reject' ? { reason: reason.trim() } : undefined,
    );

    setPending(null);

    if (failure) {
      setError(failure);
      return;
    }

    router.refresh();
  }

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="relative aspect-video bg-ink md:aspect-auto md:min-h-[170px]">
          {visual ? (
            <img src={visual} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <ImageOff className="absolute inset-0 m-auto size-5 text-white/40" aria-hidden />
          )}
          <div className="absolute left-2 top-2 flex gap-1">
            {booking.imageUrl ? <Badge tone="overlay">Visuel propre</Badge> : null}
            {booking.video ? (
              <Badge tone="overlay">
                <Video className="size-3" aria-hidden /> Vidéo {booking.video.durationSeconds} s
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-bold">{booking.event.title}</span>
            <Badge tone="info">{booking.reference}</Badge>
          </div>
          <p className="text-body-s text-text-2">
            {booking.organization.name}
            {booking.organization.verified ? (
              <ShieldCheck className="ml-1 inline size-3.5 text-mint-700" aria-label="Vérifiée" />
            ) : null}{' '}
            · {period(booking)} · {booking.countryCode}
          </p>
          <p className="text-body-s">
            <span className="font-bold tabular-nums">
              {formatMoney(booking.totalAmount, booking.currency)}
            </span>{' '}
            ·{' '}
            {booking.chargedAmount > 0
              ? `${formatMoney(booking.chargedAmount, booking.currency)} par ${SPOTLIGHT_PAYMENT_METHOD_LABELS[booking.paymentMethod].toLowerCase()}`
              : 'réglée par avoir'}
            {booking.creditAmount > 0 && booking.chargedAmount > 0
              ? ` + ${formatMoney(booking.creditAmount, booking.currency)} d’avoir`
              : ''}
            {booking.paidAt ? ` · payée le ${formatPortoNovo(booking.paidAt)}` : ''}
          </p>

          {booking.video ? (
            <a
              href={booking.video.url}
              target="_blank"
              rel="noopener"
              className="text-body-s font-semibold"
            >
              Voir la vidéo ↗
            </a>
          ) : null}

          {started ? (
            <Alert tone="warning">
              Sa diffusion devait déjà commencer : validée maintenant, les jours entamés seront
              rendus en avoir à l’organisateur.
            </Alert>
          ) : null}

          {error ? <Alert tone="danger">{error}</Alert> : null}

          {canAct ? (
            mode === 'rejecting' ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  aria-label="Motif du refus"
                  placeholder="Ce que l’organisateur doit corriger — il ne lira que ce message."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                />
                <p className="text-micro text-text-3">
                  {formatMoney(booking.chargedAmount, booking.currency)} reviendront à son solde
                  {booking.creditAmount > 0 ? ', et l’avoir engagé à son avoir' : ''}.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive-solid"
                    size="compact"
                    loading={pending === 'reject'}
                    disabled={reason.trim().length < 10 || pending !== null}
                    onClick={() => void run('reject')}
                  >
                    Refuser et rembourser
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="compact"
                    disabled={pending !== null}
                    onClick={() => setMode('idle')}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ink"
                  size="compact"
                  loading={pending === 'approve'}
                  disabled={pending !== null}
                  onClick={() => void run('approve')}
                >
                  Valider
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="compact"
                  disabled={pending !== null}
                  onClick={() => setMode('rejecting')}
                >
                  Refuser
                </Button>
              </div>
            )
          ) : null}
        </div>
      </div>
    </Surface>
  );
}

/**
 * Les autres places : en attente de paiement, validées, terminées, rendues.
 * Pour chacune, ce qu'elle a rapporté et ce qui en a été rendu — et le geste
 * de l'équipe (des jours rendus en avoir), réservé à qui peut faire bouger
 * l'argent.
 */
export function RecentBookings({
  items,
  canMoveMoney,
}: {
  items: SpotlightBookingAdmin[];
  canMoveMoney: boolean;
}) {
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <ul>
        {items.map((booking) => (
          <li key={booking.id} className="border-b border-border-subtle last:border-0">
            <RecentRow booking={booking} canMoveMoney={canMoveMoney} />
          </li>
        ))}
      </ul>
    </Surface>
  );
}

const CREDITABLE: readonly SpotlightBookingStatus[] = [
  'APPROVED',
  'COMPLETED',
  'INTERRUPTED',
  'CANCELLED',
];

function RecentRow({
  booking,
  canMoveMoney,
}: {
  booking: SpotlightBookingAdmin;
  canMoveMoney: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [days, setDays] = React.useState('1');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const left = booking.totalAmount - booking.creditedAmount - booking.refundedAmount;
  const canCredit = canMoveMoney && CREDITABLE.includes(booking.status) && left > 0;
  const parsedDays = Number.parseInt(days, 10);

  async function credit() {
    setPending(true);
    setError(null);

    const failure = await post(`${encodeURIComponent(booking.id)}/credit`, {
      days: parsedDays,
      reason: reason.trim(),
    });

    setPending(false);

    if (failure) {
      setError(failure);
      return;
    }

    setOpen(false);
    setReason('');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 p-3 sm:p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-body-s font-bold">{booking.event.title}</span>
            <Badge tone={STATUS_TONES[booking.status]}>
              {SPOTLIGHT_BOOKING_STATUS_LABELS[booking.status]}
            </Badge>
            <span className="text-micro text-text-3 tabular-nums">{booking.reference}</span>
          </div>
          <p className="truncate text-micro text-text-3">
            {booking.organization.name} · {period(booking)} · {booking.countryCode}
          </p>
          {booking.rejectionReason || booking.interruptionReason ? (
            <p className="text-micro text-text-2">
              {booking.rejectionReason ?? booking.interruptionReason}
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-4 gap-3 text-right md:w-[340px]">
          <Figure label="Payé" value={formatMoney(booking.chargedAmount, booking.currency)} />
          <Figure
            label="Rendu"
            value={
              booking.refundedAmount + booking.creditedAmount > 0
                ? formatMoney(booking.refundedAmount + booking.creditedAmount, booking.currency)
                : '—'
            }
          />
          <Figure
            label="Vues"
            value={booking.stats ? booking.stats.views.toLocaleString('fr-FR') : '—'}
          />
          <Figure
            label="Billets"
            value={booking.stats ? String(booking.stats.tickets ?? 0) : '—'}
          />
        </dl>

        {canCredit ? (
          <div className="md:w-[150px] md:text-right">
            <Button
              type="button"
              variant="tertiary"
              size="compact"
              onClick={() => setOpen((value) => !value)}
            >
              Rendre des jours
            </Button>
          </div>
        ) : (
          <div className="hidden md:block md:w-[150px]" />
        )}
      </div>

      {open ? (
        <div className={cn('flex flex-col gap-2 rounded-panel border border-border p-3')}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-micro font-semibold">
              Jours rendus
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={booking.days}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className="w-24"
              />
            </label>
            <p className="pb-2 text-micro text-text-3">
              ={' '}
              {formatMoney(
                Math.min(
                  (Number.isInteger(parsedDays) ? parsedDays : 0) * booking.pricePerDay,
                  left,
                ),
                booking.currency,
              )}{' '}
              d’avoir, valable 12 mois
            </p>
          </div>
          <Textarea
            aria-label="Motif du geste"
            placeholder="Une panne de la une, un incident : l’organisateur lira ce motif."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ink"
              size="compact"
              loading={pending}
              disabled={
                !Number.isInteger(parsedDays) || parsedDays < 1 || reason.trim().length < 10
              }
              onClick={() => void credit()}
            >
              Rendre en avoir
            </Button>
            <Button type="button" variant="tertiary" size="compact" onClick={() => setOpen(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-micro text-text-3">{label}</dt>
      <dd className="text-body-s font-bold tabular-nums">{value}</dd>
    </div>
  );
}
