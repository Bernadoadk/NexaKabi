import type { NextRequest } from 'next/server';
import { relayOrganizationUpload } from '@/lib/upload-relay';

/**
 * Relais du dépôt d'une pièce de vérification.
 *
 * Le type de pièce voyage en paramètre d'URL, recopié tel quel : c'est l'API
 * qui le valide, comme le reste.
 */
export function POST(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') ?? '';

  return relayOrganizationUpload(
    request,
    `/organizer/organizations/current/verification/documents?type=${encodeURIComponent(type)}`,
  );
}
