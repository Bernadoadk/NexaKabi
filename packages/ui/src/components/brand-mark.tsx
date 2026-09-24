import Image from 'next/image';
import { cn } from '../lib/cn';

/**
 * Le monogramme Nexa-Kabi, tel que l'application le sert.
 *
 * ── Un fichier par application, un seul composant ──────────────────────────
 * Le dessin vit dans le dossier public de CHAQUE application —
 * `public/icons/logo.png`, côté site comme côté console. Remplacer ce fichier
 * suffit à changer le logo partout où ce composant l'affiche.
 *
 * ── Pourquoi `next/image` ───────────────────────────────────────────────────
 * La source fait 1 254 px de côté et près de 500 Ko : servie telle quelle,
 * elle pèserait plus que tout le reste du premier écran, sur un marché où la
 * connexion se paie au mégaoctet. `next/image` la livre à la taille affichée,
 * compressée — quelques kilo-octets.
 *
 * ── La marge fait partie du dessin ──────────────────────────────────────────
 * Le « N » est entouré d'une marge transparente : c'est l'espace de
 * protection du logo, il n'est pas rogné ici. `size` est donc le côté du
 * dessin entier ; le « N » en occupe environ les deux tiers.
 */
export const BRAND_MARK_SRC = '/icons/logo.png';

export interface BrandMarkProps {
  /** Côté du dessin, marge comprise, en pixels CSS. */
  size?: number;
  /**
   * Texte alternatif. Vide par défaut : le nom « Nexa-Kabi » est presque
   * toujours écrit à côté, et le répéter serait du bruit pour un lecteur
   * d'écran.
   */
  label?: string;
  className?: string;
}

export function BrandMark({ size = 36, label = '', className }: BrandMarkProps) {
  return (
    <Image
      src={BRAND_MARK_SRC}
      alt={label}
      width={size}
      height={size}
      // Dans l'en-tête de chaque page : visible dès l'affichage.
      loading="eager"
      draggable={false}
      className={cn('shrink-0 select-none', className)}
    />
  );
}
