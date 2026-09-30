import React from 'react';
import { cn } from '../../lib/layout';
import { Money } from './Money';

/** Copie de `packages/ui/src/components/stat.tsx`. */
export const Stat: React.FC<{
  label: React.ReactNode;
  value?: React.ReactNode;
  amount?: number;
  hint?: React.ReactNode;
  tone?: 'default' | 'ink' | 'warning' | 'success';
  className?: string;
  style?: React.CSSProperties;
}> = ({ label, value, amount, hint, tone = 'default', className, style }) => {
  const isInk = tone === 'ink';

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-[16px] p-[18px]',
        isInk ? 'bg-ink text-white' : 'border border-border bg-surface',
        className,
      )}
      style={style}
    >
      <div
        className={cn(
          'text-[10.5px] font-bold uppercase tracking-[0.12em]',
          isInk ? 'text-coral-300' : 'text-text-3',
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'tabular font-display text-[24px] font-bold whitespace-nowrap',
          tone === 'warning' && 'text-amber-600',
          tone === 'success' && 'text-mint-700',
        )}
      >
        {amount !== undefined ? <Money amount={amount} size="medium" hideSymbol /> : value}
      </div>
      {hint ? (
        <div className={cn('text-[11px]', isInk ? 'text-on-ink-2' : 'text-text-2')}>{hint}</div>
      ) : null}
    </div>
  );
};
