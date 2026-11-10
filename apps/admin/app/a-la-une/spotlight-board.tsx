'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ImageOff } from 'lucide-react';
import {
  SPOTLIGHT_PHASE_LABELS,
  type SpotlightAdmin,
  type SpotlightPhase,
} from '@nexakabi/contracts';
import { Alert, Badge, Button, Surface, cn } from '@nexakabi/ui';
import { formatPortoNovo } from './dates';

/**
 * Les mises en avant en cours et programmées, dans l'ordre de la une.
 *
 * ── Pourquoi l'écran dit ce que la une ne montre pas ────────────────────────
 * Une mise en avant « en ligne » peut ne pas paraître : son événement a été
 * annulé, il est complet, ou la une est déjà pleine. La console le dit sur la
 * ligne même — sinon on cherche longtemps pourquoi on ne la voit pas.
 */
export function ActiveSpotlights({
  items,
  maxSlides,
  canAct,
}: {
  items: SpotlightAdmin[];
  maxSlides: number;
  canAct: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = React.useState(items);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setOrder(items), [items]);

  // Ce que la une affichera vraiment : par pays, dans l'ordre, les premières
  // qui peuvent paraître, jusqu'au plafond.
  const overflow = React.useMemo(() => {
    const shown = new Map<string, number>();
    const beyond = new Set<string>();

    for (const item of order) {
      if (item.phase !== 'LIVE' || item.hiddenReason) continue;
      const count = (shown.get(item.countryCode) ?? 0) + 1;
      shown.set(item.countryCode, count);
      if (count > maxSlides) beyond.add(item.id);
    }

    return beyond;
  }, [order, maxSlides]);

  async function move(index: number, delta: number) {
    const next = [...order];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);

    const previous = order;
    setOrder(next);
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/spotlights/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((entry) => entry.id) }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setOrder(previous);
        setError(payload?.message ?? 'Le nouvel ordre n’a pas pu être enregistré.');
        return;
      }

      router.refresh();
    } catch {
      setOrder(previous);
      setError('L’API n’est pas joignable.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Surface variant="panel" padding="none" className="overflow-hidden">
        <ol>
          {order.map((item, index) => (
            <li key={item.id} className="border-b border-border-subtle last:border-0">
              <SpotlightRow
                item={item}
                canAct={canAct}
                notice={
                  overflow.has(item.id) ? `Hors une : au-delà des ${maxSlides} places.` : null
                }
                reorder={
                  canAct ? (
                    <div className="flex shrink-0 flex-col">
                      <IconButton
                        label="Monter"
                        disabled={saving || index === 0}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Descendre"
                        disabled={saving || index === order.length - 1}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </IconButton>
                    </div>
                  ) : null
                }
              />
            </li>
          ))}
        </ol>
      </Surface>
    </div>
  );
}

/** Terminées et retirées : pour leur bilan, sans action. */
export function PastSpotlights({ items }: { items: SpotlightAdmin[] }) {
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-border-subtle last:border-0">
            <SpotlightRow item={item} canAct={false} notice={null} reorder={null} />
          </li>
        ))}
      </ul>
    </Surface>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const PHASE_TONES: Record<SpotlightPhase, 'success' | 'info' | 'neutral'> = {
  LIVE: 'success',
  SCHEDULED: 'info',
  ENDED: 'neutral',
  WITHDRAWN: 'neutral',
};

