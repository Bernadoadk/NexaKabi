import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * Icônes de la console — onglet, favoris, écran d'accueil.
 *
 * Même principe que `apps/web/lib/app-icon.tsx` : une seule source,
 * `public/icons/fav.png`, réduite à chaque taille utile à la construction.
 * Remplacer ce fichier suffit à tout mettre à jour au déploiement suivant.
 */
const SOURCE = path.join(process.cwd(), 'public', 'icons', 'fav.png');

let source: Promise<string> | null = null;

/** La source, lue une fois par processus, en URL de données pour le moteur de rendu. */
function readSource(): Promise<string> {
  source ??= readFile(SOURCE, 'base64').then((data) => `data:image/png;base64,${data}`);
  return source;
}

export async function renderAppIcon(
  size: number,
  { background }: { background?: string } = {},
): Promise<ImageResponse> {
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
      <img src={await readSource()} width={size} height={size} alt="" />
    </div>,
    { width: size, height: size },
  );
}
