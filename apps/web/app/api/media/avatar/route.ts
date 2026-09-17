import type { NextRequest } from 'next/server';
import { relayAccountUpload } from '@/lib/upload-relay';

/**
 * Relais du dépôt de photo de profil.
 *
 * Pas d'organisation ici, volontairement : c'est la photo du COMPTE, pas
 * celle d'une organisation — un participant qui n'en a aucune doit pouvoir
 * la déposer tout autant qu'un organisateur (voir `SelfPlacesController` côté
 * API pour le même raisonnement, appliqué à la recherche de lieux).
 */
export function POST(request: NextRequest) {
  return relayAccountUpload(request, '/media/avatar');
}
