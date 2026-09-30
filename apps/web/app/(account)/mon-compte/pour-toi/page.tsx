import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button, EmptyState, ErrorState, EventCardStandard } from '@nexakabi/ui';
import { fetchRecommendations } from '@/lib/notifications';
import { toCard } from '../../../(public)/page';

export const metadata: Metadata = { title: 'Pour toi' };

/**
 * « Pour toi » — les événements à venir qui correspondent aux goûts.
 *
 * C'est la destination de la sélection hebdomadaire, mais pas seulement : la
 * page montre TOUT ce qui correspond, pas les seules nouveautés de la semaine.
 * Elle n'a pas d'entrée dans la navigation (quatre entrées, c'est le plafond) :
 * on y arrive par l'alerte, ou depuis les réglages.
 */
export default async function ForYouPage() {
  const selection = await fetchRecommendations();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-text-3">Sélection</p>
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Pour toi</h1>
        <p className="text-body-s text-text-2">
          {selection?.hasInterests
            ? 'Les événements à venir dans tes catégories et tes villes.'
            : 'Tu n’as pas encore choisi tes goûts : voici tout ce qui arrive.'}{' '}
          <Link href="/mon-compte/notifications" className="font-semibold">
            Modifier mes goûts
          </Link>
        </p>
      </header>

      {selection === null ? (
        <ErrorState
          title="Sélection indisponible"
          description="Elle n’a pas pu être chargée. Réessaie dans un instant."
        />
      ) : selection.events.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={26} />}
          title="Rien pour l’instant"
          description="Aucun événement à venir ne correspond encore à tes goûts. Élargis-les, ou reviens bientôt : les organisateurs publient chaque semaine."
          action={
            <Button asChild variant="primary" size="primary">
              <Link href="/evenements">Tout le catalogue</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {selection.events.map((event) => (
            <EventCardStandard key={event.id} event={toCard(event)} href={`/e/${event.slug}`} />
          ))}
        </div>
      )}
    </div>
  );
}
