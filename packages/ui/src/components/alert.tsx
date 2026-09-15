import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, MoreHorizontal, TriangleAlert, X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Message de retour.
 *
 * Règle du prototype : un message d'erreur est TOUJOURS suivi d'une action
 * (« Modifier le numéro → »). Un bandeau rouge sans issue n'est pas livrable.
 */
const alertVariants = cva('flex items-start gap-3 rounded-[12px] px-[15px] py-[13px]', {
  variants: {
    tone: {
      /** Succès : fond encre, coche menthe. */
      success: 'bg-ink text-white',
      warning: 'border border-amber-200 bg-amber-50 text-amber-700',
      danger: 'border border-red-200 bg-red-50 text-red-700',
      info: 'border border-blue-200 bg-blue-50 text-blue-700',
      neutral: 'border border-border bg-surface text-text-2',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

type AlertTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_ICONS: Record<AlertTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  info: Info,
  neutral: MoreHorizontal,
};

export interface AlertProps
  // `title` est réécrit : l'attribut HTML natif n'accepte qu'une chaîne.
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>, VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  /** Action de sortie. Obligatoire en pratique sur une alerte `danger`. */
  action?: React.ReactNode;
  onDismiss?: () => void;
  icon?: React.ReactNode;
}

export function Alert({
  className,
  tone = 'neutral',
  title,
  action,
  onDismiss,
  icon,
  children,
  ...props
}: AlertProps) {
  const isSuccess = tone === 'success';
  const ToneIcon = TONE_ICONS[tone ?? 'neutral'];

  return (
    <div role="status" className={cn(alertVariants({ tone }), className)} {...props}>
      <span aria-hidden="true" className={cn('shrink-0', isSuccess && 'text-mint-300')}>
        {icon ?? <ToneIcon className="size-[15px]" />}
      </span>

      <div className="flex-1">
        {title ? (
          <div className={cn('text-body font-semibold', isSuccess && 'text-white')}>{title}</div>
        ) : null}
        {children ? (
          <div className={cn('text-[12px] leading-relaxed', isSuccess && 'text-on-ink-2')}>
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-1.5">{action}</div> : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer"
          className={cn('shrink-0 cursor-pointer', isSuccess ? 'text-on-ink-3' : 'text-text-3')}
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export { alertVariants };
