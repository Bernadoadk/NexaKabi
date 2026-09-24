import { renderAppIcon } from '@/lib/app-icon';

/**
 * Icône d'écran d'accueil iOS, tirée de `public/icons/fav.png`.
 *
 * Sur fond blanc : iOS remplit en noir la transparence d'une icône, et arrondit
 * lui-même les coins — la marge du dessin suffit à les éviter.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderAppIcon(size.width, { background: '#FFFFFF' });
}
