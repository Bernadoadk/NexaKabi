import type { NextRequest } from 'next/server';
import { relayOrganizationUpload } from '@/lib/upload-relay';

/** Relais du dépôt de bannière — voir `lib/upload-relay`. */
export function POST(request: NextRequest) {
  return relayOrganizationUpload(request, '/media/organization-cover');
}
