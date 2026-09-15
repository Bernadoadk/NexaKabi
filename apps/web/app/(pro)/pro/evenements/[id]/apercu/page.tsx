import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Eye, Pencil } from 'lucide-react';
import type { EventDetail } from '@nexakabi/contracts';
import { Alert, Button } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';
import { EventPageView } from '@/components/event-page-view';
import { PublishBar } from './publish-bar';

export const metadata: Metadata = { title: 'Aperçu de l’événement' };

/**
 * Aperçu de la page publique, avant — ou après — publication.
 *
 * ── Ce que cet écran corrige ────────────────────────────────────────────────
 * Un brouillon n'avait AUCUNE page : `/e/[slug]` ne sert que les événements
 * en ligne, et l'étape « Aperçu » de l'assistant n'affichait qu'un encart.
 * L'organisateur publiait à l'aveugle, puis découvrait un visuel mal cadré
 * ou une description tronquée sur la page que ses participants voyaient
 * déjà. Ici, la page est rendue par le même composant que la page publique,
 * pour l'organisation seule, quel que soit l'état de l'événement.
 *
 * Les manques bloquants pour publier sont rappelés en tête, avec un retour
 * direct vers l'assistant : voir, corriger, publier — dans cet ordre.
 */
export default async function EventPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?suite=/pro/evenements/${id}/apercu`);

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const [result, readinessResult] = await Promise.all([
    orgFetch<EventDetail>(active.id, `/organizer/events/${id}`),
    orgFetch<{ missing: string[] }>(active.id, `/organizer/events/${id}/readiness`),
  ]);

  if (!result.ok) notFound();

  const event = result.data;
  const missing = readinessResult.ok ? readinessResult.data.missing : [];
  const live = event.status === 'PUBLISHED' || event.status === 'SOLD_OUT';
  const pendingReview = event.status === 'PENDING_REVIEW';
  const canPublish = event.status === 'DRAFT' || event.status === 'REJECTED';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-ink text-white">
            <Eye className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-body font-bold text-text-strong">
              {live
                ? 'Ta page publique, telle que les participants la voient'
                : pendingReview
                  ? 'En vérification — voici la page telle qu’elle sera publiée'
                  : 'Aperçu de ta page'}
            </p>
            <p className="text-body-s text-text-2">
              {live
                ? 'Toute modification enregistrée dans l’assistant apparaît ici après quelques instants.'
                : pendingReview
                  ? 'La plateforme relit un premier événement sous 2 heures ouvrées. Tu peux encore corriger : la version relue est toujours la dernière.'
                  : 'Seule ton organisation voit cette page pour l’instant. Vérifie chaque bloc, puis publie.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="secondary" size="compact">
            <Link href={`/pro/evenements/${id}`}>
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          </Button>
          {live ? (
            <Button asChild variant="ink" size="compact">
              <Link href={`/e/${event.slug}`} target="_blank" rel="noopener">
                Ouvrir la page publique ↗
              </Link>
            </Button>
          ) : canPublish ? (
            <PublishBar organizationId={active.id} eventId={id} disabled={missing.length > 0} />
          ) : null}
        </div>
      </div>

      {canPublish && missing.length > 0 ? (
        <Alert tone="warning" title="Avant de publier, il reste à compléter">
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="-mx-4 overflow-hidden border-y border-border bg-paper sm:mx-0 sm:rounded-panel sm:border">
        <EventPageView event={event} mode="preview" />
      </div>
    </div>
  );
}
