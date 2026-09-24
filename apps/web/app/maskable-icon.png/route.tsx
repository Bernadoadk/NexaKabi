import { renderAppIcon } from '@/lib/app-icon';

/**
 * Icône « maskable » du manifeste, tirée de `public/icons/fav.png`.
 *
 * Android découpe cette icône à la forme de son lanceur — cercle, goutte,
 * carré arrondi. Seul le cercle central (80 % du côté) est garanti visible :
 * le dessin y est ramené, sur un fond plein qui occupe tout le reste.
 *
 * Une adresse fixe, sans empreinte, parce que le manifeste la cite en dur.
 */
export const dynamic = 'force-static';

export function GET() {
  return renderAppIcon(512, { background: '#FFFFFF', scale: 0.82 });
}
