import type { Metadata } from 'next';
import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import type {
  CheckInConflictView,
  CheckInEntry,
  CheckInStats,
  EventStaffMember,
} from '@nexakabi/contracts';
import { ORG_ROLE_DEFINITIONS, type OrgRole } from '@nexakabi/contracts';
import { Alert, Badge, Stat, Surface } from '@nexakabi/ui';
import { apiFetchAuthenticated } from '@/lib/session';

export const metadata: Metadata = { title: 'Contrôle à l’entrée' };

/**
 * Écran O7 — contrôle à l'entrée, côté organisateur.
 *
 * ── Ce que l'organisateur vient y chercher ──────────────────────────────────
 * Pendant l'événement : combien de personnes sont entrées, et le flux avance-t-il.
 * Après : qui a scanné quoi, et surtout les CONFLITS — les seuls incidents qu'il
 * doit arbitrer lui-même.
 *
 * Le prototype est explicite : les conflits ne remontent jamais au contrôleur
 * pendant l'événement, parce qu'il ne peut rien y faire sur le moment. Ils
 * arrivent ici, et nulle part ailleurs.
 */
export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [statsResult, historyResult, conflictsResult, staffResult] = await Promise.all([
    apiFetchAuthenticated<CheckInStats>(`/checkin/events/${id}/stats`),
    apiFetchAuthenticated<CheckInEntry[]>(`/checkin/events/${id}/history?limit=50`),
    apiFetchAuthenticated<CheckInConflictView[]>(`/checkin/events/${id}/conflicts`),
    apiFetchAuthenticated<EventStaffMember[]>(`/checkin/events/${id}/staff`),
  ]);

  const stats = statsResult.ok ? statsResult.data : null;
  const history = historyResult.ok ? historyResult.data : [];
  const conflicts = conflictsResult.ok ? conflictsResult.data : [];
  const staff = staffResult.ok ? staffResult.data : [];
  const unresolved = conflicts.filter((conflict) => conflict.resolvedAt === null);

  const rate =
    stats && stats.expectedCount > 0
      ? Math.round((stats.checkedInCount / stats.expectedCount) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Contrôle à l’entrée</h1>
          <p className="max-w-[60ch] text-body-s text-text-2">
            Le scanner s’ouvre une heure avant le début et fonctionne sans réseau. Chaque membre de
            l’équipe le trouve au même endroit, sur son propre téléphone.
          </p>
        </div>

        {/* Le scanner existait sans qu'aucun écran n'y mène : seule une URL
            tapée à la main l'atteignait. Le soir de l'événement, l'organisateur
            doit le trouver ICI, sur l'écran qu'il a déjà ouvert pour suivre les
            entrées — pas dans un menu, pas dans une documentation. */}
        <Link
          href={`/scan/${id}`}
          className="inline-flex min-h-[var(--tap-min)] shrink-0 items-center justify-center gap-2 rounded-button bg-coral px-5 text-body-s font-bold text-white transition hover:bg-coral-hover"
        >
          <ScanLine className="size-[18px]" aria-hidden />
          Ouvrir le scanner
        </Link>
      </header>

      {!statsResult.ok ? (
        <Alert tone="danger" title="Statistiques indisponibles">
          {statsResult.error.message}
        </Alert>
      ) : null}

      {stats ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Entrées" value={String(stats.checkedInCount)} hint={`${rate} %`} />
          <Stat label="Billets attendus" value={String(stats.expectedCount)} />
          <Stat
            label="Scans hors ligne"
            value={String(stats.offlineScans)}
            hint="synchronisés depuis"
          />
          <Stat
            label="Conflits"
            value={String(stats.unresolvedConflicts)}
            hint={stats.unresolvedConflicts > 0 ? 'à vérifier' : 'aucun'}
          />
        </section>
      ) : null}

      <StaffSection staff={staff} eventId={id} />

      {unresolved.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-h3 font-bold">Doubles scans à vérifier</h2>

          {/* Expliquer AVANT de lister : sans ce contexte, l'organisateur croit
              à une faute d'un contrôleur, alors que personne n'a mal agi. */}
          <Alert tone="warning" title="Ce que signifie un double scan">
            Deux contrôleurs hors ligne ont validé le même billet sans pouvoir se coordonner. Une
            seule entrée a été retenue — la plus ancienne. Vérifie si la même personne est passée
            deux fois, ou si un billet a été partagé.
          </Alert>

          <ul className="flex flex-col gap-2">
            {unresolved.map((conflict) => (
              <li key={conflict.id}>
                <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body font-bold">{conflict.attendeeName}</span>
                    <span className="tabular text-micro text-text-3">
                      {conflict.ticketReference}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <ScanSide label="Entrée retenue" scan={conflict.winning} tone="success" />
                    <ScanSide label="Scan écarté" scan={conflict.losing} tone="neutral" />
                  </div>
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold">Dernières entrées</h2>

        {history.length === 0 ? (
          <Surface variant="panel" padding="comfortable">
            <p className="text-body-s text-text-2">
              Aucune entrée enregistrée. Les scans apparaîtront ici dès que les contrôleurs
              synchroniseront.
            </p>
          </Surface>
        ) : (
          <Surface variant="panel" padding="none" className="overflow-hidden">
            <ul className="flex flex-col">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body font-semibold">{entry.attendeeName}</span>
                    <span className="text-micro text-text-3">
                      {new Date(entry.scannedAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {entry.gate ? ` · ${entry.gate}` : ''} · {entry.scannedByName}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {entry.wasOffline ? <Badge tone="neutral">Hors ligne</Badge> : null}
                    {entry.revokedAt ? (
                      <Badge tone="danger">Annulée</Badge>
                    ) : entry.isEffective ? (
                      <Badge tone="success">Entré</Badge>
                    ) : (
                      <Badge tone="warning">Écarté</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </section>
    </div>
  );
}

function ScanSide({
  label,
  scan,
  tone,
}: {
  label: string;
  scan: { scannedAt: string; gate: string | null; scannedByName: string };
  tone: 'success' | 'neutral';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-surface-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="tabular text-body font-semibold">
        {new Date(scan.scannedAt).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </p>
      <p className="text-micro text-text-3">
        {scan.scannedByName}
        {scan.gate ? ` · ${scan.gate}` : ''}
      </p>
    </div>
  );
}

/**
 * L'équipe qui tient les portes, et ce que chacun a fait.
 *
 * ── Pourquoi cette liste est ici et pas sur la page Équipe ──────────────────
 * La page Équipe dit qui est membre. Celle-ci dit qui a scanné, combien, à
 * quelle porte, et jusqu'à quand son accès reste ouvert — c'est ce qu'un
 * organisateur regarde le lendemain, pour payer ses bénévoles. Un contrôleur
 * dont l'accès est terminé y figure toujours : ses scans lui restent
 * attribués.
 */
function StaffSection({ staff, eventId }: { staff: EventStaffMember[]; eventId: string }) {
  const now = Date.now();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-h3 font-bold">Équipe de contrôle</h2>
        <Link href="/pro/equipe" className="text-body-s font-semibold text-text-2">
          Inviter quelqu’un
        </Link>
      </div>

      {staff.length === 0 ? (
        <Surface variant="panel" padding="comfortable">
          <p className="text-body-s text-text-2">
            Personne n’est encore assigné à cet événement. Invite un contrôleur depuis la page
            Équipe, en indiquant son numéro : il rejoindra l’équipe dès sa connexion.
          </p>
        </Surface>
      ) : (
        <Surface variant="panel" padding="none">
          <ul className="divide-y divide-border">
            {staff.map((member) => {
              const ended =
                member.accessEndsAt !== null && new Date(member.accessEndsAt).getTime() <= now;
              const roleLabel = ORG_ROLE_DEFINITIONS[member.role as OrgRole]?.label ?? member.role;

              return (
                <li
                  key={member.userId}
                  className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body font-semibold">
                      {member.fullName || member.phone}
                    </span>
                    <span className="text-micro text-text-3">
                      {roleLabel}
                      {member.gate ? ` · ${member.gate}` : ''}
                      {member.fullName ? ` · ${member.phone}` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-body-s">
                    <span className="tabular font-semibold">
                      {member.scanCount} {member.scanCount > 1 ? 'entrées' : 'entrée'}
                    </span>
                    {member.lastScanAt ? (
                      <span className="text-text-3">
                        dernière à{' '}
                        {new Date(member.lastScanAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : null}
                    {member.accessEndsAt ? (
                      <Badge tone={ended ? 'neutral' : 'success'}>
                        {ended ? 'Accès terminé' : 'Accès ouvert'}
                      </Badge>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      <p className="text-micro text-text-3">
        L’accès d’un contrôleur se ferme de lui-même 24 h après la fin de l’événement. Ses entrées
        restent comptées ici — de quoi le payer.{' '}
        <Link
          href={`/scan/${eventId}`}
          className="font-semibold text-text-2 underline underline-offset-2"
        >
          Tu peux aussi scanner toi-même.
        </Link>
      </p>
    </section>
  );
}
