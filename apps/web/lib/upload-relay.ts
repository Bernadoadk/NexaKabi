import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { readAccessToken } from '@/lib/session';
import { resolveActiveOrganizationId } from '@/lib/organizations';

/**
 * Relais d'un dépôt de fichier vers l'API — côté serveur du web.
 *
 * Le navigateur envoie l'une de deux choses (voir `lib/upload-client.ts`) :
 *
 *  · la RÉFÉRENCE d'un fichier déjà déposé au stockage (JSON, quelques
 *    octets) — le cas normal ;
 *  · le fichier lui-même, en `multipart/form-data` — quand aucun stockage
 *    n'est configuré (développement). Il est alors retransmis à l'API en
 *    CORPS BRUT (`application/octet-stream`), nom et type dans deux en-têtes :
 *    sur Vercel, la bordure du projet API répond 503 à tout multipart de plus
 *    de ~1 Mo, avant même d'invoquer la fonction. Détail et mesures dans
 *    `apps/api/src/modules/media/upload.constraints.ts`, qui fixe aussi les
 *    noms d'en-têtes ci-dessous.
 *
 * Dans les deux cas, le jeton de session reste dans son cookie httpOnly : le
 * navigateur ne parle jamais à l'API lui-même.
 */
const UPLOAD_CONTENT_TYPE = 'application/octet-stream';
const UPLOAD_NAME_HEADER = 'x-file-name';
const UPLOAD_TYPE_HEADER = 'x-file-type';

/** `type/sous-type` et rien d'autre : la valeur vient du navigateur et finit dans un en-tête. */
const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

type Forwarded = { headers: Record<string, string>; body: string | Uint8Array<ArrayBuffer> };

const unauthenticated = () =>
  NextResponse.json(
    { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Connecte-toi pour continuer.' },
    { status: 401 },
  );

/** Lit ce que le navigateur a envoyé et le met dans la forme attendue par l'API. */
async function readForwarded(request: Request): Promise<Forwarded | null> {
  if (request.headers.get('content-type')?.startsWith('application/json')) {
    return { headers: { 'Content-Type': 'application/json' }, body: await request.text() };
  }

  const file = (await request.formData()).get('file');
  if (!file || typeof file === 'string') return null;

  return {
    headers: {
      'Content-Type': UPLOAD_CONTENT_TYPE,
      // Les en-têtes HTTP sont en ASCII : un nom accentué doit être encodé.
      [UPLOAD_NAME_HEADER]: encodeURIComponent(file.name),
      [UPLOAD_TYPE_HEADER]: MIME_TYPE.test(file.type) ? file.type : UPLOAD_CONTENT_TYPE,
    },
    body: new Uint8Array(await file.arrayBuffer()),
  };
}

async function forward(
  request: Request,
  apiPath: string,
  headers: Record<string, string>,
): Promise<NextResponse> {
  const forwarded = await readForwarded(request);

  if (!forwarded) {
    return NextResponse.json(
      { statusCode: 400, code: 'BAD_REQUEST', message: 'Aucun fichier reçu.' },
      { status: 400 },
    );
  }

  const response = await fetch(`${API_URL}${apiPath}`, {
    method: 'POST',
    headers: { ...headers, ...forwarded.headers },
    body: forwarded.body,
  });

  const payload: unknown = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}

/** Dépôt rattaché au compte seul (photo de profil). */
export async function relayAccountUpload(request: Request, apiPath: string): Promise<NextResponse> {
  const accessToken = await readAccessToken();
  if (!accessToken) return unauthenticated();

  return forward(request, apiPath, { Authorization: `Bearer ${accessToken}` });
}

/** Dépôt au nom de l'organisation active (visuels, logo, bannière, pièces). */
export async function relayOrganizationUpload(
  request: Request,
  apiPath: string,
): Promise<NextResponse> {
  const [accessToken, organizationId] = await Promise.all([
    readAccessToken(),
    resolveActiveOrganizationId(),
  ]);
  if (!accessToken || !organizationId) return unauthenticated();

  return forward(request, apiPath, {
    Authorization: `Bearer ${accessToken}`,
    'X-Organization-Id': organizationId,
  });
}

/** Premier temps d'un dépôt : le ticket signé par l'API. */
export async function relayUploadTicket(): Promise<NextResponse> {
  const accessToken = await readAccessToken();
  if (!accessToken) return unauthenticated();

  const response = await fetch(`${API_URL}/media/upload-ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload: unknown = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}
