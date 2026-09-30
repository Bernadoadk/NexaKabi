'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { FollowedOrganization } from '@nexakabi/contracts';
import { Badge, Button, Surface } from '@nexakabi/ui';

/**
 * Les organisateurs que je suis — et le moyen d'arrêter d'un toucher.
 *
 * Ne plus suivre retire la ligne tout de suite ; en cas d'échec, elle revient
 * avec un message. Aucune confirmation : suivre de nouveau est aussi simple,
 * depuis la page de l'organisateur.
 */
export function FollowedOrganizers({ initial }: { initial: FollowedOrganization[] }) {
  const [follows, setFollows] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  async function unfollow(organization: FollowedOrganization) {
    const previous = follows;
    setFollows(follows.filter((entry) => entry.id !== organization.id));
    setError(null);

    try {
      const response = await fetch(`/api/me/follows/${encodeURIComponent(organization.slug)}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error();
    } catch {
      setFollows(previous);
      setError(`Impossible de ne plus suivre ${organization.name} pour l’instant.`);
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold">Organisateurs suivis</h2>
        <p className="text-body-s text-text-2">
          Tu es prévenu quand ils publient un événement. Ils voient combien de personnes les
          suivent, jamais qui.
        </p>
      </div>

      {follows.length === 0 ? (
        <p className="rounded-[12px] bg-paper p-3.5 text-body-s text-text-2">
          Tu ne suis encore personne. Sur la page d’un organisateur ou d’un événement, touche «
          Suivre » pour être prévenu de ses prochaines dates.
        </p>
      ) : (
        <ul className="flex flex-col">
          {follows.map((organization) => (
            <li
              key={organization.id}
              className="flex items-center gap-3 border-b border-border-subtle py-3 last:border-0"
            >
              {organization.logoUrl ? (
                <img
                  src={organization.logoUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white">
                  {organization.name.slice(0, 2).toUpperCase()}
                </span>
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/o/${organization.slug}`}
                    className="truncate text-body-s font-bold text-text-strong hover:text-coral"
                  >
                    {organization.name}
                  </Link>
                  {organization.verified ? (
                    <Badge tone="verified">
                      <Check className="size-3" strokeWidth={3} />
                      Vérifié
                    </Badge>
                  ) : null}
                </div>
                <span className="text-micro text-text-3">
                  {organization.upcomingEventsCount === 0
                    ? 'Aucun événement à venir pour le moment'
                    : `${organization.upcomingEventsCount} événement${organization.upcomingEventsCount > 1 ? 's' : ''} à venir`}
                </span>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => void unfollow(organization)}
              >
                Ne plus suivre
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="text-body-s font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}
