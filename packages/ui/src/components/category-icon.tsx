import * as React from 'react';
import {
  Baby,
  Briefcase,
  CalendarDays,
  Church,
  Cpu,
  Disc3,
  Drama,
  GraduationCap,
  Handshake,
  Music,
  PartyPopper,
  Presentation,
  School,
  Shirt,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Icône d'une catégorie d'événement.
 *
 * ── Pourquoi une table fermée, par slug ─────────────────────────────────────
 * Les catégories viennent du référentiel (`prisma/seed.ts`, cahier des charges
 * §6) et ne se créent pas depuis un écran : leur liste est stable, et leur
 * slug est la clé la plus sûre — un nom se retraduit, un slug non. Une
 * catégorie ajoutée demain sans icône retombe sur le calendrier, jamais sur un
 * rectangle vide.
 *
 * L'icône accompagne la couleur partout où la catégorie s'affiche — épingle
 * de carte, carte de liste, légende — pour qu'un statut ou une famille ne
 * repose jamais sur la couleur seule.
 */
const CATEGORY_ICONS: Readonly<Record<string, LucideIcon>> = {
  musique: Music,
  festivals: PartyPopper,
  soirees: Disc3,
  business: Briefcase,
  tech: Cpu,
  conferences: Presentation,
  formation: GraduationCap,
  sport: Trophy,
  culture: Drama,
  mode: Shirt,
  gastronomie: UtensilsCrossed,
  religion: Church,
  universitaire: School,
  networking: Handshake,
  famille: Baby,
};

export const DEFAULT_CATEGORY_ICON: LucideIcon = CalendarDays;

/** Composant d'icône pour un slug de catégorie, avec repli. */
export function categoryIcon(slug: string | null | undefined): LucideIcon {
  if (!slug) return DEFAULT_CATEGORY_ICON;
  return CATEGORY_ICONS[slug] ?? DEFAULT_CATEGORY_ICON;
}

export interface CategoryIconProps extends LucideProps {
  slug: string | null | undefined;
}

export function CategoryIcon({ slug, className, ...props }: CategoryIconProps) {
  const Icon = categoryIcon(slug);
  return <Icon aria-hidden className={cn('shrink-0', className)} {...props} />;
}

export interface CategoryMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  slug: string | null | undefined;
  /** Couleur de la catégorie (`colorToken`). */
  color?: string;
  size?: 'default' | 'large';
}

/**
 * Pastille colorée portant l'icône — la « plaque » de la catégorie, en petit.
 * Le blanc de l'icône contraste toujours : les couleurs du référentiel sont
 * toutes des teintes profondes.
 */
export function CategoryMark({
  slug,
  color,
  size = 'default',
  className,
  style,
  ...props
}: CategoryMarkProps) {
  const Icon = categoryIcon(slug);

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[10px] text-white',
        size === 'large' ? 'size-12 rounded-[12px]' : 'size-9',
        className,
      )}
      style={{ background: color ?? 'var(--color-ink-700)', ...style }}
      {...props}
    >
      <Icon className={size === 'large' ? 'size-[22px]' : 'size-[17px]'} strokeWidth={2.25} />
    </span>
  );
}
