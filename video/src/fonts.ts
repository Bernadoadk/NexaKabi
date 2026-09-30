/**
 * Les deux familles de l'application, chargées depuis Google Fonts.
 * `loadFont` suspend le rendu tant que les fichiers ne sont pas arrivés :
 * aucune image ne part avec une police de repli.
 */
import { loadFont as loadBricolage } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadJakarta } from '@remotion/google-fonts/PlusJakartaSans';

export const displayFont = loadBricolage('normal', {
  weights: ['400', '500', '700', '800'],
  subsets: ['latin', 'latin-ext'],
}).fontFamily;

export const sansFont = loadJakarta('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin', 'latin-ext'],
}).fontFamily;
