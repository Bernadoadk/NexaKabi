import { NextResponse, type NextRequest } from 'next/server';
import type { RequestOtpResponse } from '@nexakabi/contracts';
import { apiFetch } from '@/lib/api';

/**
 * Demande d'un code à 6 chiffres.
 *
 * Le navigateur ne parle jamais directement à l'API : ce relais permet de garder
 * les jetons dans des cookies httpOnly et de n'exposer aucune URL interne.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => ({}));

  const result = await apiFetch<RequestOtpResponse>('/auth/otp/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // L'adresse reelle est ecrite par le proxy d'entree, jamais relayee
      // depuis le navigateur : un en-tete `x-forwarded-for` recopie du client
      // laisserait n'importe qui choisir l'adresse que l'API enregistre, et
      // contourner toute limitation par IP.
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return NextResponse.json(result.error, { status: result.error.statusCode });
  }

  return NextResponse.json(result.data);
}
