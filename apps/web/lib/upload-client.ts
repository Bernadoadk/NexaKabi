import {
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_LABEL,
  type StagedUpload,
  type UploadTicket,
  type UploadedMedia,
} from '@nexakabi/contracts';

/**
 * Dépôt d'un fichier depuis le navigateur.
 *
 * ── Le fichier ne passe pas par nos serveurs ────────────────────────────────
 * Sur Vercel, une fonction refuse tout corps de plus de 4,5 Mo — il est donc
 * impossible de promettre 10 Mo à l'utilisateur si le fichier transite par
 * le web puis par l'API. Le dépôt se fait en trois temps :
 *
 *  1. `POST /api/media/ticket` : l'API signe un ticket de dépôt direct ;
 *  2. le navigateur envoie le fichier au stockage avec ce ticket, dans un
 *     espace de transit privé ;
 *  3. `POST <endpoint>` : le navigateur ne transmet que la RÉFÉRENCE du
 *     fichier ; l'API le reprend du transit, le contrôle et le ré-encode.
 *
 * Quand le ticket est en mode `relay` (poste de développement sans stockage
 * configuré), le fichier passe par l'API comme avant.
 *
 * ── Toujours donner la cause probable ───────────────────────────────────────
 * Chaque échec sort avec une phrase qui dit quoi faire — un fichier trop
 * lourd est refusé AVANT tout envoi, avec sa taille et la limite.
 */
export type UploadOutcome = { ok: true; data: UploadedMedia } | { ok: false; message: string };

/** Progression de 0 à 1. Appelée souvent : l'appelant doit pouvoir la rendre telle quelle. */
export type UploadProgress = (fraction: number) => void;

/**
 * Part du transfert réservée à l'octroi du ticket et à la confirmation de
 * l'API.
 *
 * ── Pourquoi la barre ne va pas jusqu'au bout toute seule ─────────────────
 * Quand le dernier octet du fichier a quitté le téléphone, il reste à l'API à
 * le reprendre du transit, à vérifier ses octets réels et à le ré-encoder —
 * une à deux secondes de plus. Une barre arrivée à 100 % pendant ce temps-là
 * dit « c'est fini » alors que ça ne l'est pas, et l'utilisateur quitte
 * l'écran. On garde donc les huit derniers pour cent pour ce qui reste
 * réellement à faire.
 */
const CONFIRMATION_SHARE = 0.08;

export async function uploadFile(
  file: File,
  endpoint: string,
  options?: { onProgress?: UploadProgress },
): Promise<UploadOutcome> {
  const report = options?.onProgress;

  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      message:
        `Ce fichier fait ${formatBytes(file.size)} ; la limite est de ${UPLOAD_MAX_LABEL}. ` +
        'Réduis sa taille (export en JPEG, ou résolution moindre) et réessaie.',
    };
  }

  if (file.size === 0) {
    return { ok: false, message: 'Ce fichier est vide.' };
  }

  try {
    report?.(0);

    const ticket = await requestTicket();
    if (!ticket.ok) return ticket;

    const transfer: UploadProgress = (fraction) => report?.(fraction * (1 - CONFIRMATION_SHARE));

    if (ticket.data.mode === 'relay') {
      const body = new FormData();
      body.append('file', file);

      const sent = await postWithProgress(endpoint, body, transfer);
      report?.(1);
      return toOutcome(sent);
    }

    const staged = await sendToStorage(file, ticket.data, transfer);
    if (!staged.ok) return staged;

    const confirmed = await finish(
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged.data),
      }),
    );

    report?.(1);
    return confirmed;
  } catch {
    return {
      ok: false,
      message: 'Le réseau a lâché pendant l’envoi. Vérifie ta connexion et réessaie.',
    };
  }
}

interface RawResponse {
  ok: boolean;
  status: number;
  payload: unknown;
}

/**
 * Envoi avec progression réelle.
 *
 * ── Pourquoi `XMLHttpRequest` et pas `fetch` ────────────────────────────
 * Parce que `fetch` ne rapporte toujours pas la progression de l'ENVOI. Les
 * flux de requête existent, mais ne fonctionnent qu'en HTTP/2, imposent un
 * aller-retour préalable et restent inégalement pris en charge sur les
 * navigateurs Android qu'on vise. `XMLHttpRequest.upload.onprogress` marche
 * partout, depuis toujours, et c'est la seule chose qu'on lui demande.
 */
function postWithProgress(
  url: string,
  body: FormData,
  onProgress?: UploadProgress,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);

    if (onProgress) {
      request.upload.onprogress = (event) => {
        // `lengthComputable` est faux derrière certains proxys : mieux vaut ne
        // rien dire que d'annoncer une progression inventée.
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      };
    }

    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText) as unknown;
      } catch {
        payload = null;
      }

      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, payload });
    };

    request.onerror = () => reject(new Error('network'));
    request.ontimeout = () => reject(new Error('timeout'));
    request.onabort = () => reject(new Error('abort'));

    request.send(body);
  });
}

function toOutcome(response: RawResponse): UploadOutcome {
  if (!response.ok) {
    return { ok: false, message: describeStatus(response.status, response.payload) };
  }

  return { ok: true, data: response.payload as UploadedMedia };
}

async function requestTicket(): Promise<
  { ok: true; data: UploadTicket } | { ok: false; message: string }
> {
  const response = await fetch('/api/media/ticket', { method: 'POST' });

  if (!response.ok) {
    return { ok: false, message: await describeFailure(response) };
  }

  return { ok: true, data: (await response.json()) as UploadTicket };
}

/** Envoi direct au stockage. La réponse porte la référence à transmettre à l'API. */
async function sendToStorage(
  file: File,
  ticket: Extract<UploadTicket, { mode: 'direct' }>,
  onProgress?: UploadProgress,
): Promise<{ ok: true; data: StagedUpload } | { ok: false; message: string }> {
  const body = new FormData();
  for (const [name, value] of Object.entries(ticket.fields)) body.append(name, value);
  body.append(ticket.fileField, file);

  const response = await postWithProgress(ticket.uploadUrl, body, onProgress);

  if (!response.ok) {
    const detail = (response.payload as { error?: { message?: string } } | null)?.error?.message;

    return {
      ok: false,
      message: detail
        ? `Le stockage a refusé le fichier : ${detail}`
        : 'Le stockage n’a pas accepté le fichier. Réessaie dans un instant.',
    };
  }

  const result = response.payload as {
    public_id: string;
    version: number;
    signature: string;
  };

  return {
    ok: true,
    data: {
      publicId: result.public_id,
      version: result.version,
      signature: result.signature,
      name: file.name,
      type: file.type || undefined,
    },
  };
}

async function finish(response: Response): Promise<UploadOutcome> {
  if (!response.ok) {
    return { ok: false, message: await describeFailure(response) };
  }

  return { ok: true, data: (await response.json()) as UploadedMedia };
}

/** Le message de l'API quand il y en a un ; sinon la cause la plus probable du statut. */
async function describeFailure(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  return describeStatus(response.status, payload);
}

function describeStatus(status: number, payload: unknown): string {
  const message = (payload as { message?: string } | null)?.message;
  if (message) return message;

  if (status === 413) {
    return `Fichier trop lourd pour être transmis. ${UPLOAD_MAX_LABEL} au maximum.`;
  }

  if (status === 401) return 'Ta session a expiré. Reconnecte-toi puis réessaie.';

  return 'Dépôt impossible pour l’instant. Réessaie dans un moment.';
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}
