import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from '@nexakabi/contracts';
import { formatMoney, formatRelative } from '@nexakabi/utils';
import { Alert, Badge, Surface } from '@nexakabi/ui';
import { adminFetch, canMoveMoney, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied, ReadOnlyNotice } from '../../access';
import { AdminShell } from '../../shell';
import { CaseActions } from './case-actions';

export const metadata: Metadata = { title: 'Dossier de signalement' };

interface ReportDetail {
  id: string;
  reference: string;
  targetType: string;
  targetId: string;
  reason: keyof typeof REPORT_REASON_LABELS;
  details: string;
  status: keyof typeof REPORT_STATUS_LABELS;
  createdAt: string;
  reporterPhone: string | null;
  resolutionNote: string | null;
  assignedToUserId: string | null;
  organizationId: string | null;
  organization: { id: string; name: string; verificationStatus: string } | null;
  reporter: { fullName: string; phone: string } | null;
  notes: { id: string; body: string; createdAt: string; author: { fullName: string } }[];
  balance: { availableAmount: number; pendingAmount: number } | null;
}

/**
 * Écran M5 — instruction d'un signalement.
 *
 * ── Ce que l'écran met en avant ──────────────────────────────────────────
 * Les fonds détenus, en haut, avant même le contenu du signalement. C'est la
 * seule information dont dépend une décision irréversible : geler, ou laisser
 * partir. Le reste — le récit du signalant, les notes internes — sert à décider
 * ensuite si le gel était justifié.
 */
export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'reports')) return <AccessDenied user={user} space="reports" />;
  const canAct = hasAdminAccess(user, 'reports', 'act');
  const money = canMoveMoney(user);

  const { id } = await params;
  const result = await adminFetch<ReportDetail>(`/reports/${id}`);

  if (!result.ok) {
    if (result.message.includes('n’existe pas')) notFound();

    return (
      <AdminShell user={user}>
        <Alert tone="danger" title="Dossier indisponible">
          {result.message}
        </Alert>
      </AdminShell>
    );
  }

  const report = result.data;
  const closed = report.status === 'RESOLVED' || report.status === 'DISMISSED';

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/signalements"
            className="text-body-s font-semibold text-text-2 hover:text-text-strong"
          >
            ← Signalements
          </Link>
          <span className="text-text-faint">/</span>
          <span className="text-body font-semibold">{report.reference}</span>
          <div className="flex-1" />
          <Badge tone={closed ? 'neutral' : report.reason === 'FRAUD' ? 'danger' : 'warning'}>
            {REPORT_STATUS_LABELS[report.status]}
          </Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-5">
            {/*
              Les fonds d'abord : c'est la seule information dont dépend une
              décision irréversible.
            */}
            {report.organization && report.balance ? (
              <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
                <h2 className="text-h3 font-bold">{report.organization.name}</h2>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Amount label="Disponible maintenant" value={report.balance.availableAmount} />
                  <Amount label="Bloqué par palier" value={report.balance.pendingAmount} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-micro text-text-3">Vérification</span>
                    <span className="text-body font-bold">
                      {report.organization.verificationStatus === 'VERIFIED'
                        ? 'Vérifiée'
                        : 'Non vérifiée'}
                    </span>
                  </div>
                </div>

                {report.balance.pendingAmount > 0 ? (
                  <p className="text-micro leading-relaxed text-text-3">
                    Les fonds bloqués par palier se libèrent d’eux-mêmes à leur échéance. Un gel
                    porte sur le total détenu, pas seulement sur le disponible du jour.
                  </p>
                ) : null}
              </Surface>
            ) : (
              <Alert tone="info" title="Aucune organisation concernée">
                Ce signalement vise un compte participant : il n’y a pas de fonds à geler.
              </Alert>
            )}

            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Badge tone={report.reason === 'FRAUD' ? 'danger' : 'neutral'}>
                  {REPORT_REASON_LABELS[report.reason]}
                </Badge>
                <span className="text-micro text-text-3">
                  {formatRelative(new Date(report.createdAt))}
                </span>
              </div>

              <p className="whitespace-pre-line text-body leading-relaxed">{report.details}</p>

              <p className="text-micro text-text-3">
                Signalé par {report.reporter?.fullName ?? report.reporterPhone ?? 'Anonyme'}
                {report.reporter?.phone ? ` · ${report.reporter.phone}` : ''}
              </p>
            </Surface>

            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
              <h2 className="text-h3 font-bold">Notes internes</h2>
              <p className="text-micro text-text-3">
                Visibles de l’équipe seule. Ni le signalant ni l’organisateur n’y ont accès.
              </p>

              {report.notes.length === 0 ? (
                <p className="text-body-s text-text-2">Aucune note pour l’instant.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {report.notes.map((note) => (
                    <li key={note.id} className="border-l-2 border-border-subtle pl-3">
                      <p className="whitespace-pre-line text-body-s leading-relaxed">{note.body}</p>
                      <p className="mt-1 text-micro text-text-3">
                        {note.author.fullName} · {formatRelative(new Date(note.createdAt))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>

            {report.resolutionNote ? (
              <Alert
                tone={report.status === 'RESOLVED' ? 'success' : 'info'}
                title={`Dossier ${REPORT_STATUS_LABELS[report.status].toLowerCase()}`}
              >
                {report.resolutionNote}
              </Alert>
            ) : null}
          </div>

          <div className="lg:sticky lg:top-[120px] lg:self-start">
            {canAct ? (
              <CaseActions
                reportId={report.id}
                organizationId={report.organizationId}
                closed={closed}
                assigned={report.assignedToUserId !== null}
                canFreeze={money}
              />
            ) : (
              <ReadOnlyNotice what="instruire ni clore un dossier" />
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-micro text-text-3">{label}</span>
      <span className="text-body font-bold tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}
