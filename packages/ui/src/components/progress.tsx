'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Les attentes.
 *
 * ── La règle du prototype, et pourquoi elle tient toujours ────────────────
 * « Le squelette reprend exactement la géométrie finale. Jamais de spinner
 * plein écran sur une liste. » Elle vaut pour le CONTENU : quand on sait à
 * quoi ressemblera ce qui arrive, on le dessine en gris, et rien ne saute.
 *
 * Mais tout n'est pas du contenu. Trois attentes n'ont aucune géométrie à
 * annoncer, et c'est précisément pour celles-là que ce fichier existe :
 *
 *   — la NAVIGATION : entre le clic et la page, il ne se passe rien à
 *     l'écran, et sur une connexion béninoise ce rien dure parfois deux
 *     secondes. L'utilisateur reclique. Un filet en haut de l'écran suffit à
 *     dire « c'est parti » ;
 *   — l'ENVOI d'un fichier : une barre de 0 à 100 % qu'on peut regarder, pas
 *     un point qui tourne sans fin. Sur un forfait qui se compte en mégaoctets,
 *     savoir où on en est change tout ;
 *   — l'ACTION en cours : le bouton se met déjà en attente tout seul, mais la
 *     zone autour de lui doit cesser d'accepter les clics.
 *
 * ── Aucune animation nouvelle ─────────────────────────────────────────────
 * Le système n'en autorise que trois (`nk-pulse`, `nk-spin`, `nk-scan`). Tout
 * ce qui bouge ici est une TRANSITION de largeur ou de tracé, pilotée par une
 * valeur — donc rien à ajouter aux jetons, et rien qui tourne dans le vide
 * pendant que l'utilisateur attend sans repère.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Spinner
// ─────────────────────────────────────────────────────────────────────────────

export type SpinnerTone = 'ink' | 'coral' | 'muted' | 'on-ink';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Diamètre en pixels. 13 dans un bouton, 18 en ligne, 32 et plus au centre d'une zone. */
  size?: number;
  tone?: SpinnerTone;
  /** Texte lu par un lecteur d'écran. Vide, le spinner reste décoratif. */
  label?: string;
}

const SPINNER_TONES: Record<SpinnerTone, string> = {
  ink: 'border-text-strong/25 border-t-text-strong',
  coral: 'border-coral-200 border-t-coral',
  muted: 'border-border border-t-text-3',
  'on-ink': 'border-white/25 border-t-white',
};

