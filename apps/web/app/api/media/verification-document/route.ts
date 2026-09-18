import type { NextRequest } from 'next/server';
import { relayOrganizationUpload } from '@/lib/upload-relay';

/**
 * Relais du dépôt d'une pièce de vérification.
 *
 * ── Ce que ce relais transporte, et pourquoi c'est tout ──────────────────
 * Le type de pièce et la version du consentement accepté, recopiés tels
 * quels : c'est l'API qui les valide, comme le reste. Le fichier, lui, est le
 * corps de la requête.
 *
 * Ne recopier QUE ces deux paramètres est délibéré. Un relais qui repasserait
 * toute la chaîne de requête laisserait un appelant glisser n'importe quel
 * paramètre jusqu'à l'API, sous une adresse que le navigateur considère comme
 * la nôtre.
 */
const FORWARDED = ['type', 'consent'] as const;

export function POST(request: NextRequest) {
  const forwarded = new URLSearchParams();

  for (const name of FORWARDED) {
    const value = request.nextUrl.searchParams.get(name);
    if (value !== null) forwarded.set(name, value);
  }

  return relayOrganizationUpload(
    request,
    `/organizer/organizations/current/verification/documents?${forwarded.toString()}`,
  );
}
