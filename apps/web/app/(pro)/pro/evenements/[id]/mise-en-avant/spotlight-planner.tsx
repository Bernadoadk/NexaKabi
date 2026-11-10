'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check, Film, ImageIcon, Wallet } from 'lucide-react';
import {
  SPOTLIGHT_VIDEO_MAX_LABEL,
  SPOTLIGHT_VIDEO_MAX_SECONDS,
  SPOTLIGHT_VIDEO_TYPES,
  UPLOAD_MAX_LABEL,
  type SpotlightCalendarDay,
  type SpotlightOffer,
  type SpotlightVideo,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Button, Surface, UploadDropzone, cn, type UploadPhase } from '@nexakabi/ui';
import { SpotlightCarousel, type SpotlightView } from '@/components/spotlight-carousel';
import { uploadFile } from '@/lib/upload-client';
import { requestSpotlightAction } from './actions';
import { runSpotlightPayment } from './payment';
import { uploadSpotlightVideo } from './video-upload';

/** Les jours se lisent à l'heure de Porto-Novo, au serveur comme au navigateur. */
const TIME_ZONE = 'Africa/Porto-Novo';
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

const monthFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  month: 'long',
  year: 'numeric',
});
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
});
const longDayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const noon = (day: string) => new Date(`${day}T12:00:00+01:00`);

