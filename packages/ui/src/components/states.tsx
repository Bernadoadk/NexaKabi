import * as React from 'react';
import { AlertTriangle, Check, WifiOff } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';

/**
 * États d'écran.
 *
 * Règle du prototype : « Un écran n'est livré que lorsque ses cinq états sont
 * dessinés » — vide, chargement, erreur, succès, hors ligne.
 *
 * Deux principes non négociables appliqués ici :
 *   — un état vide qui ne propose aucune sortie est un cul-de-sac : on offre
 *     toujours au moins une action, deux pour un résultat de recherche ;
 *   — une erreur donne toujours la cause probable et une action, jamais un
 *     code brut seul.
 */

// ─────────────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Icône (composant `lucide-react`, ex. `<Ticket size={26} />`), posée sur une pastille corail 50. */
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Lien secondaire : « Voir un exemple d'événement ». */
  secondaryAction?: React.ReactNode;
  className?: string;
}

/** État vide initial : centré, avec une action principale. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-9 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="flex size-[62px] items-center justify-center rounded-panel bg-coral-50 text-coral">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-[19px] font-bold">{title}</h3>
      {description ? <p className="max-w-[260px] text-body text-text-2">{description}</p> : null}
      {action}
      {secondaryAction}
    </div>
  );
}

export interface SearchEmptyStateProps {
  title: string;
  /** Relances proposées. Au moins deux : un état vide sans sortie est un échec. */
  suggestions: Array<{ label: React.ReactNode; onClick?: () => void; icon?: React.ReactNode }>;
  className?: string;
}

/** État vide d'un résultat de recherche : aligné à gauche, avec des relances. */
export function SearchEmptyState({ title, suggestions, className }: SearchEmptyStateProps) {
  return (
    <div className={cn('flex flex-col gap-3 px-6 py-7', className)}>
      <h3 className="font-display text-[18px] font-bold">{title}</h3>
      <p className="text-body text-text-2">
        Mais on peut élargir la recherche sans repartir de zéro :
      </p>
      <div className="flex flex-col gap-2">
        {suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="secondary"
            size="mobile"
            onClick={suggestion.onClick}
            className="justify-start bg-paper text-left font-semibold"
          >
            {suggestion.icon}
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Cause probable et référence d'incident.
   * Le prototype impose de toujours donner la cause, jamais un code seul.
   */
  cause?: React.ReactNode;
  className?: string;
}

export function ErrorState({ title, description, actions, cause, className }: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col gap-3 p-6', className)}>
      <div className="flex size-[50px] items-center justify-center rounded-[15px] bg-red-50 text-red-700">
        <AlertTriangle className="size-[22px]" />
      </div>
      <h3 className="font-display text-[19px] font-bold leading-tight">{title}</h3>
      <div className="text-body text-text-2">{description}</div>
      {actions ? <div className="flex flex-col gap-2">{actions}</div> : null}
      {cause ? (
        <p className="mt-auto border-t border-border-subtle pt-2.5 text-micro text-text-3">
          {cause}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface OfflineBannerProps {
  title?: string;
  description: React.ReactNode;
  className?: string;
}

/**
 * Bandeau hors ligne — NON bloquant, par conception.
 *
 * « Le hors-ligne n'affiche jamais une page pleine "pas de connexion" : on
 * dégrade la fonctionnalité, on ne coupe pas l'accès. »
 */
export function OfflineBanner({
  title = 'Ta connexion semble instable',
  description,
  className,
}: OfflineBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-[14px] py-3',
        className,
      )}
    >
      <span aria-hidden="true" className="text-amber-600">
        <WifiOff className="size-[15px]" />
      </span>
      <div>
        <div className="text-[13px] font-bold text-amber-700">{title}</div>
        <div className="text-[12px] leading-relaxed text-amber-700">{description}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface LongWaitProps {
  title: string;
  description: React.ReactNode;
  /** Progression de 0 à 1. */
  progress?: number;
  /** Compte à rebours déjà formaté : « 2 min 04 ». */
  countdown?: string;
  reassurance?: React.ReactNode;
  className?: string;
}

/**
 * Attente longue — écran de confirmation Mobile Money.
 *
 * Le paiement est asynchrone : l'utilisateur quitte l'écran pour valider sur son
 * téléphone. Cet état rassure, il n'annonce jamais un échec avant le webhook.
 */
export function LongWait({
  title,
  description,
  progress,
  countdown,
  reassurance,
  className,
}: LongWaitProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 p-6 text-center', className)}>
      <div
        aria-hidden="true"
        className="size-[88px] rounded-full border-4 border-coral-50 border-t-coral animate-nk-spin"
      />
      <h3 className="font-display text-[27px] font-bold leading-tight tracking-[-0.025em]">
        {title}
      </h3>
      <div className="max-w-[420px] text-[14.5px] leading-relaxed text-text-strong">
        {description}
      </div>

      {progress !== undefined ? (
        <div
          className="h-2 w-full max-w-[400px] overflow-hidden rounded-[5px] bg-fill-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full rounded-[5px] bg-coral transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      ) : null}

      {countdown ? (
        <p className="tabular text-micro text-text-3">Temps restant : {countdown}</p>
      ) : null}

      {reassurance}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SuccessStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  details?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** État de succès : fond encre, pastille menthe, référence en tabulaire. */
export function SuccessState({
  title,
  description,
  details,
  actions,
  className,
}: SuccessStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-block bg-ink px-6 py-9 text-center text-white',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-mint text-mint-950"
      >
        <Check className="size-8" strokeWidth={3} />
      </div>
      <h3 className="font-display text-[21px] font-bold leading-tight">{title}</h3>
      {description ? <div className="text-body text-on-ink-2">{description}</div> : null}
      {details}
      {actions ? <div className="flex w-full flex-col gap-2">{actions}</div> : null}
    </div>
  );
}
