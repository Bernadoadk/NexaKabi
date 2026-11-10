import {
  SPOTLIGHT_VIDEO_MAX_BYTES,
  SPOTLIGHT_VIDEO_MAX_LABEL,
  SPOTLIGHT_VIDEO_TYPES,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_LABEL,
  type SpotlightVideo,
  type SpotlightVideoTicket,
  type StagedUpload,
  type UploadTicket,
  type UploadedMedia,
} from '@nexakabi/contracts';

/**
 * Dépôt d'un visuel de la une depuis la console.
 *
 * Même chemin que sur le site public (`apps/web/lib/upload-client.ts`) : le
 * fichier ne transite pas par nos serveurs, qui plafonnent à 4,5 Mo.
 *
 *  1. ticket de dépôt direct, signé par l'API ;
 *  2. envoi du fichier au stockage, dans un espace de transit privé ;
 *  3. envoi de la seule RÉFÉRENCE ; l'API reprend le fichier, le contrôle,
 *     le recadre en 16:9 et le ré-encode.
 *
 * Ticket en mode `relay` (poste de développement sans stockage) : le fichier
 * passe par la console puis par l'API.
 */
export type UploadOutcome = { ok: true; data: UploadedMedia } | { ok: false; message: string };

const TICKET_ENDPOINT = '/api/admin/spotlights/upload-ticket';
const IMAGE_ENDPOINT = '/api/a-la-une/image';

/** Part réservée à la confirmation de l'API : la barre n'annonce pas « fini » trop tôt. */
const CONFIRMATION_SHARE = 0.08;

export async function uploadSpotlightImage(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadOutcome> {
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      message: `Ce fichier dépasse ${UPLOAD_MAX_LABEL}. Exporte-le en JPEG ou réduis sa résolution.`,
    };
  }

  if (file.size === 0) return { ok: false, message: 'Ce fichier est vide.' };

  try {
    onProgress?.(0);

    const ticketResponse = await fetch(TICKET_ENDPOINT, { method: 'POST' });
    const ticket = (await ticketResponse.json().catch(() => null)) as
      (UploadTicket & { message?: string }) | null;

    if (!ticketResponse.ok || !ticket) {
      return { ok: false, message: ticket?.message ?? 'Le dépôt n’a pas pu commencer.' };
    }

    const transfer = (fraction: number) => onProgress?.(fraction * (1 - CONFIRMATION_SHARE));

    let confirmed: RawResponse;

    if (ticket.mode === 'relay') {
      const body = new FormData();
      body.append('file', file);
      confirmed = await post(IMAGE_ENDPOINT, body, transfer);
    } else {
      const body = new FormData();
      for (const [name, value] of Object.entries(ticket.fields)) body.append(name, value);
      body.append(ticket.fileField, file);

      const stored = await post(ticket.uploadUrl, body, transfer);

      if (!stored.ok) {
        return { ok: false, message: 'Le stockage n’a pas accepté le fichier. Réessaie.' };
      }

      const reference = stored.payload as {
        public_id: string;
        version: number;
        signature: string;
      };
      const staged: StagedUpload = {
        publicId: reference.public_id,
        version: reference.version,
        signature: reference.signature,
        name: file.name,
        type: file.type || undefined,
      };

      const response = await fetch(IMAGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged),
      });
      confirmed = {
        ok: response.ok,
        status: response.status,
        payload: await response.json().catch(() => null),
      };
    }

    onProgress?.(1);

    if (!confirmed.ok) {
      const message = (confirmed.payload as { message?: string } | null)?.message;
      return { ok: false, message: message ?? 'Le visuel n’a pas pu être enregistré.' };
    }

    return { ok: true, data: confirmed.payload as UploadedMedia };
  } catch {
    return { ok: false, message: 'Le réseau a lâché pendant l’envoi. Réessaie.' };
  }
}

interface RawResponse {
  ok: boolean;
  status: number;
  payload: unknown;
}

/** `XMLHttpRequest` : le seul à rapporter la progression d'un ENVOI, partout. */
function post(url: string, body: FormData, onProgress?: (fraction: number) => void) {
  return new Promise<RawResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };

    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText) as unknown;
      } catch {
        payload = null;
      }
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        payload,
      });
    };
    request.onerror = () => reject(new Error('network'));
    request.onabort = () => reject(new Error('abort'));

    request.send(body);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Vidéo
// ─────────────────────────────────────────────────────────────────────────────

export type VideoUploadOutcome =
  { ok: true; data: SpotlightVideo } | { ok: false; message: string };

/**
 * Dépôt d'une vidéo de la une : toujours direct chez le stockage, qui la
 * recadre, la compresse, la coupe à quinze secondes et la prive de son. L'API
 * vérifie ensuite ce qui a été déposé — durée, poids, format.
 */
export async function uploadSpotlightVideo(
  file: File,
  onProgress?: (fraction: number) => void,
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

  try {
    onProgress?.(0);

    const ticketResponse = await fetch('/api/admin/spotlights/video-ticket', { method: 'POST' });
    const ticket = (await ticketResponse.json().catch(() => null)) as
      (SpotlightVideoTicket & { message?: string }) | null;

    if (!ticketResponse.ok || !ticket) {
      return { ok: false, message: ticket?.message ?? 'Le dépôt n’a pas pu commencer.' };
    }

    const body = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) body.append(name, value);
    body.append(ticket.fileField, file);

    const stored = await post(ticket.uploadUrl, body, (fraction) =>
      onProgress?.(fraction * (1 - CONFIRMATION_SHARE)),
    );

    const reference = stored.payload as {
      public_id?: string;
      version?: number;
      signature?: string;
    } | null;

    if (
      !stored.ok ||
      !reference?.public_id ||
      reference.version === undefined ||
      !reference.signature
    ) {
      return { ok: false, message: 'Le stockage n’a pas accepté cette vidéo. Réessaie.' };
    }

    const staged: StagedUpload = {
      publicId: reference.public_id,
      version: reference.version,
      signature: reference.signature,
      name: file.name,
      type: file.type || undefined,
    };

    const response = await fetch('/api/admin/spotlights/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staged),
    });
    const payload = (await response.json().catch(() => null)) as
      (SpotlightVideo & { message?: string }) | null;

    onProgress?.(1);

    if (!response.ok || !payload) {
      return { ok: false, message: payload?.message ?? 'La vidéo n’a pas pu être enregistrée.' };
    }

    return { ok: true, data: payload };
  } catch {
    return { ok: false, message: 'Le réseau a lâché pendant l’envoi. Réessaie.' };
  }
}
