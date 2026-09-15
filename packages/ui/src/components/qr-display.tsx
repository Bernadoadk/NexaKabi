import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Affichage d'un QR de billet.
 *
 * ── Les contraintes viennent de la porte, pas de l'écran ────────────────────
 * Le contrôleur scanne à trente centimètres, avec une caméra Android d'entrée
 * de gamme, dans la pénombre, et le porteur tient son téléphone à bout de bras.
 * Trois règles en découlent :
 *
 *  1. **176 px minimum**, quelle que soit la taille de l'écran. En dessous, les
 *     modules du QR deviennent plus petits qu'un pixel de capteur à cette
 *     distance et le décodage échoue.
 *  2. **Marge blanche** autour du code — la « zone de silence » de la norme.
 *     Un QR collé au bord d'un fond coloré ne se décode pas.
 *  3. **Contraste maximal** : noir pur sur blanc pur, jamais la couleur de
 *     marque. Le corail sur crème passerait mal à 40 % de luminosité.
 *
 * Le SVG est rendu côté serveur et injecté tel quel : la page reste lisible
 * sans JavaScript, et le billet mis en cache s'affiche hors ligne.
 */

export interface QrDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** SVG du QR, généré côté serveur. */
  svg: string;
  /** Taille du côté, en pixels. Jamais moins de 176. */
  size?: number;
  /**
   * Estompe le code et superpose une mention.
   * Utilisé pour un billet déjà utilisé : le QR reste visible — le porteur doit
   * pouvoir constater que c'est bien le sien — mais ne se présente plus comme
   * une invitation à passer.
   */
  dimmedLabel?: string;
}

/** Plancher imposé par le prototype. */
export const QR_MIN_SIZE = 176;

export function QrDisplay({ svg, size = 208, dimmedLabel, className, ...props }: QrDisplayProps) {
  const side = Math.max(QR_MIN_SIZE, size);

  return (
    <div
      className={cn('relative inline-flex rounded-card bg-white p-3 shadow-sm', className)}
      {...props}
    >
      <div
        // Le SVG provient du serveur, jamais d'une saisie utilisateur : il est
        // produit par l'encodeur à partir du jeton signé.
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: side, height: side }}
        className={cn('[&>svg]:size-full', dimmedLabel && 'opacity-25')}
        role="img"
        aria-label="Code QR du billet"
      />

      {dimmedLabel ? (
        <span className="absolute inset-0 grid place-items-center">
          <span className="rounded-chip bg-ink px-3 py-1.5 text-body-s font-bold text-white">
            {dimmedLabel}
          </span>
        </span>
      ) : null}
    </div>
  );
}
