'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Saisie du code à 6 chiffres.
 *
 * Remplace le mot de passe dans tout le produit. Valeurs du prototype :
 * six cases de 56 px, bordure 1,5 px, case active en encre sur fond
 * `surface-alt`, chiffres tabulaires en 22 px.
 *
 * `autoComplete="one-time-code"` déclenche le collage automatique depuis le SMS
 * sur Android et iOS — le prototype en fait une exigence explicite.
 */
export interface OtpInputProps {
  length?: number;
  value: string;
  onValueChange: (value: string) => void;
  /** Appelé dès que les six chiffres sont saisis. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function OtpInput({
  length = 6,
  value,
  onValueChange,
  onComplete,
  disabled = false,
  invalid = false,
  autoFocus = false,
  className,
  'aria-label': ariaLabel = 'Code de vérification à 6 chiffres',
}: OtpInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);

  const digits = value.padEnd(length, ' ').slice(0, length).split('');
  const activeIndex = Math.min(value.length, length - 1);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.replace(/\D/g, '').slice(0, length);
    onValueChange(next);
    if (next.length === length) onComplete?.(next);
  }

  return (
    <div className={cn('relative', className)}>
      {/* Un seul champ réel, invisible : c'est lui qui reçoit le collage du SMS. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        maxLength={length}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
      />

      <div className="flex gap-2" aria-hidden="true">
        {digits.map((digit, index) => {
          const isActive = focused && index === activeIndex;
          const isFilled = digit.trim() !== '';

          return (
            <span
              key={index}
              className={cn(
                'flex h-14 flex-1 items-center justify-center rounded-button border-[1.5px]',
                'tabular text-[22px] font-bold transition-colors duration-(--duration-hover)',
                isActive && 'border-text-strong bg-surface-alt',
                !isActive && isFilled && 'border-border-field bg-surface',
                !isActive && !isFilled && 'border-border-field bg-surface',
                invalid && 'border-red bg-red-tint',
                disabled && 'bg-fill-neutral',
              )}
            >
              {digit.trim()}
            </span>
          );
        })}
      </div>
    </div>
  );
}
