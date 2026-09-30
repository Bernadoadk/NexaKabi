import React from 'react';
import { Img, staticFile } from 'remotion';
import { AlertCircle, CheckCircle2, Info, MoreHorizontal, TriangleAlert } from 'lucide-react';
import { config } from '../../config';
import { initialsOf } from '../../lib/format';
import { cn } from '../../lib/layout';

/** Le monogramme de l'application (`public/logo.png`). */
export const BrandMark: React.FC<{
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 36, className, style }) => (
  <Img
    src={staticFile(config.brand.logo)}
    style={{ width: size, height: size, ...style }}
    className={cn('shrink-0 select-none', className)}
  />
);

/** Le nom de la marque, en Bricolage, comme dans les en-têtes de l'application. */
export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('font-display font-bold tracking-[-0.02em] whitespace-nowrap', className)}>
    {config.brand.name}
  </span>
);

/** Copie de `packages/ui/src/components/avatar.tsx` (initiales sur encre). */
export const Avatar: React.FC<{
  name: string;
  size?: 'compact' | 'default' | 'large';
  className?: string;
}> = ({ name, size = 'default', className }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-bold text-white',
      size === 'compact' && 'size-7 text-[11px]',
      size === 'default' && 'size-[34px] text-[12px]',
      size === 'large' && 'size-11 text-[15px]',
      className,
    )}
  >
    {initialsOf(name)}
  </span>
);

/** Copie de `packages/ui/src/components/payment-method-logo.tsx`. */
export const PaymentLogo: React.FC<{
  logo: 'mtn' | 'moov' | 'card';
  size?: 'default' | 'compact' | 'large' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}> = ({ logo, size = 'default', className, style }) => (
  <span
    className={cn(
      'relative flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/5',
      size === 'default' && 'size-10 rounded-[10px]',
      size === 'compact' && 'size-8 rounded-lg',
      size === 'large' && 'size-14 rounded-xl',
      size === 'xl' && 'size-[88px] rounded-[20px]',
      className,
    )}
    style={style}
  >
    <Img src={staticFile(`paiements/${logo}.svg`)} className="size-full object-cover" />
  </span>
);

const ALERT_TONES = {
  success: 'bg-ink text-white',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border border-red-200 bg-red-50 text-red-700',
  info: 'border border-blue-200 bg-blue-50 text-blue-700',
  neutral: 'border border-border bg-surface text-text-2',
} as const;

const ALERT_ICONS = {
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  info: Info,
  neutral: MoreHorizontal,
} as const;

/** Copie de `packages/ui/src/components/alert.tsx`. */
export const Alert: React.FC<{
  tone?: keyof typeof ALERT_TONES;
  title?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}> = ({ tone = 'neutral', title, className, children }) => {
  const Icon = ALERT_ICONS[tone];
  const isSuccess = tone === 'success';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[12px] px-[15px] py-[13px]',
        ALERT_TONES[tone],
        className,
      )}
    >
      <span className={cn('shrink-0', isSuccess && 'text-mint-300')}>
        <Icon className="size-[15px]" />
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
      </div>
    </div>
  );
};
