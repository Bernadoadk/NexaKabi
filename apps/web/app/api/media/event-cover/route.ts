import type { NextRequest } from 'next/server';
import { relayOrganizationUpload } from '@/lib/upload-relay';

/** Relais du dépôt de visuel d'événement — voir `lib/upload-relay`. */
export function POST(request: NextRequest) {
  return relayOrganizationUpload(request, '/media/event-cover');
}