/** Lundi = 0 … dimanche = 6, à partir d'une date `AAAA-MM-JJ`. */
function weekdayIndex(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function daysBetween(start: string, end: string, calendar: SpotlightCalendarDay[]) {
  return calendar.filter((entry) => entry.day >= start && entry.day <= end);
}

/**
 * Le formulaire de l'onglet « Mise en avant ».
 *
 * ── Ce que l'organisateur voit avant de payer ───────────────────────────────
 *  · les jours encore libres, et pourquoi les autres ne le sont pas ;
 *  · le montant exact — jours × prix, moins l'avoir — avant le bouton ;
 *  · la diapositive EXACTE que la une affichera, avec son visuel et sa vidéo ;
 *  · ce qui se passe ensuite : validation sous 24 h, remboursement au solde
 *    en cas de refus, jours non diffusés rendus en avoir s'il annule.
 */
export function SpotlightPlanner({
  eventId,
  offer,
  preview,
}: {
  eventId: string;
  offer: SpotlightOffer;
  /** La diapositive mise en forme côté serveur, comme celle de la une. */
  preview: SpotlightView;
}) {
  const router = useRouter();
  const price = offer.pricePerDay ?? 0;

  const [start, setStart] = React.useState<string | null>(null);
  const [end, setEnd] = React.useState<string | null>(null);
  const [rangeError, setRangeError] = React.useState<string | null>(null);

  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imagePhase, setImagePhase] = React.useState<UploadPhase>('idle');
  const [imageProgress, setImageProgress] = React.useState(0);
  const [imageError, setImageError] = React.useState<string | null>(null);

  const [video, setVideo] = React.useState<SpotlightVideo | null>(null);
  const [videoPhase, setVideoPhase] = React.useState<UploadPhase>('idle');
  const [videoProgress, setVideoProgress] = React.useState(0);
  const [videoError, setVideoError] = React.useState<string | null>(null);

  const firstMethod = offer.providerMethods[0]?.code ?? null;
  const [paymentMethod, setPaymentMethod] = React.useState<'PROVIDER' | 'BALANCE'>(
    offer.providerAvailable ? 'PROVIDER' : 'BALANCE',
  );
  const [providerMethod, setProviderMethod] = React.useState<string | null>(firstMethod);

  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const selected = start && end ? daysBetween(start, end, offer.calendar) : [];
  const days = selected.length;
  const total = days * price;
  const credit = Math.min(offer.creditAvailable, total);
  const toPay = total - credit;
  const balanceShort =
    offer.balanceAvailable !== null && toPay > 0 && offer.balanceAvailable < toPay;

  const months = React.useMemo(() => groupByMonth(offer.calendar), [offer.calendar]);

  function pick(entry: SpotlightCalendarDay) {
    setRangeError(null);
    setDone(null);

    if (!entry.selectable) return;

    // Premier choix, ou nouvelle période : le jour seul.
    if (!start || !end || start !== end || entry.day < start) {
      setStart(entry.day);
      setEnd(entry.day);
      return;
    }

    if (entry.day === start) return;

    const range = daysBetween(start, entry.day, offer.calendar);
    const blocked = range.find((day) => !day.selectable);

    if (blocked) {
      setRangeError(
        `Le ${dayFormat.format(noon(blocked.day))} n’est pas disponible (${(blocked.reason ?? 'complet').toLowerCase()}) : choisis une période sans interruption.`,
      );
      return;
    }

    if (range.length > offer.maxDaysPerBooking) {
      setRangeError(
        `${offer.maxDaysPerBooking} jours au plus par demande. Tu pourras en faire une seconde pour la suite.`,
      );
      return;
    }

    setEnd(entry.day);
  }

  async function onImage(file: File) {
    setImagePhase('uploading');
    setImageError(null);
    setImageProgress(0);

    const outcome = await uploadFile(file, `/api/media/event-cover?eventId=${eventId}`, {
      onProgress: setImageProgress,
    });

    if (!outcome.ok) {
      setImagePhase('error');
      setImageError(outcome.message);
      return;
    }

    setImageUrl(outcome.data.url);
    setImagePhase('done');
  }

  async function onVideo(file: File) {
    setVideoPhase('uploading');
    setVideoError(null);
    setVideoProgress(0);

    const outcome = await uploadSpotlightVideo(eventId, file, setVideoProgress);

    if (!outcome.ok) {
      setVideoPhase('error');
      setVideoError(outcome.message);
      return;
    }

    setVideo(outcome.data);
    setVideoPhase('done');
  }

  async function submit() {
    if (!start || !end || days === 0) return;

    setPending(true);
    setError(null);
    setDone(null);
    setStatus('Réservation de tes jours…');

    const method = toPay === 0 ? 'PROVIDER' : paymentMethod;

    const created = await requestSpotlightAction(eventId, {
      startDay: start,
      endDay: end,
      paymentMethod: method,
      imageUrl,
      video,
    });

    if (!created.ok) {
      setPending(false);
      setStatus(null);
      setError(created.message);
      // Une place a pu partir entre-temps : le calendrier doit dire la vérité.
      router.refresh();
      return;
    }

    if (!created.data.awaitingPayment) {
      finish(
        created.data.booking.paymentMethod === 'CREDIT'
          ? 'Demande envoyée, réglée avec ton avoir.'
          : 'Demande envoyée, réglée avec ton solde.',
      );
      return;
    }

    if (!providerMethod) {
      setPending(false);
      setStatus(null);
      setError('Aucun moyen de paiement n’est disponible. Réessaie plus tard.');
      return;
    }

    setStatus('Ouverture de la fenêtre de paiement…');

    const run = await runSpotlightPayment(
      eventId,
      created.data.booking.id,
      providerMethod,
      setStatus,
    );

    if (run.outcome === 'paid') {
      finish('Paiement reçu, demande envoyée.');
      return;
    }

    setPending(false);
    setStatus(null);
    router.refresh();

    if (run.outcome === 'failed') {
      setError(
        `${run.message} Ta place reste réservée ${offer.holdMinutes} minutes : reprends le paiement ci-dessous.`,
      );
    } else if (run.outcome === 'pending') {
      setError(run.message);
    } else {
      setError(
        `Paiement non terminé. Ta place reste réservée ${offer.holdMinutes} minutes : reprends le paiement depuis la liste ci-dessous.`,
      );
    }
  }

  function finish(message: string) {
    setPending(false);
    setStatus(null);
    setDone(
      `${message} L’équipe la vérifie sous ${offer.reviewHours} h : tu seras prévenu dès qu’elle est validée.`,
    );
    setStart(null);
    setEnd(null);
    setImageUrl(null);
    setImagePhase('idle');
    setVideo(null);
    setVideoPhase('idle');
    router.refresh();
  }

  const previewView: SpotlightView = {
    ...preview,
    imageUrl: imageUrl ?? preview.imageUrl,
    video,
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        {done ? (
          <Alert tone="success" title="C’est noté">
            {done}
          </Alert>
        ) : null}

        {/* ── 1. Les jours ─────────────────────────────────────────────── */}
        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
          <StepTitle icon={<CalendarDays className="size-4" />} step={1} title="Choisis tes jours">
            {formatMoney(price, offer.currency)} par jour · {offer.paidSlotsPerDay} places par jour,
            de minuit à minuit. Touche un premier jour, puis le dernier.
          </StepTitle>

          {offer.calendar.length === 0 ? (
            <p className="text-body-s text-text-2">Aucun jour n’est réservable pour le moment.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {months.map((month) => (
                <div key={month.key} className="flex flex-col gap-2">
                  <p className="text-body-s font-bold first-letter:uppercase">{month.label}</p>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {WEEKDAYS.map((weekday) => (
                      <span key={weekday} className="pb-1 text-micro font-semibold text-text-3">
                        {weekday}
                      </span>
                    ))}
                    {Array.from({ length: month.offset }, (_, index) => (
                      <span key={`gap-${index}`} aria-hidden />
                    ))}
                    {month.days.map((entry) => {
                      const inRange = Boolean(
                        start && end && entry.day >= start && entry.day <= end,
                      );
                      const edge = entry.day === start || entry.day === end;

                      return (
                        <button
                          key={entry.day}
                          type="button"
                          disabled={!entry.selectable || pending}
                          onClick={() => pick(entry)}
                          aria-pressed={inRange}
                          aria-label={`${longDayFormat.format(noon(entry.day))} — ${
                            entry.selectable
                              ? `${entry.free} place${entry.free > 1 ? 's' : ''} libre${entry.free > 1 ? 's' : ''}`
                              : (entry.reason ?? 'indisponible')
                          }`}
                          title={entry.selectable ? undefined : (entry.reason ?? undefined)}
                          className={cn(
                            'relative flex aspect-square min-h-[40px] flex-col items-center justify-center rounded-[10px] text-body-s font-semibold tabular-nums transition',
                            entry.selectable
                              ? 'bg-surface-alt text-text-strong hover:bg-paper'
                              : 'cursor-not-allowed bg-transparent text-text-faint line-through decoration-1',
                            inRange && 'bg-coral-50 text-coral-700',
                            edge && 'bg-coral text-ink hover:bg-coral',
                          )}
                        >
                          {Number(entry.day.slice(8, 10))}
                          {entry.selectable && entry.free <= 1 && !edge ? (
                            <span
                              className="absolute bottom-1 size-1 rounded-full bg-amber"
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-text-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber" aria-hidden /> Dernière place
                </span>
                <span>Barré : complet, ou déjà réservé pour cet événement</span>
              </p>
            </div>
          )}

          {rangeError ? <Alert tone="warning">{rangeError}</Alert> : null}

          {start && end ? (
            <p className="rounded-panel bg-paper px-4 py-3 text-body-s">
              <span className="font-bold">
                {days} jour{days > 1 ? 's' : ''}
              </span>{' '}
              ·{' '}
              {start === end
                ? `le ${longDayFormat.format(noon(start))}`
                : `du ${longDayFormat.format(noon(start))} au ${longDayFormat.format(noon(end))}`}
            </p>
          ) : null}
        </Surface>

        {/* ── 2. La diapositive ────────────────────────────────────────── */}
        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
          <StepTitle icon={<ImageIcon className="size-4" />} step={2} title="Ta diapositive">
            Par défaut, la couverture de ton événement. Un visuel propre à la une, ou une vidéo,
            passent par la validation de l’équipe comme le reste.
          </StepTitle>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <UploadDropzone
                label={
                  imageUrl ? 'Remplacer le visuel de la une' : 'Un visuel pour la une (facultatif)'
                }
                help={`Paysage 16:9, ${UPLOAD_MAX_LABEL} au plus. Le texte de la une s’affiche par-dessus, en bas à gauche.`}
                accept={['image/jpeg', 'image/png', 'image/webp']}
                phase={imagePhase}
                progress={imageProgress}
                error={imageError}
                disabled={pending}
                onSelect={(file) => void onImage(file)}
              />
              {imageUrl ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  onClick={() => {
                    setImageUrl(null);
                    setImagePhase('idle');
                  }}
                >
                  Revenir à la couverture de l’événement
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <UploadDropzone
                label={video ? 'Remplacer la vidéo' : 'Une vidéo (facultatif)'}
                help={`MP4, MOV ou WebM, ${SPOTLIGHT_VIDEO_MAX_LABEL} au plus. Lue muette, coupée à ${SPOTLIGHT_VIDEO_MAX_SECONDS} s, seulement sur une bonne connexion.`}
                accept={SPOTLIGHT_VIDEO_TYPES}
                phase={videoPhase}
                progress={videoProgress}
                error={videoError}
                disabled={pending}
                onSelect={(file) => void onVideo(file)}
              />
              {video ? (
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  onClick={() => {
                    setVideo(null);
                    setVideoPhase('idle');
                  }}
                >
                  <Film className="size-4" aria-hidden /> Retirer la vidéo
                </Button>
              ) : null}
            </div>
          </div>
        </Surface>

        {/* ── 3. Le paiement ───────────────────────────────────────────── */}
        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
          <StepTitle icon={<Wallet className="size-4" />} step={3} title="Paiement">
            Rien n’est prélevé avant que tu valides le montant ci-dessous.
          </StepTitle>

          <dl className="flex flex-col gap-2 text-body-s">
            <Line
              label={
                days > 0
                  ? `${days} jour${days > 1 ? 's' : ''} × ${formatMoney(price, offer.currency)}`
                  : 'Aucun jour choisi'
              }
              value={formatMoney(total, offer.currency)}
            />
            {credit > 0 ? (
              <Line
                label="Ton avoir de mise en avant"
                value={`− ${formatMoney(credit, offer.currency)}`}
                tone="success"
              />
            ) : null}
            <div className="border-t border-border pt-2">
              <Line label="À payer" value={formatMoney(toPay, offer.currency)} strong />
            </div>
          </dl>

          {toPay > 0 ? (
            <fieldset className="flex flex-col gap-2" disabled={pending}>
              <legend className="sr-only">Moyen de paiement</legend>

              {offer.providerAvailable ? (
                <Choice
                  checked={paymentMethod === 'PROVIDER'}
                  onSelect={() => setPaymentMethod('PROVIDER')}
                  title="Mobile Money ou carte"
                  detail="Dans la fenêtre sécurisée de Kkiapay."
                >
                  {paymentMethod === 'PROVIDER' && offer.providerMethods.length > 1 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {offer.providerMethods.map((method) => (
                        <button
                          key={method.code}
                          type="button"
                          onClick={() => setProviderMethod(method.code)}
                          aria-pressed={providerMethod === method.code}
                          className={cn(
                            'rounded-chip border px-3 py-1.5 text-micro font-bold transition',
                            providerMethod === method.code
                              ? 'border-text-strong bg-ink text-white'
                              : 'border-border bg-surface text-text-2 hover:border-border-field',
                          )}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </Choice>
              ) : null}

              {offer.canPayWithBalance ? (
                <Choice
                  checked={paymentMethod === 'BALANCE'}
                  onSelect={() => !balanceShort && setPaymentMethod('BALANCE')}
                  disabled={balanceShort}
                  title="Mon solde Nexa Kabi"
                  detail={
                    offer.balanceAvailable === null
                      ? 'Prélevé sur la recette disponible.'
                      : balanceShort
                        ? `Disponible : ${formatMoney(offer.balanceAvailable, offer.currency)} — insuffisant.`
                        : `Disponible : ${formatMoney(offer.balanceAvailable, offer.currency)}.`
                  }
                />
              ) : null}

              {!offer.providerAvailable && !offer.canPayWithBalance ? (
                <Alert tone="warning">
                  Aucun moyen de paiement n’est ouvert pour toi ici : demande au propriétaire de
                  l’organisation, ou réessaie plus tard.
                </Alert>
              ) : null}
            </fieldset>
          ) : days > 0 ? (
            <p className="text-body-s text-mint-700">Ton avoir couvre tout : rien à payer.</p>
          ) : null}

          <p className="text-micro leading-relaxed text-text-3">
            L’équipe vérifie ta demande sous {offer.reviewHours} h, avant la diffusion. Refusée, tu
            es remboursé sur ton solde. Tu peux annuler avant chaque jour : les jours non commencés
            te sont rendus en avoir, valable 12 mois. Un jour entamé est dû.
          </p>

          {error ? (
            <Alert tone="danger" title="Ça n’a pas abouti">
              {error}
            </Alert>
          ) : null}

          {status ? (
            <p role="status" className="text-body-s font-semibold text-text-2">
              {status}
            </p>
          ) : null}

          <Button
            type="button"
            variant="primary"
            size="primary"
            block
            loading={pending}
            disabled={
              days === 0 ||
              imagePhase === 'uploading' ||
              videoPhase === 'uploading' ||
              (toPay > 0 &&
                ((paymentMethod === 'PROVIDER' && (!offer.providerAvailable || !providerMethod)) ||
                  (paymentMethod === 'BALANCE' && (!offer.canPayWithBalance || balanceShort))))
            }
            onClick={() => void submit()}
          >
            {days === 0
              ? 'Choisis tes jours'
              : toPay === 0
                ? 'Confirmer avec mon avoir'
                : paymentMethod === 'BALANCE'
                  ? `Payer ${formatMoney(toPay, offer.currency)} avec mon solde`
                  : `Payer ${formatMoney(toPay, offer.currency)}`}
          </Button>
        </Surface>
      </div>

      {/* ── Aperçu exact ───────────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-6">
        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <SpotlightCarousel slides={[previewView]} slideSeconds={7} title="Aperçu" preview />
          <p className="text-micro text-text-3">
            C’est la diapositive que les visiteurs verront en haut de Découvrir et de l’accueil.
            {preview.sponsored ? ' La mention « Sponsorisé » l’accompagne.' : ''}
          </p>
        </Surface>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function groupByMonth(calendar: SpotlightCalendarDay[]) {
  const months: Array<{
    key: string;
    label: string;
    offset: number;
    days: SpotlightCalendarDay[];
  }> = [];

  for (const entry of calendar) {
    const key = entry.day.slice(0, 7);
    let month = months.find((candidate) => candidate.key === key);

    if (!month) {
      month = {
        key,
        label: monthFormat.format(noon(entry.day)),
        offset: weekdayIndex(entry.day),
        days: [],
      };
      months.push(month);
    }

    month.days.push(entry);
  }

  return months;
}

function StepTitle({
  icon,
  step,
  title,
  children,
}: {
  icon: React.ReactNode;
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white"
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="text-body font-bold">
          <span className="sr-only">Étape {step} : </span>
          {title}
        </h2>
        <p className="text-body-s text-text-2">{children}</p>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'success';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(strong ? 'font-bold text-text-strong' : 'text-text-2')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          strong ? 'text-body font-bold' : 'font-semibold',
          tone === 'success' && 'text-mint-700',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Choice({
  checked,
  onSelect,
  title,
  detail,
  disabled = false,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-panel border p-3 transition',
        checked ? 'border-text-strong bg-surface-alt' : 'border-border',
        disabled && 'opacity-55',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-start gap-3 text-left disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
            checked ? 'border-ink bg-ink text-white' : 'border-border-field',
          )}
          aria-hidden
        >
          {checked ? <Check className="size-3" /> : null}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-body-s font-bold">{title}</span>
          <span className="text-micro text-text-3">{detail}</span>
        </span>
      </button>
      {children}
    </div>
  );
}
