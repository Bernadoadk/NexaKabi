import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Banknote, ChevronRight, Check, Ticket, Users } from 'lucide-react';
import type { Balance, EventSummary } from '@nexakabi/contracts';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  EventCardCompact,
  Stat,
  Surface,
  SurfaceHeader,
  SurfaceTitle,
} from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { getOrganization, orgFetch, resolveActiveOrganization } from '@/lib/organizations';

export const metadata: Metadata = { title: 'Tableau de bord' };

/** Statuts qu'un organisateur doit encore surveiller — les statuts terminaux
 *  (terminé, annulé, refusé, archivé) n'ont plus rien à décider. */
const OPEN_STATUSES: ReadonlySet<EventSummary['status']> = new Set([
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'SOLD_OUT',
  'POSTPONED',
]);

/**
 * Tableau de bord de l'organisation (écran O1).
 *
 * ── Ce que cette page corrige ──────────────────────────────────────────────
 * L'ancienne version n'affichait que l'identité de l'organisation et un seul
 * bouton (« Gérer l'équipe ») — son propre texte disait « Événements et
 * billetterie — phase 5 / Revenus et retraits — phase 9 » alors que ces deux
 * écrans étaient déjà construits et fonctionnels. Un organisateur qui créait
 * son organisation n'avait aucun chemin visible vers ses événements ou son
 * argent.
 *
 * Cette version répond à trois questions au premier regard : combien j'ai
 * vendu, qu'est-ce qui arrive bientôt, qu'est-ce que je peux faire maintenant.
 * L'organisation active et la navigation persistante vivent désormais dans
 * `layout.tsx` ; cette page ne porte plus que le contenu.
 *
 * Les indicateurs affichés sont ceux que l'API expose réellement (solde,
 * cumul depuis la création, événements, équipe) — pas de « ce mois-ci », qui
 * demanderait un nouvel agrégat côté API et n'existe pas encore.
 */
export default async function ProHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?suite=/pro');

  const { active } = await resolveActiveOrganization();
  // Le layout gère déjà ce cas (formulaire de création plein écran) ; ce
  // second contrôle est une défense en profondeur, pas le chemin normal.
  if (!active) redirect('/pro');

  const [organization, eventsResult, balanceResult] = await Promise.all([
    getOrganization(active.id),
    orgFetch<EventSummary[]>(active.id, '/organizer/events'),
    orgFetch<Balance>(active.id, '/organizer/finance/balance'),
  ]);

  const events = eventsResult.ok ? eventsResult.data : [];
  const upcoming = [...events]
    .filter((event) => OPEN_STATUSES.has(event.status))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5);

  const publishedCount = events.filter(
    (event) => event.status === 'PUBLISHED' || event.status === 'SOLD_OUT',
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-h1 font-bold">Tableau de bord</h1>
          {active.verificationStatus === 'VERIFIED' ? (
            <Badge tone="verified">
              <Check className="size-3" strokeWidth={3} />
              Vérifié
            </Badge>
          ) : (
            <Badge tone="warning">Non vérifié</Badge>
          )}
        </div>

        <Button asChild variant="primary" size="compact">
          <Link href="/pro/evenements">+ Créer un événement</Link>
        </Button>
      </div>

      {active.verificationStatus !== 'VERIFIED' ? (
        <Alert tone="warning" title="La vérification débloque les retraits">
          <p>
            Tu peux publier et vendre dès maintenant. Le retrait de tes fonds reste bloqué tant que
            ton identité n’est pas vérifiée — c’est ce qui protège les participants sans freiner ton
            activité.
          </p>
          <Link
            href="/pro/verification"
            className="mt-2 inline-block font-semibold underline underline-offset-2"
          >
            {active.verificationStatus === 'UNVERIFIED'
              ? 'Envoyer mon dossier'
              : 'Voir mon dossier'}{' '}
            →
          </Link>
        </Alert>
      ) : null}

      {organization?.payoutFrozen ? (
        <Alert tone="danger" title="Retraits gelés">
          Tes retraits sont actuellement suspendus. Contacte le support pour en savoir plus.
        </Alert>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {balanceResult.ok ? (
          <Stat
            label="Solde disponible"
            amount={balanceResult.data.availableAmount}
            hint={balanceResult.data.canRequestPayout ? 'Retrait possible' : 'Voir Finances'}
            tone="ink"
          />
        ) : (
          <Stat label="Solde disponible" value="—" hint="Indisponible pour le moment" />
        )}
        {balanceResult.ok ? (
          <Stat
            label="Total encaissé"
            amount={balanceResult.data.grossSales}
            hint="depuis la création"
          />
        ) : null}
        <Stat
          label="Événements publiés"
          value={String(publishedCount)}
          hint={`${events.length} au total`}
        />
        <Stat label="Membres de l’équipe" value={String(active.memberCount)} />
      </div>

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <SurfaceHeader>
          <SurfaceTitle>Prochains événements</SurfaceTitle>
          <div className="flex-1" />
          <Link
            href="/pro/evenements"
            className="text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            Tout voir
          </Link>
        </SurfaceHeader>

        {upcoming.length === 0 ? (
          <EmptyState
            icon={<Ticket size={26} />}
            title="Aucun événement à venir"
            description="Créez votre premier événement — il faut cinq minutes, et vous pouvez le publier plus tard."
            action={
              <Button asChild variant="primary">
                <Link href="/pro/evenements">Créer un événement</Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {upcoming.map((event) => (
              <li key={event.id}>
                <EventCardCompact
                  event={{
                    slug: event.slug,
                    title: event.title,
                    startsAt: new Date(event.startsAt),
                  }}
                  href={`/pro/evenements/${event.id}`}
                  detail={
                    [event.venueName, event.cityName].filter(Boolean).join(' · ') ||
                    'Lieu à définir'
                  }
                  status={<DashboardStatusBadge status={event.status} />}
                />
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          href="/pro/evenements"
          icon={<Ticket size={20} />}
          label="Créer un événement"
        />
        <QuickAction
          href="/pro/finances"
          icon={<Banknote size={20} />}
          label="Demander un retrait"
        />
        <QuickAction href="/pro/equipe" icon={<Users size={20} />} label="Inviter un membre" />
      </div>
    </div>
  );
}

/** N'affiche un badge que pour les statuts qui demandent encore une action —
 *  un événement publié n'a rien à signaler sur un tableau de bord compact. */
function DashboardStatusBadge({ status }: { status: EventSummary['status'] }) {
  if (status === 'DRAFT') return <Badge tone="neutral">Brouillon</Badge>;
  if (status === 'PENDING_REVIEW') return <Badge tone="warning">En vérification</Badge>;
  if (status === 'SOLD_OUT') return <Badge tone="warning">Complet</Badge>;
  if (status === 'POSTPONED') return <Badge tone="warning">Reporté</Badge>;
  return null;
}

function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Surface variant="panel" padding="none">
      <Link
        href={href}
        className="flex items-center gap-3 p-4 text-text-strong transition hover:bg-surface-alt"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-coral-50 text-coral"
        >
          {icon}
        </span>
        <span className="flex-1 text-body font-semibold">{label}</span>
        <ChevronRight aria-hidden className="size-4 text-text-3" />
      </Link>
    </Surface>
  );
}
