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

export async function uploadFile(file: File, endpoint: string): Promise<UploadOutcome> {
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
    const ticket = await requestTicket();
    if (!ticket.ok) return ticket;

    if (ticket.data.mode === 'relay') {
      const body = new FormData();
      body.append('file', file);
      return finish(await fetch(endpoint, { method: 'POST', body }));
    }

    const staged = await sendToStorage(file, ticket.data);
    if (!staged.ok) return staged;

    return finish(
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staged.data),
      }),
    );
  } catch {
    return {
      ok: false,
      message: 'Le réseau a lâché pendant l’envoi. Vérifie ta connexion et réessaie.',
    };
  }
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
): Promise<{ ok: true; data: StagedUpload } | { ok: false; message: string }> {
  const body = new FormData();
  for (const [name, value] of Object.entries(ticket.fields)) body.append(name, value);
  body.append(ticket.fileField, file);

  const response = await fetch(ticket.uploadUrl, { method: 'POST', body });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail = (payload as { error?: { message?: string } } | null)?.error?.message;

    return {
      ok: false,
      message: detail
        ? `Le stockage a refusé le fichier : ${detail}`
        : 'Le stockage n’a pas accepté le fichier. Réessaie dans un instant.',
    };
  }

  const result = (await response.json()) as {
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
  const message = (payload as { message?: string } | null)?.message;
  if (message) return message;

  if (response.status === 413) {
    return `Fichier trop lourd pour être transmis. ${UPLOAD_MAX_LABEL} au maximum.`;
  }

  if (response.status === 401) return 'Ta session a expiré. Reconnecte-toi puis réessaie.';

  return 'Dépôt impossible pour l’instant. Réessaie dans un moment.';
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}
