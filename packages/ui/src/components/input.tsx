'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Champs de formulaire.
 *
 * Valeurs du prototype : hauteur minimale 44 px (48 px en mobile), bordure
 * 1 px `border-field`, rayon 10 px, fond blanc, texte 14 px.
 * Focus : bordure encre + anneau `rgba(18,16,43,.10)` sur 3 px.
 *
 * L'état d'erreur ne se contente pas de colorer : le message d'aide est orienté
 * conséquence (« c'est là que le billet sera envoyé en secours »), jamais
 * purement technique.
 */

const fieldBase = cn(
  'w-full rounded-field border bg-surface px-[13px] py-[11px] text-[14px]',
  'min-h-[var(--tap-min)] md:min-h-[var(--tap-min)]',
  'placeholder:text-text-3',
  'transition-[border-color,box-shadow] duration-(--duration-hover)',
  'focus:border-text-strong focus:shadow-[var(--focus-ring)] focus:outline-none',
  'disabled:bg-fill-neutral disabled:text-text-disabled',
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        invalid ? 'border-red bg-red-tint' : 'border-border-field',
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'min-h-24 resize-y leading-relaxed',
        invalid ? 'border-red bg-red-tint' : 'border-border-field',
        className,
      )}
      {...props}
    />
  );
});

export interface FieldProps {
  label: React.ReactNode;
  /** Complément de libellé en gris : « · facultatif », « · format invalide ». */
  hint?: React.ReactNode;
  /** Message d'erreur. Doit dire la conséquence, pas seulement la règle. */
  error?: string;
  /** Aide sous le champ, affichée seulement en l'absence d'erreur. */
  help?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/** Enveloppe libellé + champ + message, avec les liaisons ARIA correctes. */
export function Field({ label, hint, error, help, htmlFor, className, children }: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : help ? `${htmlFor}-help` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-body-s font-semibold">
        {label}
        {hint ? <span className="font-medium text-text-3"> {hint}</span> : null}
        {error ? <span className="font-medium text-red-700"> · {error}</span> : null}
      </label>

      <div aria-describedby={describedBy}>{children}</div>

      {error ? (
        <span id={`${htmlFor}-error`} className="text-[12px] text-red-700">
          {error}
        </span>
      ) : help ? (
        <span id={`${htmlFor}-help`} className="text-micro text-text-3">
          {help}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Champ encadré par un préfixe ou un suffixe sur fond papier :
 * l'indicatif « 🇧🇯 +229 » à gauche, le suffixe « FCFA » à droite.
 */
export interface AffixFieldProps
  // `prefix` est réécrit : l'attribut HTML natif n'accepte qu'une chaîne.
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  invalid?: boolean;
  containerClassName?: string;
}

export const AffixField = React.forwardRef<HTMLInputElement, AffixFieldProps>(function AffixField(
  { prefix, suffix, invalid = false, className, containerClassName, ...props },
  ref,
) {
  return (
    <span
      className={cn(
        'flex min-h-[var(--tap-min)] items-stretch overflow-hidden rounded-field border bg-surface',
        'focus-within:border-text-strong focus-within:shadow-[var(--focus-ring)]',
        invalid ? 'border-red bg-red-tint' : 'border-border-field',
        containerClassName,
      )}
    >
      {prefix ? (
        <span className="flex items-center gap-1.5 border-r border-border bg-paper px-3 text-body font-semibold">
          {prefix}
        </span>
      ) : null}

      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'min-w-0 flex-1 border-0 bg-transparent px-3 py-[11px] text-[14px] outline-none placeholder:text-text-3',
          className,
        )}
        {...props}
      />

      {suffix ? (
        <span className="flex items-center border-l border-border bg-paper px-3 text-body-s font-semibold text-text-2">
          {suffix}
        </span>
      ) : null}
    </span>
  );
});
