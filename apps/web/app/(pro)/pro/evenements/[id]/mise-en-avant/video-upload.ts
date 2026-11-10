'use client';

import {
  SPOTLIGHT_VIDEO_MAX_BYTES,
  SPOTLIGHT_VIDEO_MAX_LABEL,
  SPOTLIGHT_VIDEO_TYPES,
  type SpotlightVideo,
} from '@nexakabi/contracts';
import { confirmSpotlightVideoAction, spotlightVideoTicketAction } from './actions';

/**
 * Dépôt d'une vidéo de la une.
 *
 * Une vidéo ne passe jamais par nos serveurs : l'API signe un ticket, le
 * navigateur envoie le fichier directement au stockage (qui la recadre, la
 * compresse et la coupe), puis l'API vérifie ce qui a été déposé — durée,
 * poids, format — avant de rendre ses adresses.
 */
export type VideoUploadOutcome =
  { ok: true; data: SpotlightVideo } | { ok: false; message: string };

export async function uploadSpotlightVideo(
  eventId: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<VideoUploadOutcome> {
  if (!(SPOTLIGHT_VIDEO_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Choisis une vidéo MP4, MOV ou WebM.' };
  }

  if (file.size > SPOTLIGHT_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      message: `Cette vidéo dépasse ${SPOTLIGHT_VIDEO_MAX_LABEL}. Exporte-la plus courte ou en 720p.`,
    };
  }

  const ticket = await spotlightVideoTicketAction(eventId);
  if (!ticket.ok) return { ok: false, message: ticket.message };

  const body = new FormData();
  for (const [name, value] of Object.entries(ticket.data.fields)) body.append(name, value);
  body.append(ticket.data.fileField, file);

  let stored: { public_id?: string; version?: number; signature?: string } | null;

  try {
    stored = await send(ticket.data.uploadUrl, body, (fraction) => onProgress(fraction * 0.92));
  } catch {
    return { ok: false, message: 'Le réseau a lâché pendant l’envoi. Réessaie.' };
  }

  if (!stored?.public_id || stored.version === undefined || !stored.signature) {
    return { ok: false, message: 'Le stockage n’a pas accepté cette vidéo. Réessaie.' };
  }

  const confirmed = await confirmSpotlightVideoAction(eventId, {
    publicId: stored.public_id,
    version: stored.version,
    signature: stored.signature,
    name: file.name,
    type: file.type,
  });

  onProgress(1);

  return confirmed.ok
    ? { ok: true, data: confirmed.data }
    : { ok: false, message: confirmed.message };
}

/** `XMLHttpRequest` : le seul qui rapporte la progression d'un ENVOI, partout. */
function send(
  url: string,
  body: FormData,
  onProgress: (fraction: number) => void,
): Promise<{ public_id?: string; version?: number; signature?: string } | null> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        resolve(null);
        return;
      }

      try {
        resolve(
          JSON.parse(request.responseText) as {
            public_id?: string;
            version?: number;
            signature?: string;
          },
        );
      } catch {
        resolve(null);
      }
    };

    request.onerror = () => reject(new Error('network'));
    request.onabort = () => reject(new Error('abort'));
    request.send(body);
  });
}
