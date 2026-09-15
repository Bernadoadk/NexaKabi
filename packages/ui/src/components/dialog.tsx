'use client';

import * as React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Modale de confirmation.
 *
 * `@radix-ui/react-dialog` était déjà une dépendance déclarée du design
 * system — jamais importée nulle part. La seule vraie boîte de dialogue du
 * produit était construite à la main dans le tunnel d'achat
 * (`buy-panel.tsx`) ; celle-ci lui donne un équivalent réutilisable, pour les
 * confirmations d'action (annuler un événement, par exemple) plutôt qu'une
 * feuille de sélection.
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2',
            'rounded-panel bg-surface p-6 shadow-lg focus:outline-none',
            className,
          )}
        >
          <RadixDialog.Title className="pr-6 font-display text-h3 font-bold">
            {title}
          </RadixDialog.Title>

          {description ? (
            <RadixDialog.Description className="mt-1.5 text-body-s text-text-2">
              {description}
            </RadixDialog.Description>
          ) : null}

          <div className="mt-4 flex flex-col gap-4">{children}</div>

          <RadixDialog.Close
            aria-label="Fermer"
            className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-text-3 transition hover:bg-surface-alt hover:text-text"
          >
            <X className="size-4" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Bouton principal — la suite logique, ex. « Voir mes événements → ». */
  children?: React.ReactNode;
}

/**
 * Confirmation de succès — la même `Dialog`, avec le rond menthe repris de
 * `SuccessState` en plus.
 *
 * ── Pourquoi une apparition et pas un état figé ─────────────────────────────
 * Radix monte le contenu déjà pleinement visible ; le rond démarre donc réduit
 * et transparent, puis bascule à sa taille une frame plus tard — c'est une
 * TRANSITION locale déclenchée une fois, pas une des trois animations en
 * boucle du prototype (`nk-pulse`/`nk-spin`/`nk-scan`), qui elle restent leur
 * seul territoire. `prefers-reduced-motion` l'annule comme les trois autres,
 * via la même règle globale.
 */
export function SuccessDialog({ open, onOpenChange, title, description, children }: SuccessDialogProps) {
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }

    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          aria-hidden="true"
          className={cn(
            'flex size-16 items-center justify-center rounded-full bg-mint text-mint-950 transition-all duration-300 ease-out',
            entered ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )}
        >
          <Check className="size-8" strokeWidth={3} />
        </div>
        {description ? <p className="text-body text-text-2">{description}</p> : null}
      </div>

      {children}
    </Dialog>
  );
}
