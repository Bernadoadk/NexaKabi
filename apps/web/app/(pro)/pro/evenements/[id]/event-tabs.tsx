'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@nexakabi/ui';

/**
 * Onglets d'un événement, côté organisateur.
 *
 * ── Pourquoi ce composant existe ───────────────────────────────────────────
 * Les écrans O6 (participants), O7 (contrôle) et O9 (statistiques) étaient
 * construits et fonctionnels, mais AUCUN lien ne menait à eux : on ne pouvait
 * les atteindre qu'en tapant l'URL. Un écran inatteignable équivaut à un écran
 * absent, quelle que soit la qualité de ce qu'il affiche.
 *
 * ── Pourquoi les onglets n'apparaissent qu'après publication ───────────────
 * Un brouillon n'a ni participant, ni recette, ni entrée. Montrer trois onglets
 * qui mèneront tous à un état vide pendant la préparation détourne de la seule
 * chose qui compte alors : finir l'événement et le publier.
 */
export function EventTabs({ eventId, published }: { eventId: string; published: boolean }) {
  const pathname = usePathname();

  const base = `/pro/evenements/${eventId}`;

  // « Aperçu » est là dès le brouillon : c'est précisément avant de publier
  // qu'on a besoin de voir la page. Les trois autres n'ont de sens qu'en
  // ligne — voir l'en-tête du fichier.
  const entries = [
    { href: base, label: 'Configuration', exact: true },
    { href: `${base}/apercu`, label: 'Aperçu', exact: false },
    ...(published
      ? [
          { href: `${base}/participants`, label: 'Participants', exact: false },
          { href: `${base}/check-in`, label: 'Contrôle', exact: false },
          { href: `${base}/statistiques`, label: 'Statistiques', exact: false },
        ]
      : []),
  ];

  return (
    <nav aria-label="Sections de l’événement" className="-mx-4 border-b border-border px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((entry) => {
          const active = entry.exact ? pathname === entry.href : pathname.startsWith(entry.href);

          return (
            <li key={entry.href}>
              <Link
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[var(--tap-min)] items-center whitespace-nowrap border-b-2 px-3 text-body-s transition',
                  active
                    ? 'border-coral font-bold text-text-strong'
                    : 'border-transparent font-semibold text-text-2 hover:text-text-strong',
                )}
              >
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
