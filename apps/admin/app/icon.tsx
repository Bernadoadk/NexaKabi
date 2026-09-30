import { renderAppIcon } from '@/lib/app-icon';

/**
 * Favicon de la console, tiré de `public/icons/fav.png` : l'onglet, puis les
 * écrans haute densité. Le 512 est celui que le manifeste d'installation
 * demande — sans lui, Android refuse d'installer l'application.
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
