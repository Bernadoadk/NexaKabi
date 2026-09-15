import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Badge de statut.
 *
 * Règle non négociable du prototype :
 * « Un statut n'est jamais porté par la couleur seule : toujours un mot, et un
 * point ou une icône pour les cas critiques. »
 *
 * Format constant relevé : 11,5 px / 700 / padding 5×10 / rayon 7.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-[5px] rounded-chip px-[10px] py-[5px] text-micro font-bold whitespace-nowrap',
  {
    variants: {
      tone: {
        /** Payé · En vente · Actif · Valide · Effectué · Vérifié */
        success: 'bg-mint-50 text-mint-700',
        /** En attente · À vérifier · Incomplet · Invité */
        warning: 'bg-amber-50 text-amber-700',
        /** Échoué */
        danger: 'bg-red-50 text-red-700',
        /** Remboursé · Virement en cours */
        info: 'bg-blue-50 text-blue-700',
        /** Brouillon · Clôturé */
        neutral: 'bg-fill-neutral text-text-neutral',
        /** Publié */
        ink: 'bg-ink text-white',
        /** Bientôt complet · Gratuit */
        accent: 'bg-coral-50 text-coral-700',
        /** Organisateur vérifié — sur fond encre, accent menthe */
        verified: 'bg-ink text-mint-300',
        /** Badge posé sur une image, dans le coin d'une carte */
        overlay: 'bg-white/92 text-ink',
        /** Badge d'alerte posé sur une image */
        'overlay-accent': 'bg-coral text-ink',
        /**
         * Variantes fond-sombre : les tons pastel de `success`/`warning`/`danger`
         * deviennent illisibles sur encre. Mêmes couleurs de marque, contrastes
         * inversés — pour le scanner et tout écran plein écran sur fond sombre.
         * Statut « bon » (carnet à jour, entrée valide).
         */
        'success-ink': 'bg-mint text-ink',
        /** Statut « attention » (carnet absent, à vérifier), sur fond encre. */
        'warning-ink': 'bg-amber-400 text-ink',
        /** Statut « erreur », sur fond encre. */
        'danger-ink': 'bg-red text-white',
        /** Statut neutre (en cours, en attente), sur fond encre. */
        'neutral-ink': 'bg-white/12 text-white/70',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /**
   * Affiche une pastille colorée avant le libellé.
   * À utiliser pour les statuts critiques, afin de ne jamais reposer sur la
   * seule couleur de fond.
   */
  dot?: boolean;
}

export function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span aria-hidden="true" className="size-[6px] rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };
