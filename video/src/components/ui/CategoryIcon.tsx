import React from 'react';
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
import type { CategorySlug } from '../../config.types';
import { cn } from '../../lib/layout';

/** Même table que `packages/ui/src/components/category-icon.tsx`. */
const ICONS: Record<CategorySlug, LucideIcon> = {
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

export const categoryIcon = (slug: CategorySlug): LucideIcon => ICONS[slug] ?? CalendarDays;

export const CategoryIcon: React.FC<LucideProps & { slug: CategorySlug }> = ({
  slug,
  className,
  ...props
}) => {
  const Icon = categoryIcon(slug);
  return <Icon aria-hidden className={cn('shrink-0', className)} {...props} />;
};
