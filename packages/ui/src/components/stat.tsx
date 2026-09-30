import * as React from 'react';
import { cn } from '../lib/cn';
import { Money } from './money';
import { formatDateChip } from '@nexakabi/utils';

/**
 * Tuile de statistique des tableaux de bord.
 *
 * Valeurs du prototype : sur-titre 10,5 px majuscules en `text-3`, valeur en
 * Bricolage 24 px tabulaire, complément en 11 px.
 * La variante `ink` marque la tuile la plus importante d'une rangée — le solde
 * disponible, par exemple.
 *
 * ── Deux tailles, et pourquoi ───────────────────────────────────────────────
 * Les valeurs du prototype sont celles du bureau. Sur un téléphone, deux
 * tuiles doivent tenir côte à côte : 18 px de marge intérieure et 24 px de
 * chiffre n'y suffisent pas, la tuile s'étire sur toute la largeur et lire
 * quatre chiffres demande quatre écrans. Le format compact en dessous de `sm`
 * est donc la règle, pas un ajustement — l'espace organisateur l'avait déjà
 * recopié à la main écran par écran.
 */
export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  /** Valeur déjà formatée. Pour un montant, préférer `amount`. */
  value?: React.ReactNode;
  /** Montant en unité entière : formaté et aligné automatiquement. */
  amount?: number;
  hint?: React.ReactNode;
  tone?: 'default' | 'ink' | 'warning' | 'success';
}

export function Stat({
  label,
  value,
  amount,
  hint,
  tone = 'default',
  className,
  ...props
}: StatProps) {
  const isInk = tone === 'ink';

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-[16px] p-3.5 sm:gap-1.5 sm:p-[18px]',
        isInk ? 'bg-ink text-white' : 'border border-border bg-surface',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'text-[10.5px] font-bold uppercase tracking-[0.12em]',
          isInk ? 'text-coral-300' : 'text-text-3',
        )}
      >
        {label}
      </div>

      {/* `break-words` : un montant à sept chiffres dans une demi-largeur de
          téléphone ne doit pas élargir la tuile — donc la grille, donc la
          page, qui se mettrait à glisser de côté. */}
      <div
        className={cn(
          'tabular break-words font-display text-[21px] font-bold sm:text-[24px]',
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
}

/**
 * La mosaïque de tuiles d'un tableau de bord.
 *
 * ── Le défaut qu'elle corrige ───────────────────────────────────────────────
 * Les écrans posaient `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`. Or le
 * palier `sm` du design system vaut 480 px, et un téléphone en fait 390 à
 * 430 : sur l'appareil où la console est le plus consultée, chaque compteur
 * occupait donc toute la largeur, et voir onze chiffres demandait de faire
 * défiler onze cartes. Deux colonnes dès le plus petit écran remettent la
 * lecture sur un écran ou deux.
 *
 * ── La tuile orpheline ──────────────────────────────────────────────────────
 * Trois ou cinq tuiles dans deux colonnes laissent un trou. La dernière prend
 * alors toute la largeur : la mosaïque reste pleine quel que soit le nombre de
 * tuiles — et ce nombre varie, puisque la console masque les compteurs des
 * espaces qu'un employé n'a pas le droit d'ouvrir. La règle est portée par le
 * CSS (`:last-child:nth-child(odd)`) plutôt que calculée en amont, pour rester
 * juste sans que l'appelant ait à compter ses enfants.
 */
export interface StatGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Nombre de colonnes au grand palier. Deux partout ailleurs. */
  wide?: 2 | 3 | 4;
}

export function StatGrid({ wide = 4, className, ...props }: StatGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2.5 sm:gap-3',
        '[&>*:last-child:nth-child(odd)]:col-span-2',
        wide === 2 && 'lg:[&>*:last-child:nth-child(odd)]:col-span-1',
        wide === 3 && 'lg:grid-cols-3 lg:[&>*:last-child:nth-child(odd)]:col-span-1',
        wide === 4 && 'lg:grid-cols-4 lg:[&>*:last-child:nth-child(odd)]:col-span-1',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Pastille de date des cartes compactes.
 *
 * Le prototype remplace l'image par cette pastille dans les tableaux de bord :
 * « dans un dashboard, la photo n'aide pas à décider et coûte de la bande
 * passante ».
 */
export interface DateChipProps extends React.HTMLAttributes<HTMLDivElement> {
  date: Date;
  size?: 'default' | 'large';
}

export function DateChip({ date, size = 'default', className, ...props }: DateChipProps) {
  const { month, day } = formatDateChip(date);

  return (
    <div
      className={cn(
        'shrink-0 rounded-[9px] bg-ink py-1.5 text-center text-white',
        size === 'large' ? 'w-[52px] rounded-field' : 'w-[42px]',
        className,
      )}
      {...props}
    >
      <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-coral-200">
        {month}
      </div>
      <div className="text-[16px] font-bold leading-tight">{day}</div>
    </div>
  );
}
