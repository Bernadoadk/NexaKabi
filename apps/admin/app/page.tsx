import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { AdminDashboard } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import { Alert, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AdminShell } from './shell';

export const metadata: Metadata = { title: 'Tableau de bord' };

/**
 * Écran M1 — tableau de bord.
 *
 * ── Ce qu'il affiche, et pourquoi ces chiffres-là ─────────────────────────
 * Ce qui ATTEND UNE DÉCISION HUMAINE d'abord : dossiers de vérification,
 * signalements, retraits. Chacun est un lien, parce qu'un compteur sur lequel
 * on ne peut pas cliquer oblige à chercher où aller.
 *
 * Puis l'activité des dernières vingt-quatre heures, qui sert à repérer une
 * anomalie : un pic de paiements échoués annonce une panne opérateur avant que
 * le support ne reçoive le premier appel.
 *
 * Pas de courbes, pas de taux de conversion. Ce n'est pas un tableau de bord
 * commercial, c'est une liste de choses à faire.
 */
export default async function AdminHomePage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');

  const result = await adminFetch<AdminDashboard>('/dashboard');

  if (!result.ok) {
    return (
      <AdminShell user={user}>
        <Alert tone="danger" title="Tableau de bord indisponible">
          {result.message}
        </Alert>
      </AdminShell>
    );
  }

  const data = result.data;

  // Un compteur ne s'affiche que si l'espace derrière est ouvert à ce
  // compte : un chiffre qu'on ne peut pas aller voir n'est qu'une frustration.
  const tiles = [
    hasAdminAccess(user, 'events') && (
      <ActionTile
        key="events"
        href="/evenements"
        label="Événements à publier"
        value={data.pendingEvents}
        hint="Chaque jour d’attente coûte des ventes"
      />
    ),
    hasAdminAccess(user, 'verifications') && (
      <ActionTile
        key="verifications"
        href="/verifications"
        label="Vérifications"
        value={data.pendingVerifications}
        hint="Chaque dossier bloque des recettes"
      />
    ),
    hasAdminAccess(user, 'reports') && (
      <ActionTile
        key="reports"
        href="/signalements"
        label="Signalements"
        value={data.openReports}
        hint="Triés par risque financier"
      />
    ),
    hasAdminAccess(user, 'payouts') && (
      <ActionTile
        key="payouts"
        href="/retraits"
        label="Retraits à traiter"
        value={data.pendingPayouts}
        hint={`${formatMoney(data.pendingPayoutAmount)}`}
      />
    ),
  ].filter(Boolean);

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
            En attente d’une décision
          </h2>

          {tiles.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tiles}</div>
          ) : (
            <Surface variant="muted" padding="comfortable">
              <p className="text-body-s text-text-2">
                Aucun espace ne t’est encore ouvert. Le propriétaire peut t’en donner depuis
                l’écran Équipe.
              </p>
            </Surface>
          )}
        </section>

        {/* Bande d'indicateurs de plateforme, sous la file d'action — jamais
            en tête d'écran. Ce tableau de bord reste d'abord une liste de
            décisions à prendre ; « comment va la plateforme dans l'ensemble »
            est une question différente, qui mérite sa place sans prendre la
            première. */}
        <section className="flex flex-col gap-3">
          <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
            Vue d’ensemble
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoTile
              label="Organisations"
              value={`${data.verifiedOrganizations} / ${data.totalOrganizations}`}
            />
            <InfoTile label="Volume encaissé (total)" value={formatMoney(data.totalGrossVolume)} />
            <InfoTile
              label="Événements publiés ce mois"
              value={String(data.eventsPublishedThisMonth)}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-micro font-bold uppercase tracking-wide text-text-3">
            Dernières vingt-quatre heures
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <InfoTile label="Commandes payées" value={String(data.ordersLast24h)} />
            <InfoTile label="Recettes encaissées" value={`${formatMoney(data.revenueLast24h)}`} />
            <InfoTile
              label="Paiements échoués"
              value={String(data.failedPaymentsLast24h)}
              // Un pic ici précède les appels au support : c'est le seul
              // chiffre de cet écran qu'on regarde en espérant qu'il soit bas.
              tone={data.failedPaymentsLast24h > data.ordersLast24h ? 'alert' : 'neutral'}
            />
          </div>
        </section>

        {data.frozenAmount > 0 ? (
          <Alert tone="warning" title="Fonds gelés">
            {formatMoney(data.frozenAmount)} sont actuellement sous séquestre. Chaque gel correspond
            à une instruction en cours : un dossier oublié immobilise l’argent d’un organisateur qui
            n’a peut-être rien à se reprocher.
          </Alert>
        ) : null}
      </div>
    </AdminShell>
  );
}

/** Compteur cliquable : un nombre sans destination oblige à chercher où aller. */
function ActionTile({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Surface variant="panel" padding="none">
      <Link
        href={href}
        className="flex flex-col gap-1 p-5 text-text-strong transition hover:bg-surface-alt"
      >
        <span className="text-body-s font-semibold text-text-2">{label}</span>
        <span
          className={
            value > 0
              ? 'font-display text-[34px] font-bold leading-none tabular-nums text-coral'
              : 'font-display text-[34px] font-bold leading-none tabular-nums text-text-3'
          }
        >
          {value}
        </span>
        <span className="text-micro text-text-3">{hint}</span>
      </Link>
    </Surface>
  );
}

function InfoTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'alert';
}) {
  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-1">
      <span className="text-body-s font-semibold text-text-2">{label}</span>
      <span
        className={
          tone === 'alert'
            ? 'font-display text-h2 font-bold tabular-nums text-coral'
            : 'font-display text-h2 font-bold tabular-nums'
        }
      >
        {value}
      </span>
    </Surface>
  );
}
