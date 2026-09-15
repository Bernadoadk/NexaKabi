'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Eye, EyeOff, MapPin, Pencil, Rocket, Trash2, Users } from 'lucide-react';
import { EVENT_WIZARD_STEPS, type EventSummary } from '@nexakabi/contracts';
import {
  Alert,
  Badge,
  Button,
  CategoryIcon,
  CoverImage,
  Dialog,
  Money,
  SuccessDialog,
  cn,
} from '@nexakabi/ui';
import { formatEventCaption, formatTimeCompact } from '@nexakabi/utils';
import { deleteEventAction, publishEventAction, unpublishEventAction } from '../actions';
import { EventStatusBadge } from './event-status-badge';

/**
 * Carte d'un événement, côté organisateur.
 *
 * ── Ce que la carte fait ────────────────────────────────────────────────────
 * Elle montre ce que voit un participant — visuel, date, heure, lieu, prix —
 * plus ce que lui seul doit savoir : l'état, les ventes, l'étape où un
 * brouillon a été laissé. Cliquer sur la carte ouvre l'APERÇU de la page
 * publique ; les actions sont au pied : modifier, publier ou dépublier,
 * supprimer. Chacune des deux dernières confirme avant d'agir, en disant ce
 * qui va se passer — jamais un simple « Êtes-vous sûr ? ».
 *
 * ── Ce qu'elle n'autorise pas ───────────────────────────────────────────────
 * Un événement qui a vendu ne se dépublie ni ne se supprime : il s'annule,
 * depuis l'assistant, avec remboursement. Les boutons le disent au lieu de
 * disparaître — un bouton absent ressemble à un oubli, un bouton qui explique
 * ressemble à une règle.
 */
