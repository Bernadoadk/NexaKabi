import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * Logo d'un moyen de paiement.
 *
 * ── Pourquoi un composant, et pas une balise `img` ──────────────────────────
 * Sur ce marché, un opérateur se reconnaît à sa couleur avant son nom : le
 * jaune MTN, l'orange d'Orange, le bleu de Wave. L'écran de choix du moyen est
 * l'endroit précis où un acheteur hésite — et l'hésitation coûte une vente.
 * Le logo y fait donc un vrai travail, pas de la décoration.
 *
 * Ce composant garantit trois choses qu'une balise `img` nue ne garantit pas :
 *
 *  1. **Un repli qui ne casse jamais l'écran.** Fichier absent, réseau coupé,
 *     moyen nouveau pas encore illustré : une pastille aux couleurs de la
 *     marque prend la place, avec l'initiale. Jamais une image brisée, jamais
 *     un trou dans la liste.
 *  2. **Une taille et une forme constantes.** Les logos d'opérateurs ont des
 *     proportions très différentes ; les enfermer dans le même carré arrondi
 *     est ce qui fait tenir la liste ensemble.
 *  3. **Rien à annoncer aux lecteurs d'écran.** Le libellé du moyen est
 *     toujours écrit à côté : le logo est décoratif au sens de
 *     l'accessibilité, et le répéter serait du bruit.
 */

const logoVariants = cva(
  'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white ring-1 ring-black/5',
  {
    variants: {
      size: {
        /** Liste de choix du tunnel d'achat. */
        default: 'size-10',
        /** Tableaux de l'administration, lignes de relevé. */
        compact: 'size-8 rounded-lg',
        /** Écran d'attente, confirmation : le moyen est le sujet. */
        large: 'size-14 rounded-xl',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export interface PaymentMethodLogoProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof logoVariants> {
  /** Nom du fichier dans `/paiements/`, sans extension. */
  logo?: string | null;
  /** Libellé du moyen — sert à l'initiale de repli. */
  label: string;
  /** Couleur de marque, fond de la pastille de repli. */
  brandColor?: string | null;
  /** Vrai quand la couleur est claire : l'initiale passe alors en sombre. */
  brandColorIsLight?: boolean;
  /** Racine des fichiers. Constante, sauf à servir les assets ailleurs. */
  basePath?: string;
}

export function PaymentMethodLogo({
  logo,
  label,
  brandColor,
  brandColorIsLight = false,
  size,
  basePath = '/paiements',
  className,
  ...props
}: PaymentMethodLogoProps) {
  // Une image qui échoue bascule sur la pastille, sans qu'on ait à savoir
  // pourquoi : fichier manquant, hors ligne, ou logo pas encore fourni.
  const [broken, setBroken] = React.useState(false);

  React.useEffect(() => setBroken(false), [logo]);

  const showImage = Boolean(logo) && !broken;

  return (
    <span aria-hidden className={cn(logoVariants({ size }), className)} {...props}>
      {showImage ? (
        <img
          src={`${basePath}/${logo}.svg`}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="flex size-full items-center justify-center text-body font-bold"
          style={{
            backgroundColor: brandColor ?? '#4A5568',
            color: brandColorIsLight ? '#1A1A1A' : '#FFFFFF',
          }}
        >
          {initialOf(label)}
        </span>
      )}
    </span>
  );
}

/** Première lettre significative : « Carte bancaire » → « C ». */
function initialOf(label: string): string {
  return label.trim().charAt(0).toUpperCase() || '?';
}