function SpotlightRow({
  item,
  canAct,
  notice,
  reorder,
}: {
  item: SpotlightAdmin;
  canAct: boolean;
  notice: string | null;
  reorder: React.ReactNode;
}) {
  const editable = canAct && (item.phase === 'LIVE' || item.phase === 'SCHEDULED');
  const subtitle = [
    `${formatPortoNovo(item.startsAt)} → ${formatPortoNovo(item.endsAt)}`,
    item.countryCode,
    item.event?.organizationName ??
      (item.external ? `Vente : ${item.external.organizerName}` : null),
  ]
    .filter(Boolean)
    .join(' · ');

  const rate =
    item.stats.views > 0
      ? `${((item.stats.clicks / item.stats.views) * 100).toLocaleString('fr-FR', {
          maximumFractionDigits: 1,
        })} %`
      : '—';

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {reorder}

        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-[10px] bg-ink">
          {item.displayImageUrl ? (
            <img
              src={item.displayImageUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <ImageOff className="absolute inset-0 m-auto size-4 text-white/40" aria-hidden />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-body-s font-bold">{item.title}</span>
            <Badge tone={PHASE_TONES[item.phase]} dot={item.phase === 'LIVE'}>
              {SPOTLIGHT_PHASE_LABELS[item.phase]}
            </Badge>
            {item.kind === 'EXTERNAL' ? <Badge tone="warning">Externe</Badge> : null}
            {item.source === 'PAID' ? (
              <Badge tone="accent">
                {item.bookingReference ? `Place achetée · ${item.bookingReference}` : 'Place payée'}
              </Badge>
            ) : null}
            {item.video ? <Badge tone="neutral">Vidéo {item.video.durationSeconds} s</Badge> : null}
          </div>
          <p className="truncate text-micro text-text-3">{subtitle}</p>
          {item.hiddenReason ? (
            <p className="text-micro font-semibold text-amber-700">
              Masquée de la une : {item.hiddenReason.toLowerCase()}.
            </p>
          ) : notice ? (
            <p className="text-micro font-semibold text-amber-700">{notice}</p>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-3 text-right md:w-[300px]">
        <Figure label="Vues" value={item.stats.views.toLocaleString('fr-FR')} />
        <Figure label="Clics" value={item.stats.clicks.toLocaleString('fr-FR')} />
        <Figure label="Taux" value={rate} />
        <Figure
          label="Billets"
          value={item.stats.tickets === null ? '—' : item.stats.tickets.toLocaleString('fr-FR')}
        />
      </dl>

      {editable ? (
        <div className="flex shrink-0 gap-2 md:w-[188px] md:justify-end">
          {/* Une place achetée se diffuse telle qu'elle a été vendue : elle se
              retire, elle ne se modifie pas. */}
          {item.bookingId ? null : (
            <Button asChild variant="secondary" size="compact">
              <Link href={`/a-la-une/${item.id}`}>Modifier</Link>
            </Button>
          )}
          <WithdrawButton id={item.id} title={item.title} paid={Boolean(item.bookingId)} />
        </div>
      ) : (
        <div className="hidden md:block md:w-[188px]" />
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-micro text-text-3">{label}</dt>
      <dd className="text-body-s font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Retirer en deux temps : le premier clic propose, le second décide.
 *
 * Une place achetée s'interrompt : ses jours non commencés reviennent en avoir
 * à l'organisateur — sauf décision contraire, qui exige un motif (un contenu
 * trompeur ne se rembourse pas).
 */
function WithdrawButton({ id, title, paid }: { id: string; title: string; paid: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [withhold, setWithhold] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function withdraw() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/spotlights/${encodeURIComponent(id)}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          paid
            ? { compensate: !withhold, ...(reason.trim() ? { reason: reason.trim() } : {}) }
            : {},
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? 'Le retrait a échoué.');
        return;
      }

      router.refresh();
    } catch {
      setError('L’API n’est pas joignable.');
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="tertiary"
          size="compact"
          onClick={() => setConfirming(true)}
          aria-label={`Retirer « ${title} » de la une`}
        >
          Retirer
        </Button>
        {error ? (
          <span role="alert" className="text-micro font-semibold text-red-700">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {paid ? (
        <div className="flex w-[260px] flex-col gap-1.5 text-left">
          <p className="text-micro text-text-2">
            Place achetée : les jours non commencés seront rendus en avoir à l’organisateur.
          </p>
          <label className="flex items-center gap-2 text-micro font-semibold">
            <input
              type="checkbox"
              checked={withhold}
              onChange={(event) => setWithhold(event.target.checked)}
            />
            Ne rien rendre (contenu non conforme)
          </label>
          {withhold || reason ? (
            <textarea
              aria-label="Motif du retrait"
              placeholder="Motif — l’organisateur le lira."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="rounded-[10px] border border-border-field bg-surface px-2 py-1.5 text-micro"
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ink"
          size="compact"
          loading={pending}
          disabled={paid && withhold && reason.trim().length < 10}
          onClick={() => void withdraw()}
        >
          Confirmer
        </Button>
        <Button
          type="button"
          variant="tertiary"
          size="compact"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Annuler
        </Button>
      </div>
      {error ? (
        <span role="alert" className="text-micro font-semibold text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-button text-text-2 transition',
        'hover:bg-paper hover:text-text-strong disabled:opacity-35',
      )}
    >
      {children}
    </button>
  );
}
