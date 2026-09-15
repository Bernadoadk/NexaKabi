import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';
import { readAccessToken } from '@/lib/session';
import { resolveActiveOrganizationId } from '@/lib/organizations';

/** Relais du dépôt de bannière — même geste que `media/event-cover`. */
export async function POST(request: NextRequest) {
  const [accessToken, organizationId] = await Promise.all([
    readAccessToken(),
    resolveActiveOrganizationId(),
  ]);

  if (!accessToken || !organizationId) {
    return NextResponse.json(
      { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Connecte-toi pour continuer.' },
      { status: 401 },
    );
  }

  const body = await request.formData();

  const response = await fetch(`${API_URL}/media/organization-cover`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-Id': organizationId },
    body,
  });

  const payload: unknown = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}
