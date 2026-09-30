'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BellPlus, Check } from 'lucide-react';
import type { FollowState } from '@nexakabi/contracts';
import { Button, buttonVariants, cn } from '@nexakabi/ui';

/**
 * Suivre un organisateur — pour être prévenu de ses prochains événements.
 *
 * ── Sans compte ─────────────────────────────────────────────────────────────
 * Le bouton mène à la connexion, avec le retour sur cette page et
 * `?suivre=1` : une fois connecté, le suivi se fait tout seul. Demander à la
 * personne de retoucher « Suivre » après s'être connectée, c'est lui faire
 * faire deux fois ce qu'elle a déjà demandé.
 *
 * ── Avec compte ─────────────────────────────────────────────────────────────
 * `PUT` pour suivre, `DELETE` pour ne plus suivre : un double toucher sur un
 * téléphone lent laisse l'état voulu au lieu de l'annuler.
 */
export function FollowButton({
  slug,
  organizationName,
  initial,
  signedIn,
  followersCount,
  className,
}: {
  slug: string;
  organizationName: string;
  initial: FollowState | null;
  signedIn: boolean;
  /** Affiché sous le bouton quand il est connu — la page organisateur le donne. */
  followersCount?: number;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = React.useState<FollowState | null>(initial);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const following = state?.following ?? false;

  const update = React.useCallback(
    async (follow: boolean) => {
      setPending(true);
      setError(null);

      try {
        const response = await fetch(`/api/me/follows/${encodeURIComponent(slug)}`, {
          method: follow ? 'PUT' : 'DELETE',
        });

        const payload = (await response.json().catch(() => null)) as
          (FollowState & { message?: string }) | null;

        if (!response.ok || !payload) {
          setError(payload?.message ?? 'Réessaie dans un instant.');
          return;
        }

        setState({ following: payload.following, followersCount: payload.followersCount });
      } catch {
        setError('Réessaie dans un instant.');
      } finally {
        setPending(false);
      }
    },
    [slug],
  );

  const count = state?.followersCount ?? followersCount;
  const countLabel =
    count === undefined || count === 0
      ? null
      : `${count.toLocaleString('fr-FR')} abonné${count > 1 ? 's' : ''}`;

  // Retour de la connexion avec `?suivre=1` : le suivi demandé avant de se
  // connecter se fait maintenant, puis l'adresse est nettoyée pour qu'un
  // rechargement ne le rejoue pas.
  const autoFollow = signedIn && searchParams.get('suivre') === '1';
  React.useEffect(() => {
    if (!autoFollow) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete('suivre');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });

    if (!following) void update(true);
    // Une seule fois, au retour de la connexion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFollow]);

  if (!signedIn) {
    const back = `${pathname}?suivre=1`;

    return (
      <div className={cn('flex shrink-0 flex-col items-end gap-1', className)}>
        <Link
          href={`/connexion?suite=${encodeURIComponent(back)}`}
          className={cn(buttonVariants({ variant: 'ink', size: 'compact' }), 'text-white')}
          aria-label={`Suivre ${organizationName}`}
        >
          <BellPlus className="size-4" aria-hidden />
          Suivre
        </Link>
        {countLabel && followersCount !== undefined ? (
          <span className="text-micro text-text-3">{countLabel}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('flex shrink-0 flex-col items-end gap-1', className)}>
      <Button
        type="button"
        variant={following ? 'secondary' : 'ink'}
        size="compact"
        loading={pending}
        loadingLabel={following ? 'Un instant…' : 'Abonnement…'}
        aria-pressed={following}
        aria-label={following ? `Ne plus suivre ${organizationName}` : `Suivre ${organizationName}`}
        onClick={() => void update(!following)}
      >
        {following ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <BellPlus className="size-4" aria-hidden />
        )}
        {following ? 'Suivi' : 'Suivre'}
      </Button>
      {countLabel && followersCount !== undefined ? (
        <span className="text-micro text-text-3">{countLabel}</span>
      ) : null}
      {error ? (
        <span role="alert" className="text-micro font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}
