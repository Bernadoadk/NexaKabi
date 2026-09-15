import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import type { VerificationSummary } from '@nexakabi/contracts';
import { formatMoney, formatRelative } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser } from '@/lib/session';
import { AdminShell } from '../shell';

export const metadata: Metadata = { title: 'Vérifications' };

/**
 * Écran M2 — file des vérifications.
 *
 * ── Pourquoi le montant en attente est la colonne la plus visible ─────────
 * La vérification conditionne le RETRAIT DES FONDS, pas la vente. Un dossier en
 * attente représente donc de l'argent qu'un organisateur réel a encaissé et ne
 * peut pas toucher. C'est ce montant, pas l'ancienneté du dossier, qui mesure
 * ce que l'attente coûte à quelqu'un.
 */
export default async function VerificationsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');

  const result = await adminFetch<VerificationSummary[]>('/verifications');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Vérifications</h1>
          <p className="text-body-s text-text-2">
            Les dossiers les plus coûteux d’abord : tant qu’ils attendent, les recettes restent
            bloquées.
          </p>
        </header>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={<CircleCheck size={26} />}
            title="Aucun dossier en attente"
            description="Les nouvelles demandes de vérification apparaîtront ici."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {result.data.map((request) => (
              <li key={request.id}>
                <Surface variant="panel" padding="none">
                  <Link
                    href={`/verifications/${request.id}`}
                    className="flex flex-wrap items-center gap-4 p-4 text-text-strong transition hover:bg-surface-alt"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-body font-bold">
                        {request.organizationName}
                      </span>
                      <span className="text-micro text-text-3">
                        {request.contactName} · {request.documentCount} pièce
                        {request.documentCount > 1 ? 's' : ''} · déposé{' '}
                        {formatRelative(new Date(request.submittedAt))}
                      </span>
                    </div>

                    {request.pendingBalance > 0 ? (
                      <span className="text-body font-bold tabular-nums text-coral">
                        {formatMoney(request.pendingBalance)}
                      </span>
                    ) : (
                      <span className="text-body-s text-text-3">Aucune recette</span>
                    )}

                    <Badge tone={request.status === 'INCOMPLETE' ? 'warning' : 'neutral'}>
                      {request.status === 'INCOMPLETE' ? 'À compléter' : 'En attente'}
                    </Badge>
                  </Link>
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
