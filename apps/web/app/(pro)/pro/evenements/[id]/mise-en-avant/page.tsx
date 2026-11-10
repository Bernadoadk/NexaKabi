import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { SPOTLIGHT_CREDIT_REASON_LABELS, type SpotlightOffer } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Button, EmptyState, Surface } from '@nexakabi/ui';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { getCurrentUser } from '@/lib/session';
import { toSpotlightView } from '@/lib/spotlights';
import { BookingList } from './booking-list';
import { SpotlightPlanner } from './spotlight-planner';

export const metadata: Metadata = { title: 'Mise en avant' };

const expiryFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Porto-Novo',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Mise en avant — acheter une place à la une de Découvrir et de l'accueil.
 *
 * ── Ce que l'écran doit à l'organisateur ────────────────────────────────────
 * Avant de payer : les jours libres, le prix exact, la diapositive telle
 * qu'elle paraîtra, et les règles (validation, remboursement, avoir). Après :
 * où en est sa place, ce qu'elle lui a rapporté — vues, clics, billets — et
 * son reçu. Une place payée dont on ne voit pas l'effet ne se rachète pas.
 */
export default async function SpotlightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?suite=/pro/evenements/${id}/mise-en-avant`);

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const result = await orgFetch<SpotlightOffer>(
    active.id,
    `/organizer/events/${encodeURIComponent(id)}/spotlight`,
  );

  if (!result.ok) {
    return (
      <Alert
        tone={result.error.statusCode === 403 ? 'warning' : 'danger'}
        title="Mise en avant indisponible"
      >
        {result.error.statusCode === 403
          ? 'Ton rôle ne permet pas de gérer la mise en avant de cet événement. Demande au propriétaire de l’organisation.'
          : result.error.message}
      </Alert>
    );
  }

  const offer = result.data;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Mise en avant</h1>
        <p className="max-w-[68ch] text-body-s text-text-2">
          Place ton événement à la une de Découvrir et de l’accueil : une grande diapositive qui
          défile en haut de la page, vue par chaque visiteur. Les billets vendus grâce à elle te
          sont comptés.
        </p>
      </header>

      {offer.eligible ? (
        <SpotlightPlanner eventId={id} offer={offer} preview={toSpotlightView(offer.preview)} />
      ) : (
        <Ineligible offer={offer} />
      )}

      {offer.creditAvailable > 0 ? (
        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-2">
          <h2 className="text-body font-bold">
            Ton avoir : {formatMoney(offer.creditAvailable, offer.currency)}
          </h2>
          <p className="text-body-s text-text-2">
            Déduit automatiquement de ta prochaine mise en avant, sur n’importe quel événement de
            ton organisation.
          </p>
          <ul className="flex flex-col gap-1 text-body-s">
            {offer.credits.map((credit) => (
              <li
                key={credit.id}
                className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-1.5"
              >
                <span>
                  {formatMoney(credit.remaining, credit.currency)} ·{' '}
                  {credit.note ?? SPOTLIGHT_CREDIT_REASON_LABELS[credit.reason]}
                </span>
                <span className="text-text-3">
                  jusqu’au {expiryFormat.format(new Date(credit.expiresAt))}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      <BookingList eventId={id} bookings={offer.bookings} providerMethods={offer.providerMethods} />
    </div>
  );
}

function Ineligible({ offer }: { offer: SpotlightOffer }) {
  return (
    <EmptyState
      icon={<Megaphone size={26} />}
      title={
        offer.ineligibility === 'NOT_VERIFIED'
          ? 'Réservé aux organisations vérifiées'
          : 'Pas de mise en avant pour le moment'
      }
      description={offer.ineligibilityMessage ?? undefined}
      action={
        offer.ineligibility === 'NOT_VERIFIED' ? (
          <Button asChild variant="primary">
            <Link href="/pro/verification">Faire vérifier mon organisation</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
