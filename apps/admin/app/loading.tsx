import { ConsoleSkeleton } from './console-skeleton';

/**
 * Chargement de la console, tous écrans confondus.
 *
 * Posé à la racine : il couvre chaque page de l'administration. Les écrans qui
 * méritent une forme plus précise — la revue d'un dossier de vérification, par
 * exemple — en posent un à leur propre niveau, qui prend le pas sur celui-ci.
 */
export default function AdminLoading() {
  return <ConsoleSkeleton />;
}
