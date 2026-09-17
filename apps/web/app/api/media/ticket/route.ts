import { relayUploadTicket } from '@/lib/upload-relay';

/** Premier temps de tout dépôt : le ticket de dépôt direct — voir `lib/upload-client`. */
export function POST() {
  return relayUploadTicket();
}