export function Spinner({ size = 18, tone = 'ink', label, className, ...props }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      className={cn(
        'inline-block shrink-0 rounded-full border-2 animate-nk-spin',
        SPINNER_TONES[tone],
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Anneau de progression
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgressRingProps {
  /** Progression de 0 à 1. `undefined` : on ne sait pas encore, l'anneau tourne. */
  value?: number;
  size?: number;
  thickness?: number;
  /** Ce qui s'affiche au centre : l'icône d'envoi, un pourcentage, une coche. */
  children?: React.ReactNode;
  tone?: 'coral' | 'ink';
  className?: string;
  label?: string;
}

/**
 * Anneau de progression, avec son icône au centre.
 *
 * ── Pourquoi autour de l'icône, et pas ailleurs ─────────────────────────
 * Parce que l'icône d'envoi est exactement l'endroit que l'utilisateur
 * regardait au moment où il a cliqué. Une barre posée plus bas dans le
 * formulaire l'oblige à chercher ce qu'il vient de déclencher ; l'anneau
 * répond là où la question a été posée.
 */
export function ProgressRing({
  value,
  size = 44,
  thickness = 3,
  children,
  tone = 'coral',
  className,
  label,
}: ProgressRingProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value === undefined ? undefined : Math.min(1, Math.max(0, value));
  const stroke = tone === 'coral' ? 'var(--color-coral)' : 'var(--color-text-strong)';

  return (
    <span
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label && clamped !== undefined ? 100 : undefined}
      aria-valuenow={label && clamped !== undefined ? Math.round(clamped * 100) : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        // Départ à midi : un cercle qui commence à trois heures se lit comme
        // une horloge cassée.
        className={cn('-rotate-90', clamped === undefined && 'animate-nk-spin')}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-fill-muted)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          // Indéterminé : un quart de tour qui tourne. Déterminé : la part faite.
          strokeDashoffset={circumference * (clamped === undefined ? 0.75 : 1 - clamped)}
          style={{ transition: 'stroke-dashoffset 220ms linear' }}
        />
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      ) : null}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filet de chargement, en haut de l'écran
// ─────────────────────────────────────────────────────────────────────────────

export interface TopProgressBarProps {
  active: boolean;
  className?: string;
}

/**
 * Le filet qui court en haut pendant une navigation.
 *
 * ── Pourquoi il n'atteint jamais 100 % tout seul ────────────────────────
 * Parce qu'on ne sait pas combien de temps la page va mettre. Une barre qui
 * arriverait au bout avant que la page n'apparaisse ment, et on ne la croit
 * plus jamais. Celle-ci progresse de moins en moins vite, s'arrête aux
 * quatre-vingt-dix pour cent, et ne franchit la fin qu'au moment où la page
 * est là. Elle promet « ça avance », jamais « c'est presque fini ».
 */
export function TopProgressBar({ active, className }: TopProgressBarProps) {
  const [value, setValue] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      if (!visible) return;

      // Terminer, puis disparaître : un filet qui s'évanouit à mi-course
      // laisse penser que la navigation a échoué.
      setValue(1);
      const timer = window.setTimeout(() => {
        setVisible(false);
        setValue(0);
      }, 280);

      return () => window.clearTimeout(timer);
    }

    setVisible(true);
    setValue(0.08);

    const timer = window.setInterval(() => {
      setValue((current) => {
        if (current >= 0.9) return current;
        // Le pas se réduit à mesure qu'on avance : rapide au début, où la
        // plupart des navigations se terminent, lent ensuite.
        return current + (0.9 - current) * 0.12;
      });
    }, 220);

    return () => window.clearInterval(timer);
  }, [active, visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]', className)}
    >
      <div
        className="h-full rounded-r-full bg-coral shadow-[0_0_10px_var(--color-coral)]"
        style={{
          width: `${value * 100}%`,
          opacity: value >= 1 ? 0 : 1,
          transition: 'width 220ms ease-out, opacity 280ms ease-out',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Voile d'action
// ─────────────────────────────────────────────────────────────────────────────

export interface BusyOverlayProps {
  busy: boolean;
  /** Ce qui est en train de se faire : « Publication… », « Suppression… ». */
  label?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Voile posé sur une zone pendant qu'une action s'y exécute.
 *
 * ── Ce qu'il empêche, concrètement ──────────────────────────────────────
 * Le double clic. Un bouton en attente ne se reclique pas, mais rien
 * n'empêchait de cliquer le bouton D'À CÔTÉ — supprimer pendant que la
 * publication part. Le voile coupe la zone entière, et dit laquelle.
 *
 * ── Pourquoi `inert` et pas seulement `pointer-events-none` ─────────────
 * Parce que `pointer-events-none` n'arrête que la souris et le doigt. Au
 * clavier, la tabulation continue d'atteindre les boutons grisés, et `Entrée`
 * les déclenche — c'est-à-dire exactement le double envoi qu'on prétend
 * empêcher, pour la personne qui n'a précisément pas d'autre moyen de
 * naviguer. `inert` retire toute la zone du parcours de tabulation et de
 * l'arbre d'accessibilité tant que l'action dure.
 */
export function BusyOverlay({ busy, label, children, className }: BusyOverlayProps) {
  return (
    <div className={cn('relative', className)} aria-busy={busy || undefined}>
      <div
        inert={busy || undefined}
        className={cn(busy && 'pointer-events-none select-none opacity-45 transition-opacity')}
      >
        {children}
      </div>

      {busy ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-2.5 rounded-field border border-border bg-surface px-3.5 py-2.5 shadow-lg">
            <Spinner size={16} tone="coral" />
            <span className="text-body-s font-semibold text-text-strong">
              {label ?? 'Traitement…'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Attente centrée
// ─────────────────────────────────────────────────────────────────────────────

export interface LoadingPanelProps {
  title?: string;
  description?: React.ReactNode;
  className?: string;
}

/**
 * Attente au centre d'une zone dont on ne connaît pas la géométrie finale.
 *
 * À n'employer QUE là : une liste, une carte, un tableau ont une forme connue
 * d'avance et méritent un squelette, pas un point qui tourne.
 */
export function LoadingPanel({ title = 'Chargement…', description, className }: LoadingPanelProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12', className)}
    >
      <Spinner size={34} tone="coral" />
      <p className="text-body font-semibold text-text-strong">{title}</p>
      {description ? (
        <p className="max-w-[300px] text-center text-body-s text-text-2">{description}</p>
      ) : null}
    </div>
  );
}
