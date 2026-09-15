import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportSummary,
} from '@nexakabi/contracts';
import { formatMoney, formatRelative } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser } from '@/lib/session';
import { AdminShell } from '../shell';

export const metadata: Metadata = { title: 'Signalements' };

/**
 * Écran M4 — file des signalements.
 *
 * ── L'ordre de la file est la fonctionnalité ─────────────────────────────
 * Le tri combine le motif et les fonds détenus par l'organisation visée. Une
 * fraude signalée sur un compte qui détient deux millions passe devant un
 * « contenu inapproprié » vieux de trois jours : le premier peut encore être
 * arrêté avant un versement, le second non.
 *
 * Le montant est donc affiché dans la LISTE, pas seulement dans le détail. Un
 * modérateur qui doit ouvrir dix dossiers pour savoir lequel traiter en premier
 * traite les dix dans le désordre.
 */
export default async function ReportsPage() {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');

  const result = await adminFetch<ReportSummary[]>('/reports');

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Signalements</h1>
          <p className="text-body-s text-text-2">
            Triés par risque : motif et fonds détenus par l’organisation visée.
          </p>
        </header>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.length === 0 ? (
          <EmptyState
            icon={<CircleCheck size={26} />}
            title="Aucun signalement ouvert"
            description="Les signalements déposés par les participants apparaîtront ici."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {result.data.map((report) => (
              <li key={report.id}>
                <Surface variant="panel" padding="none">
                  <Link
                    href={`/signalements/${report.id}`}
                    className="flex flex-col gap-2 p-4 text-text-strong transition hover:bg-surface-alt"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Badge tone={report.reason === 'FRAUD' ? 'danger' : 'neutral'}>
                        {REPORT_REASON_LABELS[report.reason]}
                      </Badge>
                      <span className="text-body font-bold">{report.targetLabel}</span>
                      <div className="flex-1" />
                      {report.organizationBalance !== null && report.organizationBalance > 0 ? (
                        <span className="text-body-s font-bold tabular-nums text-coral">
                          {formatMoney(report.organizationBalance)} en jeu
                        </span>
                      ) : null}
                    </div>

                    <p className="line-clamp-2 text-body-s leading-snug text-text-2">
                      {report.details}
                    </p>

                    <p className="text-micro text-text-3">
                      {report.reference} · {report.reporterLabel} ·{' '}
                      {formatRelative(new Date(report.createdAt))} ·{' '}
                      {REPORT_STATUS_LABELS[report.status]}
                    </p>
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
