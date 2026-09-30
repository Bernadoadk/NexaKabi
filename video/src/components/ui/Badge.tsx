import React from 'react';
import { cn } from '../../lib/layout';

/** Copie de `packages/ui/src/components/badge.tsx` : mêmes tons, même format. */
const TONES = {
  success: 'bg-mint-50 text-mint-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  neutral: 'bg-fill-neutral text-text-neutral',
  ink: 'bg-ink text-white',
  accent: 'bg-coral-50 text-coral-700',
  verified: 'bg-ink text-mint-300',
  overlay: 'bg-white/92 text-ink',
  'overlay-accent': 'bg-coral text-ink',
  'success-ink': 'bg-mint text-ink',
  'warning-ink': 'bg-amber-400 text-ink',
  'neutral-ink': 'bg-white/12 text-white/70',
} as const;

export type BadgeTone = keyof typeof TONES;

export const Badge: React.FC<{
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ tone = 'neutral', dot = false, className, style, children }) => (
  <span
    className={cn(
      'inline-flex items-center gap-[5px] rounded-chip px-[10px] py-[5px] text-micro font-bold whitespace-nowrap',
      TONES[tone],
      className,
    )}
    style={style}
  >
    {dot ? <span className="size-[6px] rounded-full bg-current" /> : null}
    {children}
  </span>
);
