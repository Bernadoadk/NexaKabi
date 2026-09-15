import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@nexakabi/ui';

/**
 * Progression du tunnel.
 *
 * Trois étapes affichées, jamais quatre : le paiement et sa confirmation sont
 * la même étape aux yeux de l'acheteur. Une étape franchie reste cliquable —
 * revenir corriger un chiffre du numéro ne doit pas obliger à tout recommencer.
 */

export const CHECKOUT_STEPS = [
  { key: 'billets', label: 'Billets' },
  { key: 'recapitulatif', label: 'Récapitulatif' },
  { key: 'paiement', label: 'Paiement' },
] as const;

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]['key'];

export function CheckoutStepper({
  reference,
  current,
}: {
  reference: string;
  current: CheckoutStep;
}) {
  const currentIndex = CHECKOUT_STEPS.findIndex((step) => step.key === current);

  return (
    <nav aria-label="Progression de la commande" className="mb-6">
      <ol className="flex items-center gap-2">
        {CHECKOUT_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;

          const content = (
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold',
                  done && 'bg-mint text-ink',
                  active && 'bg-ink text-white',
                  !done && !active && 'bg-fill-neutral text-text-3',
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-body-s',
                  active ? 'font-bold text-text' : 'text-text-2',
                  'hidden sm:inline',
                )}
              >
                {step.label}
              </span>
            </span>
          );

          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              {done ? (
                <Link
                  href={`/checkout/${reference}/${step.key}`}
                  className="rounded-field transition hover:opacity-70"
                  aria-label={`Revenir à l’étape ${step.label}`}
                >
                  {content}
                </Link>
              ) : (
                <span aria-current={active ? 'step' : undefined}>{content}</span>
              )}

              {index < CHECKOUT_STEPS.length - 1 ? (
                <span className={cn('h-px flex-1', done ? 'bg-mint' : 'bg-border')} aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