export function OrganizerEventCard({
  event,
  organizationId,
}: {
  event: EventSummary;
  organizationId: string;
}) {
  const router = useRouter();
  const startsAt = new Date(event.startsAt);
  const live = event.status === 'PUBLISHED' || event.status === 'SOLD_OUT';
  const pendingReview = event.status === 'PENDING_REVIEW';
  const draftLike = event.status === 'DRAFT' || event.status === 'REJECTED';
  const terminal =
    event.status === 'CANCELLED' || event.status === 'COMPLETED' || event.status === 'ARCHIVED';
  const sold = event.ticketsSold ?? 0;
  const past = new Date(event.endsAt).getTime() < Date.now();

  const previewHref = `/pro/evenements/${event.id}/apercu`;
  const editHref = `/pro/evenements/${event.id}`;
  const step = event.draftStep ?? 1;
  const stepLabel = EVENT_WIZARD_STEPS.find((entry) => entry.step === step)?.label;

  const [confirm, setConfirm] = React.useState<'publish' | 'unpublish' | 'delete' | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<string[] | null>(null);
  const [published, setPublished] = React.useState(false);

  async function run(action: 'publish' | 'unpublish' | 'delete') {
    setPending(true);
    setError(null);

    const result =
      action === 'publish'
        ? await publishEventAction(organizationId, event.id)
        : action === 'unpublish'
          ? await unpublishEventAction(organizationId, event.id)
          : await deleteEventAction(organizationId, event.id);

    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (action === 'publish') {
      const left = (result.data as { missing: string[] }).missing;
      if (left.length > 0) {
        setMissing(left);
        return;
      }
      setConfirm(null);
      setPublished(true);
    } else {
      setConfirm(null);
    }

    router.refresh();
  }

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-[16px] border border-border bg-surface',
        'transition-shadow duration-(--duration-hover) hover:shadow-md',
        terminal && 'opacity-80',
      )}
    >
      <Link
        href={previewHref}
        aria-label={`Aperçu de « ${event.title} »`}
        className="relative block h-[150px] overflow-hidden bg-ink"
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: event.categoryColor }}
        >
          <CategoryIcon slug={event.categorySlug} className="size-12 text-white/20" strokeWidth={1.5} />
        </div>
        {event.coverImageUrl ? (
          <CoverImage src={event.coverImageUrl} className="size-full object-cover" />
        ) : null}
        <div aria-hidden className="ink-scrim-soft pointer-events-none absolute inset-0" />

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          <EventStatusBadge status={event.status} />
          {event.visibility === 'PRIVATE' ? <Badge tone="overlay">Privé · par lien</Badge> : null}
        </div>
        <div className="pointer-events-none absolute right-2.5 top-2.5">
          <Badge tone="overlay">
            <CategoryIcon slug={event.categorySlug} className="size-3" strokeWidth={2.5} />
            {event.categoryName}
          </Badge>
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2 text-white">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-coral-200">
            {formatEventCaption(startsAt)} · {formatTimeCompact(startsAt)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10.5px] font-semibold backdrop-blur transition-colors group-hover:bg-white/25">
            <Eye className="size-3" aria-hidden />
            Aperçu
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3 pt-3">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-tight tracking-[-0.01em] text-text-strong">
          <Link href={previewHref} className="text-text-strong hover:text-coral">
            {event.title}
          </Link>
        </h3>

        <p className="flex items-start gap-1.5 text-body-s text-text-2">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-text-3" aria-hidden />
          <span className="line-clamp-1">
            {[event.venueName, event.cityName].filter(Boolean).join(' · ') || 'Lieu à définir'}
          </span>
        </p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-subtle pt-2.5">
          <span className="flex items-baseline gap-1">
            {event.fromPrice === null ? (
              <span className="text-body-s text-text-3">Aucun billet</span>
            ) : event.fromPrice === 0 ? (
              <Badge tone="accent">Gratuit</Badge>
            ) : (
              <>
                <span className="text-micro text-text-3">Dès</span>
                <Money amount={event.fromPrice} size="small" />
              </>
            )}
          </span>

          {draftLike ? (
            <span className="inline-flex items-center gap-1 text-micro font-semibold text-amber-700">
              <Clock className="size-3" aria-hidden />
              Étape {step}/8 · {stepLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-micro font-semibold text-text-2">
              <Users className="size-3" aria-hidden />
              {sold} vendu{sold > 1 ? 's' : ''}
              {event.remainingSeats !== null ? ` · ${event.remainingSeats} restants` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border bg-surface-alt px-2 py-1.5">
        <CardAction href={editHref} icon={<Pencil />} label={draftLike ? 'Reprendre' : 'Modifier'} />
        <CardAction href={previewHref} icon={<Eye />} label="Aperçu" />

        {draftLike ? (
          <CardAction
            icon={<Rocket />}
            label="Publier"
            tone="accent"
            onClick={() => setConfirm('publish')}
          />
        ) : null}

        {(live || pendingReview) && !past ? (
          <CardAction
            icon={<EyeOff />}
            label={pendingReview ? 'Retirer' : 'Dépublier'}
            onClick={() => setConfirm('unpublish')}
            disabledReason={
              sold > 0
                ? 'Des billets ont été vendus : l’événement peut être annulé, pas dépublié.'
                : undefined
            }
          />
        ) : null}

        <span className="flex-1" />

        <CardAction
          icon={<Trash2 />}
          label="Supprimer"
          tone="danger"
          compact
          onClick={() => setConfirm('delete')}
          disabledReason={
            live && sold > 0
              ? 'Des billets ont été vendus : annule d’abord l’événement.'
              : undefined
          }
        />
      </div>

      {/* ── Confirmations ─────────────────────────────────────────────────── */}
      <Dialog
        open={confirm === 'publish'}
        onOpenChange={(open) => {
          if (!pending && !open) {
            setConfirm(null);
            setMissing(null);
            setError(null);
          }
        }}
        title="Publier cet événement ?"
        description={`« ${event.title} » deviendra visible dans la découverte et sa billetterie ouvrira. Un premier événement passe d’abord par une courte vérification.`}
      >
        {error ? (
          <Alert tone="danger" title="Publication impossible">
            {error}
          </Alert>
        ) : null}
        {missing && missing.length > 0 ? (
          <Alert tone="warning" title="Il reste à compléter avant de publier">
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="mobile" disabled={pending} onClick={() => setConfirm(null)}>
            Revenir
          </Button>
          {missing && missing.length > 0 ? (
            <Button asChild variant="ink" size="mobile">
              <Link href={editHref}>Compléter →</Link>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="mobile"
              loading={pending}
              loadingLabel="Publication…"
              onClick={() => void run('publish')}
            >
              Publier
            </Button>
          )}
        </div>
      </Dialog>

      <Dialog
        open={confirm === 'unpublish'}
        onOpenChange={(open) => {
          if (!pending && !open) {
            setConfirm(null);
            setError(null);
          }
        }}
        title={pendingReview ? 'Retirer de la vérification ?' : 'Dépublier cet événement ?'}
        description={
          pendingReview
            ? `« ${event.title} » redevient un brouillon : tu pourras le compléter et le soumettre à nouveau.`
            : `« ${event.title} » disparaît de la découverte et sa billetterie ferme. Il redevient un brouillon, que tu pourras republier quand tu veux.`
        }
      >
        {error ? (
          <Alert tone="danger" title="Action impossible">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="mobile" disabled={pending} onClick={() => setConfirm(null)}>
            Revenir
          </Button>
          <Button
            variant="ink"
            size="mobile"
            loading={pending}
            loadingLabel="Un instant…"
            onClick={() => void run('unpublish')}
          >
            {pendingReview ? 'Retirer' : 'Dépublier'}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={confirm === 'delete'}
        onOpenChange={(open) => {
          if (!pending && !open) {
            setConfirm(null);
            setError(null);
          }
        }}
        title="Supprimer cet événement ?"
        description={`« ${event.title} » sera retiré de ta liste. ${
          live
            ? 'Il est en ligne : il disparaîtra aussi de la découverte.'
            : 'Son brouillon, ses visuels et ses catégories de billets ne seront plus accessibles.'
        } Cette action est irréversible.`}
      >
        {error ? (
          <Alert tone="danger" title="Suppression impossible">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="mobile" disabled={pending} onClick={() => setConfirm(null)}>
            Revenir
          </Button>
          <Button
            variant="destructive-solid"
            size="mobile"
            loading={pending}
            loadingLabel="Suppression…"
            onClick={() => void run('delete')}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>

      <SuccessDialog
        open={published}
        onOpenChange={setPublished}
        title="Événement publié"
        description="Il est désormais visible dans la découverte, et la billetterie est ouverte."
      >
        <Button asChild variant="primary" size="mobile" block>
          <Link href={`/e/${event.slug}`}>Voir la page publique →</Link>
        </Button>
      </SuccessDialog>
    </article>
  );
}

/** Un bouton de pied de carte : icône + libellé, 44 px de haut, jamais coloré seul. */
function CardAction({
  href,
  icon,
  label,
  tone = 'default',
  compact = false,
  onClick,
  disabledReason,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  tone?: 'default' | 'accent' | 'danger';
  /** Icône seule sous le palier `sm`, pour que les quatre actions tiennent sur une ligne. */
  compact?: boolean;
  onClick?: () => void;
  disabledReason?: string;
}) {
  const text = <span className={compact ? 'hidden sm:inline' : undefined}>{label}</span>;
  const className = cn(
    'inline-flex min-h-[40px] items-center gap-1.5 rounded-[9px] px-2.5 text-body-s font-semibold transition-colors [&>svg]:size-4',
    tone === 'default' && 'text-text-2 hover:bg-surface hover:text-text-strong',
    tone === 'accent' && 'text-coral-700 hover:bg-coral-50',
    tone === 'danger' && 'text-text-3 hover:bg-red-50 hover:text-red-700',
    disabledReason && 'cursor-not-allowed opacity-45 hover:bg-transparent',
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={compact ? label : undefined}>
        {icon}
        {text}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={disabledReason ? undefined : onClick}
      aria-disabled={disabledReason ? true : undefined}
      aria-label={compact ? label : undefined}
      title={disabledReason ?? (compact ? label : undefined)}
      className={className}
    >
      {icon}
      {text}
    </button>
  );
}
