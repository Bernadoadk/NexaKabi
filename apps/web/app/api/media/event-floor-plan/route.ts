import type { NextRequest } from 'next/server';
import { relayOrganizationUpload } from '@/lib/upload-relay';

/** Relais du dépôt d’un plan du lieu — voir `lib/upload-relay`. */
export function POST(request: NextRequest) {
  return relayOrganizationUpload(request, '/media/event-floor-plan');
}
