import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import type { SpotlightAdminOverview } from '@nexakabi/contracts';
import { Alert, Button, EmptyState } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../access';
import { AdminShell } from '../shell';
import { ActiveSpotlights, PastSpotlights } from './spotlight-board';
import { PendingBookings, RecentBookings } from './spotlight-bookings';
import { SpotlightSettingsCard } from './spotlight-settings';

export const metadata: Metadata = { title: 'À la une' };

/**
 * Espace « À la une » — la vitrine de Découvrir et de l'accueil.
 *
 * ── Ce qu'on y décide ─────────────────────────────────────────────────────
 * Ce qui défile en haut de la découverte, dans quel ordre, et jusqu'à quand.
 * Deux sortes de mises en avant : un événement de la plateforme (la une mène
 * à sa page, et les billets vendus ensuite lui sont attribués), ou un
 * événement dont la billetterie est ailleurs (la une mène au site officiel, et
 * chaque clic est compté — l'argument pour faire venir cet organisateur).
 *
 * ── Et ce qui s'y vend ────────────────────────────────────────────────────
 * Les places achetées par les organisateurs arrivent payées, en attente de
 * décision : l'équipe valide (la place sera diffusée sur ses dates) ou refuse
 * (l'argent revient au solde de l'organisation). La promesse faite à
 * l'organisateur est une réponse sous 24 h.
 */
export default async function SpotlightsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'spotlights')) return <AccessDenied user={user} space="spotlights" />;
  const canAct = hasAdminAccess(user, 'spotlights', 'act');

  const result = await adminFetch<SpotlightAdminOverview>('/spotlights');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">À la une</h1>
            <p className="text-body-s text-text-2">
              Ce qui défile en haut de Découvrir et de l’accueil. Un événement annulé, complet ou
              passé en sort tout seul.
            </p>
          </div>
          {canAct ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="compact">
                <Link href="/a-la-une/nouvelle?type=evenement">Ajouter un événement Nexa Kabi</Link>
              </Button>
              <Button asChild variant="ink" size="compact">
                <Link href="/a-la-une/nouvelle?type=externe">Ajouter un événement externe</Link>
              </Button>
            </div>
          ) : null}
        </header>

        {!canAct ? <ReadOnlyNotice what="modifier la une" /> : null}

        {!result.ok ? (
          <Alert tone="danger" title="Espace indisponible">
            {result.message}
          </Alert>
        ) : (
          <Board data={result.data} canAct={canAct} canMoveMoney={user.canMoveMoney} />
        )}
      </div>
    </AdminShell>
  );
}

function Board({
  data,
  canAct,
  canMoveMoney,
}: {
  data: SpotlightAdminOverview;
  canAct: boolean;
  canMoveMoney: boolean;
}) {
  const current = data.items.filter((item) => item.phase === 'LIVE' || item.phase === 'SCHEDULED');
  const past = data.items.filter((item) => item.phase === 'ENDED' || item.phase === 'WITHDRAWN');
  const live = current.filter((item) => item.phase === 'LIVE' && !item.hiddenReason).length;
  const { pending, recent } = data.bookings;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        {pending.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
                Places payées à valider · {pending.length}
              </h2>
              <p className="text-micro text-text-3">
                Réponse promise sous 24 h · les plus anciennes d’abord
              </p>
            </div>
            <PendingBookings items={pending} canAct={canAct} />
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
              En ligne et programmées
            </h2>
            <p className="text-micro text-text-3">
              {live} visible{live > 1 ? 's' : ''} · {data.settings.maxSlides} places au plus par
              pays, dont {data.settings.paidSlotsPerDay} vendables · dans l’ordre de la une
            </p>
          </div>

          {current.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={26} />}
              title="La une est vide"
              description={
                canAct
                  ? 'Ajoute un événement de la plateforme, ou un événement externe dont tu veux faire parler. Sans mise en avant, Découvrir et l’accueil s’affichent comme avant.'
                  : 'Les mises en avant choisies par l’équipe apparaîtront ici.'
              }
            />
          ) : (
            <ActiveSpotlights items={current} maxSlides={data.settings.maxSlides} canAct={canAct} />
          )}
        </section>

        {recent.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
              Places achetées
            </h2>
            <RecentBookings items={recent} canMoveMoney={canMoveMoney && canAct} />
          </section>
        ) : null}

        {past.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
              Terminées et retirées
            </h2>
            <PastSpotlights items={past} />
          </section>
        ) : null}
      </div>

      <SpotlightSettingsCard initial={data.settings} countries={data.countries} canAct={canAct} />
    </div>
  );
}
