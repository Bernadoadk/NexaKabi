import { renderAppIcon } from '@/lib/app-icon';

/** Icône d'écran d'accueil iOS, sur fond blanc : iOS remplit la transparence en noir. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return renderAppIcon(size.width, { background: '#FFFFFF' });
}
