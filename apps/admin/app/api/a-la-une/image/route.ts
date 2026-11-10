import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, readAdminToken } from '@/lib/session';

/**
 * Relais du dépôt d'un visuel de la une — côté serveur de la console.
 *
 * Le relais générique (`api/admin/[...path]`) ne transporte que du JSON. Un
 * visuel arrive ici sous l'une de deux formes (voir `lib/upload-client.ts`) :
 *
 *  · la RÉFÉRENCE d'un fichier déjà déposé au stockage (JSON) — le cas normal ;
 *  · le fichier lui-même, en `multipart/form-data`, quand aucun stockage n'est
 *    configuré (développement). Il repart alors vers l'API en CORPS BRUT,
 *    nom et type dans deux en-têtes : la raison, et les noms d'en-têtes, sont
 *    dans `apps/api/src/modules/media/upload.constraints.ts`.
 *
 * Le jeton de session reste dans son cookie httpOnly.
 */
const UPLOAD_CONTENT_TYPE = 'application/octet-stream';
const UPLOAD_NAME_HEADER = 'x-file-name';
const UPLOAD_TYPE_HEADER = 'x-file-type';

/** `type/sous-type` et rien d'autre : la valeur vient du navigateur et finit dans un en-tête. */
const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

export async function POST(request: NextRequest): Promise<Response> {
  const token = await readAdminToken();

  if (!token) {
    return NextResponse.json({ message: 'Connecte-toi pour continuer.' }, { status: 401 });
  }

  let headers: Record<string, string>;
  let body: string | Uint8Array<ArrayBuffer>;

  if (request.headers.get('content-type')?.startsWith('application/json')) {
    headers = { 'Content-Type': 'application/json' };
    body = await request.text();
  } else {
    const file = (await request.formData().catch(() => null))?.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ message: 'Aucun fichier reçu.' }, { status: 400 });
    }

    headers = {
      'Content-Type': UPLOAD_CONTENT_TYPE,
      // Les en-têtes HTTP sont en ASCII : un nom accentué doit être encodé.
      [UPLOAD_NAME_HEADER]: encodeURIComponent(file.name),
      [UPLOAD_TYPE_HEADER]: MIME_TYPE.test(file.type) ? file.type : UPLOAD_CONTENT_TYPE,
    };
    body = new Uint8Array(await file.arrayBuffer());
  }

  try {
    const upstream = await fetch(`${API_URL}/admin/spotlights/image`, {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body,
      cache: 'no-store',
    });

    const payload: unknown = await upstream.json().catch(() => null);
    return NextResponse.json(payload ?? {}, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: 'L’API n’est pas joignable.' }, { status: 503 });
  }
}
