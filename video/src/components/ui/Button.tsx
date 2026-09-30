import React from 'react';
import { cn } from '../../lib/layout';
import { useTime } from '../../lib/time';

/**
 * Copie de `packages/ui/src/components/button.tsx`.
 * Règle de l'application : le corail porte un texte ENCRE, jamais blanc.
 */
const VARIANTS = {
  primary: 'bg-coral text-ink font-bold',
  ink: 'bg-ink text-white font-bold',
  secondary: 'bg-surface text-text-strong font-semibold border border-border-field',
  tertiary: 'bg-transparent text-text-2 font-semibold',
  'on-ink': 'bg-white/10 text-white font-semibold',
} as const;

const SIZES = {
  default: 'min-h-[44px] px-[18px] py-[11px] text-body',
  mobile: 'min-h-[48px] px-4 py-3 text-body',
  primary: 'min-h-[52px] px-[26px] py-[14px] text-[15px]',
  compact: 'min-h-[44px] px-[14px] py-[9px] text-body-s',
  icon: 'size-[44px] p-0 text-[15px]',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export const Button: React.FC<{
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  block?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** 0 → 1 : enfoncement du bouton au moment du clic. */
  press?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({
  variant = 'secondary',
  size = 'default',
  block = false,
  disabled = false,
  loading = false,
  loadingLabel = 'Traitement…',
  press = 0,
  className,
  style,
  children,
}) => {
  const look = loading
    ? 'bg-coral-200 text-ink font-bold'
    : disabled
      ? cn(
          'bg-fill-muted text-text-disabled',
          variant === 'primary' || variant === 'ink' ? 'font-bold' : 'font-semibold',
        )
      : VARIANTS[variant];

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-button font-sans whitespace-nowrap',
        look,
        SIZES[size],
        block && 'w-full',
        className,
      )}
      style={{ transform: press ? `scale(${1 - press * 0.045})` : undefined, ...style }}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </div>
  );
};

export const Spinner: React.FC<{ className?: string }> = ({ className }) => {
  const time = useTime();
  return (
    <span
      className={cn(
        'inline-block size-[13px] shrink-0 rounded-full border-2 border-ink/30 border-t-ink',
        className,
      )}
      style={{ transform: `rotate(${time * 14}deg)` }}
    />
  );
};
