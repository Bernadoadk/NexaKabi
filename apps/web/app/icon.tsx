import { renderAppIcon } from '@/lib/app-icon';

/**
 * Favicon et icônes de l'application, tirés de `public/icons/fav.png`.
 *
 * `32` pour l'onglet du navigateur ; `192` et `512` pour Android et
 * l'application installée — le manifeste (`manifest.ts`) les désigne par leur
 * adresse, `/icon/192` et `/icon/512`.
 */
const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: 'image/png',
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return renderAppIcon(Number(await id));
}
