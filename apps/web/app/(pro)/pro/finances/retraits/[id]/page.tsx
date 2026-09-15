import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { PAYOUT_STATUS_LABELS, type Payout } from '@nexakabi/contracts';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { Alert, Badge, Money, Surface } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { orgFetch, resolveActiveOrganization } from '@/lib/organizations';

export const metadata: Metadata = { title: 'Détail du retrait' };

/**
 * Écran O12 — détail d'un retrait.
 *
 * ── Ce qu'il doit dire, surtout en cas d'échec ──────────────────────────────
 * Un retrait qui échoue est le moment où un organisateur doute de la
 * plateforme. Cet écran doit donc répondre à trois choses sans qu'il ait à
 * demander : **où est mon argent**, **pourquoi ça a échoué**, **que faire
 * maintenant**. Un statut « Échoué » sans explication ferait appeler le support
 * — ou pire, partir.
 *
 * `GET /organizer/finance/payouts/:id` n'a pas de segment `eventId` dont
 * l'organisation pourrait se déduire : comme pour `finances/page.tsx`,
 * l'en-tête `X-Organization-Id` est obligatoire (voir `orgFetch`).
 */
export default async function PayoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?suite=/pro/finances`);

  const { active } = await resolveActiveOrganization();
  if (!active) redirect('/pro');

  const result = await orgFetch<Payout>(
    active.id,
    `/organizer/finance/payouts/${encodeURIComponent(id)}`,
  );

  if (!result.ok) {
    if (result.error.statusCode === 404) notFound();

    return (
      <Alert tone="danger" title="Retrait inaccessible">
        {result.error.message}
      </Alert>
    );
  }

  const payout = result.data;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link href="/pro/finances" className="text-body-s text-text-2 hover:text-text-strong">
          ← Finances
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">
            Retrait <span className="tabular">{payout.reference}</span>
          </h1>
          <StatusBadge status={payout.status} />
        </div>
      </header>

      {payout.status === 'FAILED' ? (
        <Alert tone="danger" title="Ce retrait n’a pas abouti">
          {payout.failureReason}
          <p className="mt-2">
            <span className="font-semibold">Le montant est revenu sur ton solde.</span> Corrige le
            compte de destination, puis fais une nouvelle demande.
          </p>
        </Alert>
      ) : null}

      {payout.status === 'PROCESSING' ? (
        <Alert tone="info" title="Virement en cours">
          L’ordre est parti chez l’opérateur. Les fonds arrivent généralement sous 24 h ouvrées.
        </Alert>
      ) : null}

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-4">
          <p className="eyebrow text-text-3">Montant reçu</p>
          <Money amount={payout.netAmount} size="hero" />
        </div>

        <dl className="flex flex-col gap-2 px-5 py-4">
          <Row label="Montant demandé">
            <Money amount={payout.grossAmount} size="small" />
          </Row>
          <Row label="Frais de retrait">
            <Money amount={-payout.feeAmount} size="small" showSign />
          </Row>

          <div className="my-1 h-px bg-border-subtle" />

          <Row label="Compte">
            <span className="text-body-s font-semibold">{payout.accountLabel}</span>
          </Row>
          <Row label="Numéro">
            <span className="tabular text-body-s">{payout.accountMaskedNumber}</span>
          </Row>
        </dl>
      </Surface>

      {/* Une chronologie plutôt qu'un statut isolé : l'organisateur voit où en
          est sa demande, et ce qui reste à venir. */}
      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-body font-bold">Suivi</h2>
        </div>
        <ol className="flex flex-col">
          <Step label="Demande enregistrée" at={payout.requestedAt} done />
          <Step
            label="Transmis à l’opérateur"
            at={payout.processedAt}
            done={payout.processedAt !== null}
          />
          <Step
            label={payout.status === 'FAILED' ? 'Échec' : 'Fonds reçus'}
            at={payout.completedAt}
            done={payout.completedAt !== null}
            failed={payout.status === 'FAILED'}
          />
        </ol>
      </Surface>
    </div>
  );
}

function StatusBadge({ status }: { status: Payout['status'] }) {
  const tone =
    status === 'PAID'
      ? 'success'
      : status === 'FAILED'
        ? 'danger'
        : status === 'PROCESSING'
          ? 'info'
          : 'neutral';

  return <Badge tone={tone}>{PAYOUT_STATUS_LABELS[status]}</Badge>;
}

function Step({
  label,
  at,
  done,
  failed = false,
}: {
  label: string;
  at: string | null;
  done: boolean;
  failed?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0">
      <span
        className={
          failed
            ? 'grid size-6 shrink-0 place-items-center rounded-full bg-red-50 text-red-700'
            : done
              ? 'grid size-6 shrink-0 place-items-center rounded-full bg-mint-50 text-mint-700'
              : 'grid size-6 shrink-0 place-items-center rounded-full bg-fill-neutral text-text-3'
        }
        aria-hidden
      >
        {failed ? (
          <X className="size-3.5" strokeWidth={3} />
        ) : done ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>

      <span className="flex-1 text-body-s font-semibold">{label}</span>

      {at ? (
        <span className="text-micro text-text-3">{formatEventCaptionWithTime(new Date(at))}</span>
      ) : null}
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-text-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
