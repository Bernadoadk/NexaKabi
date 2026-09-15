import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';

/**
 * Téléchargement du billet en PDF.
 *
 * Relais plutôt que lien direct vers l'API : le navigateur ne connaît qu'une
 * seule origine, ce qui évite d'exposer l'URL interne et garde la porte ouverte
 * à un contrôle d'accès supplémentaire sans changer le lien affiché.
 *
 * Le flux est transmis tel quel — le PDF n'a aucune raison de transiter par la
 * mémoire de Next.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  const upstream = await fetch(`${API_URL}/t/${encodeURIComponent(token)}/pdf`, {
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        statusCode: upstream.status,
        code: 'TICKET_PDF_UNAVAILABLE',
        message:
          upstream.status === 404
            ? "Ce billet n'existe pas."
            : 'Le billet PDF est momentanément indisponible. Réessaie dans un instant.',
      },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment; filename="billet.pdf"',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
