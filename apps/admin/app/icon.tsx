import { renderAppIcon } from '@/lib/app-icon';

/** Favicon de la console, tiré de `public/icons/fav.png` : l'onglet, puis les écrans haute densité. */
const SIZES = [32, 192] as const;

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
