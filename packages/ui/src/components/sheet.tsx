'use client';

import * as React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useEntered } from './drawer';

/**
 * Feuille basse — le « bottom sheet » du prototype.
 *
 * « Les filtres deviennent un bottom sheet manipulable au pouce, avec un
 * bouton de validation qui annonce le nombre de résultats — on ne filtre
 * jamais à l'aveugle. » Rayon 29 px (`--radius-sheet`), ombre portée vers le
 * haut (`--shadow-sheet`), poignée de préhension, et un pied fixe pour
 * l'action de validation : le contenu défile, le bouton non.
 *
 * Elle monte depuis le bas par transition, une frame après l'ouverture (voir
 * `useEntered`). À partir du palier `md`, la même feuille se centre comme une
 * modale classique : un bottom sheet n'a pas de sens sous une souris.
 */
export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Zone fixe en bas, typiquement le bouton « Voir les N résultats ». */
  footer?: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: BottomSheetProps) {
  const entered = useEntered(open);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-ink/50 transition-opacity duration-200',
            entered ? 'opacity-100' : 'opacity-0',
          )}
        />
        <RadixDialog.Content
          // Sans description, Radix réclame un `aria-describedby` explicite ;
          // avec, il pose lui-même le lien vers la sienne.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col bg-surface shadow-sheet focus:outline-none',
            'rounded-t-sheet transition-transform duration-250 ease-out',
            entered ? 'translate-y-0' : 'translate-y-full',
            'md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[520px] md:max-h-[80vh] md:rounded-panel md:shadow-lg',
            'md:-translate-x-1/2 md:transition-opacity',
            entered ? 'md:-translate-y-1/2 md:opacity-100' : 'md:-translate-y-1/2 md:opacity-0',
            className,
          )}
        >
          <div aria-hidden className="flex justify-center pt-2.5 md:hidden">
            <span className="h-1 w-10 rounded-full bg-border-strong" />
          </div>

          <div className="flex items-start gap-3 px-5 pt-3 pb-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <RadixDialog.Title className="font-display text-[19px] font-bold tracking-[-0.02em]">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-body-s text-text-2">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label="Fermer"
              className="-mr-2 flex size-[var(--tap-min)] shrink-0 items-center justify-center rounded-full text-text-2 transition hover:bg-surface-alt hover:text-text-strong"
            >
              <X className="size-5" />
            </RadixDialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

          {footer ? (
            <div className="border-t border-border bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+14px)] md:pb-4">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
