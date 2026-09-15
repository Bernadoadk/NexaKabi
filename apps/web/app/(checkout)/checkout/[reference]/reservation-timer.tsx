'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@nexakabi/ui';
import { formatShortCountdown } from '@nexakabi/utils';

/**
 * Compte à rebours de la réservation.
 *
 * Les places sont bloquées 30 minutes. Le dire explicitement fait deux choses :
 * cela crée l'urgence utile, et cela évite la surprise d'un panier qui se vide
 * en silence. Sous cinq minutes, l'indication passe en ambre.
 *
 * À l'échéance, la page est rechargée : le serveur affiche alors l'état réel
 * de la commande — expirée, ou payée entre-temps.
 *
 * Le temps restant n'est calculé QU'APRÈS le montage. Le rendu serveur et le
 * rendu client ne se produisent pas au même instant : calculer dès le premier
 * rendu produirait deux textes différents et casserait l'hydratation.
 */
export function ReservationTimer({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const target = React.useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remaining, setRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    setRemaining(target - Date.now());

    const timer = window.setInterval(() => {
      const next = target - Date.now();
      setRemaining(next);

      if (next <= 0) {
        window.clearInterval(timer);
        router.refresh();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [target, router]);

  const urgent = remaining !== null && remaining <= 5 * 60 * 1000;

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-micro',
        urgent ? 'font-semibold text-amber-700' : 'text-text-3',
      )}
      // Une annonce par minute suffit : une lecture par seconde rendrait un
      // lecteur d'écran inutilisable.
      aria-live="off"
    >
      <span aria-hidden>⏱</span>
      {remaining === null ? (
        'Places réservées'
      ) : (
        <>Places réservées encore {formatShortCountdown(remaining)}</>
      )}
    </p>
  );
}
