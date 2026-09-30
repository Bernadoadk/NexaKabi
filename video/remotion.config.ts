/**
 * Réglages de Remotion (Studio et rendu en ligne de commande).
 * Les réglages de la vidéo elle-même vivent dans `src/config.ts`.
 */
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

// Images intermédiaires en JPEG de haute qualité : texte d'interface net,
// rendu plus rapide qu'en PNG.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);

// Un nouveau rendu remplace l'ancien fichier du même nom.
Config.setOverwriteOutput(true);

// Le port 3000 est celui de l'application web : le Studio prend le 3100.
Config.setStudioPort(3100);

// Tailwind v4 : les maquettes reprennent les classes de l'application.
Config.overrideWebpackConfig((currentConfiguration) => enableTailwind(currentConfiguration));
