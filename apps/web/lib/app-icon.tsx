import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * Icônes de l'application — onglet, écran d'accueil, application installée.
 *
 * ── Une seule source : `public/icons/fav.png` ───────────────────────────────
 * Toutes les tailles en sont tirées, à la construction. Remplacer ce fichier
 * suffit à tout mettre à jour au déploiement suivant : aucune déclinaison à
 * régénérer ni à oublier.
 *
 * ── Pourquoi le réduire ─────────────────────────────────────────────────────
 * La source fait 1 254 px et près de 500 Ko. Servie comme favicon, elle
 * serait téléchargée par chaque nouveau visiteur, sur un marché où la
 * connexion se paie au mégaoctet ; réduite à 32 px, elle pèse un kilo-octet.
 */
const SOURCE = path.join(process.cwd(), 'public', 'icons', 'fav.png');

let source: Promise<string> | null = null;

/** La source, lue une fois par processus, en URL de données pour le moteur de rendu. */
function readSource(): Promise<string> {
  source ??= readFile(SOURCE, 'base64').then((data) => `data:image/png;base64,${data}`);
  return source;
}

export interface AppIconOptions {
  /**
   * Fond plein. Nécessaire là où la transparence n'est pas admise : iOS
   * remplit d'office en NOIR le fond d'une icône d'écran d'accueil.
   */
  background?: string;
  /**
   * Part du côté occupée par le dessin, centré. `1` : tout le carré. Une
   * icône « maskable » doit garder son dessin dans le cercle central, qu'Android
   * découpe à la forme de son choix.
   */
  scale?: number;
}

export async function renderAppIcon(
  size: number,
  { background, scale = 1 }: AppIconOptions = {},
): Promise<ImageResponse> {
  const drawn = Math.round(size * scale);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: background ?? 'transparent',
      }}
    >
      {/* Rendu par le générateur d'images, pas par un navigateur : `next/image` n'a rien à faire ici. */}
      <img src={await readSource()} width={drawn} height={drawn} alt="" />
    </div>,
    { width: size, height: size },
  );
}
