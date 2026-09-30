import { cn } from '../lib/cn';

/**
 * Barres horizontales — courbe de tendance simple.
 *
 * Extrait du motif déjà codé à la main dans l'écran de statistiques d'un
 * événement (une barre dont la largeur est le pourcentage du pic) : ce
 * n'était pas un composant, c'était recopié. Pas de librairie de graphiques :
 * pour trois à trente points par jour, une barre se lit aussi bien qu'une
 * courbe, et le design system n'a pas besoin d'un nouveau poids de dépendance
 * pour ça.
 *
 * Chaque barre porte un `role="img"` et un libellé : la valeur reste lisible
 * sans dépendre de la couleur ou de la longueur.
 */
export interface SimpleBarChartPoint {
  /** Court : une date, un nom de catégorie. */
  label: string;
  value: number;
  /** Colonne de droite, ex. un montant déjà formaté. */
  secondaryValue?: React.ReactNode;
  /** Libellé d'accessibilité de la barre. Par défaut, `${value}`. */
  valueLabel?: string;
}

export interface SimpleBarChartProps {
  points: readonly SimpleBarChartPoint[];
  barClassName?: string;
  className?: string;
}

export function SimpleBarChart({ points, barClassName, className }: SimpleBarChartProps) {
  const peak = Math.max(1, ...points.map((point) => point.value));

  return (
    <ul className={cn('flex flex-col', className)}>
      {/* Les quatre colonnes sont à largeur fixe sauf la barre : additionnées,
          les valeurs du bureau ne laissaient plus rien à la barre sur un
          téléphone, et la ligne finissait par déborder de l'écran. */}
      {points.map((point, index) => (
        <li
          key={`${point.label}-${index}`}
          className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-2.5 last:border-b-0 sm:gap-3 sm:px-5"
        >
          <span className="w-14 shrink-0 text-micro text-text-3 sm:w-20">{point.label}</span>

          <div
            className="h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-fill-neutral"
            role="img"
            aria-label={point.valueLabel ?? String(point.value)}
          >
            <div
              className={cn('h-full rounded-full bg-ink', barClassName)}
              style={{ width: `${Math.round((point.value / peak) * 100)}%` }}
            />
          </div>

          <span className="tabular w-8 shrink-0 text-right text-body-s font-semibold sm:w-10">
            {point.value}
          </span>

          {point.secondaryValue !== undefined ? (
            <span className="w-[84px] shrink-0 text-right sm:w-28">{point.secondaryValue}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
