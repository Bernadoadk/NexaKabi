import * as React from 'react';
import { formatAmount, formatEventCaptionWithTime, resolveCurrency } from '@nexakabi/utils';
import { cn } from '../lib/cn';
import { Badge } from './badge';
import { Button } from './button';
import { CoverImage } from './cover-image';
import { DateChip } from './stat';
import { Money } from './money';

/**
 * Carte d'événement — quatre variantes d'un même composant.
 *
 * Relevées telles quelles dans le prototype :
 *
 *  large      300×330, image plein cadre, dégradé encre, badges en haut,
 *             bloc texte en bas. Sections principales de l'accueil.
 *  standard   image 16:9 de 132 px, corps blanc, pied séparé prix / places.
 *             Listes et grilles de découverte.
 *  horizontal vignette 1:1 de 94 px, bouton « Billet » à droite.
 *             Mobile et recommandations.
 *  compact    PAS d'image — pastille de date. Tableaux de bord.
 *
 * Sans image, l'événement retombe sur une plaque typographique colorée dérivée
 * de sa catégorie : jamais de rectangle gris.
 */

export interface EventCardData {
  slug: string;
  title: string;
  startsAt: Date;
  venueName?: string;
  cityName?: string;
  categoryName?: string;
  /** Couleur de repli dérivée de la catégorie, quand il n'y a pas d'image. */
  categoryColor?: string;
  coverImageUrl?: string | null;
  /** Prix du billet le moins cher, en unité entière. `0` pour un événement gratuit. */
  fromPrice?: number;
  /** Frais annoncés dès la carte : « 5 000 FCFA + 250 de frais ». */
  feeAmount?: number;
  /** Devise de l'événement. Absente : celle par défaut de la plateforme. */
  currency?: string | null;
  remainingSeats?: number;
  isSoldOut?: boolean;
  isAlmostSoldOut?: boolean;
  ageRestriction?: string;
}

interface BaseProps {
  event: EventCardData;
  href?: string;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Visuel de couverture, avec repli typographique coloré. */
function Cover({
  event,
  className,
  children,
}: {
  event: EventCardData;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-ink', className)}>
      {/* Plaque typographique dérivée de la catégorie — jamais un rectangle
         gris. Toujours posée en fond : elle se voit d'emblée sans image, et
         réapparaît si l'image ci-dessous échoue à charger (`CoverImage` se
         retire alors silencieusement plutôt que d'afficher une icône rompue).
         Seule la COULEUR vient de la catégorie : en répéter le nom ferait
         doublon avec le badge déjà posé sur la carte. */}
      <div
        className="absolute inset-0 flex items-center justify-center px-4 text-center"
        style={{ background: event.categoryColor ?? 'var(--color-ink-700)' }}
      >
        <span className="font-display text-[13px] font-extrabold uppercase tracking-[0.2em] text-white/25">
          Nexa-Kabi
        </span>
      </div>

      {event.coverImageUrl ? (
        <CoverImage src={event.coverImageUrl} className="size-full object-cover" />
      ) : null}

      {children}
    </div>
  );
}

function PriceLabel({ event, className }: { event: EventCardData; className?: string }) {
  if (event.fromPrice === undefined) return null;

  if (event.fromPrice === 0) {
    // `self-start` : sans lui, le badge s'étire sur toute la largeur d'un
    // conteneur en colonne, dont les enfants sont étirés par défaut.
    return (
      <Badge tone="accent" className={cn('self-start', className)}>
        Gratuit
      </Badge>
    );
  }

  const currency = resolveCurrency(event.currency);

  return (
    <span className={cn('flex items-baseline gap-1.5', className)}>
      <Money amount={event.fromPrice} currency={currency.code} size="default" hideSymbol />
      <span className="text-[12px] text-text-2">
        {/* « 5 000 FCFA + 250 de frais » — les frais sont annoncés dès la carte,
            jamais découverts au récapitulatif. */}
        {event.feeAmount ? (
          <>
            {currency.symbol} + {formatAmount(event.feeAmount, currency.code)} de frais
          </>
        ) : (
          currency.symbol
        )}
      </span>
    </span>
  );
}

function StatusBadge({ event }: { event: EventCardData }) {
  if (event.isSoldOut) return <Badge tone="neutral">Complet</Badge>;
  if (event.isAlmostSoldOut) return <Badge tone="overlay-accent">Bientôt complet</Badge>;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Variante large — sections principales. Image 3:4, texte superposé. */
export function EventCardLarge({ event, href, className }: BaseProps) {
  const Root = href ? 'a' : 'div';

  return (
    <Root
      {...(href ? { href } : {})}
      className={cn(
        'group relative block h-[330px] overflow-hidden rounded-panel shadow-md',
        'transition-shadow duration-(--duration-hover) hover:shadow-lg',
        className,
      )}
    >
      <Cover event={event} className="absolute inset-0" />
      <div aria-hidden="true" className="ink-scrim pointer-events-none absolute inset-0" />

      <div className="pointer-events-none absolute left-3.5 top-3.5 flex gap-1.5">
        {event.categoryName ? <Badge tone="overlay">{event.categoryName}</Badge> : null}
        <StatusBadge event={event} />
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex flex-col gap-1.5 text-white">
        <div className="eyebrow text-coral-200">{formatEventCaptionWithTime(event.startsAt)}</div>
        <h3 className="font-display text-[23px] font-bold leading-tight tracking-[-0.02em]">
          {event.title}
        </h3>
        {event.venueName || event.cityName ? (
          <p className="text-body-s text-on-ink-soft">
            {[event.venueName, event.cityName].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <PriceLabel event={event} className="mt-1 text-white [&_.text-text-2]:text-on-ink-soft" />
      </div>
    </Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Variante standard — listes et grilles. Image 16:9, corps blanc. */
export function EventCardStandard({ event, href, className }: BaseProps) {
  const Root = href ? 'a' : 'div';

  return (
    <Root
      {...(href ? { href } : {})}
      className={cn(
        'group block overflow-hidden rounded-[16px] border border-border bg-surface',
        'transition-shadow duration-(--duration-hover) hover:shadow-md',
        className,
      )}
    >
      <Cover event={event} className="h-[132px]">
        <div className="pointer-events-none absolute right-2.5 top-2.5 flex gap-1.5">
          {event.categoryName ? <Badge tone="overlay">{event.categoryName}</Badge> : null}
          <StatusBadge event={event} />
        </div>
      </Cover>

      <div className="flex flex-col gap-1.5 px-3.5 pb-4 pt-3.5">
        <div className="text-caption font-bold uppercase tracking-[0.1em] text-coral">
          {formatEventCaptionWithTime(event.startsAt)}
        </div>
        <h3 className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-text-strong">
          {event.title}
        </h3>
        {event.venueName || event.cityName ? (
          <p className="text-body-s text-text-2">
            {[event.venueName, event.cityName].filter(Boolean).join(' · ')}
          </p>
        ) : null}

        <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2.5">
          <PriceLabel event={event} />
          {event.remainingSeats !== undefined ? (
            <span className="text-micro text-text-3">{event.remainingSeats} places</span>
          ) : null}
        </div>
      </div>
    </Root>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface EventCardHorizontalProps extends BaseProps {
  actionLabel?: string;
  onAction?: () => void;
}

/** Variante horizontale — mobile et recommandations. Vignette 1:1. */
export function EventCardHorizontal({
  event,
  href,
  actionLabel = 'Billet',
  onAction,
  className,
}: EventCardHorizontalProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[16px] border border-border bg-surface p-3',
        className,
      )}
    >
      <Cover event={event} className="size-[94px] shrink-0 rounded-[12px]" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-caption font-bold uppercase tracking-[0.1em] text-coral">
          {formatEventCaptionWithTime(event.startsAt)}
        </div>
        <h3 className="truncate text-[15px] font-bold leading-tight">
          {href ? (
            <a href={href} className="text-text-strong hover:text-coral">
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </h3>
        <p className="truncate text-body-s text-text-2">
          {[event.venueName, event.cityName, event.ageRestriction].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <PriceLabel event={event} />
          {event.isSoldOut ? (
            <Badge tone="neutral">Complet</Badge>
          ) : (
            <Badge tone="success">Places dispo.</Badge>
          )}
        </div>
      </div>

      <Button variant="primary" size="default" onClick={onAction} className="shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface EventCardCompactProps extends BaseProps {
  /** Ligne secondaire : « 18h00 · Fidjrossè · 2 billets ». */
  detail?: React.ReactNode;
  status?: React.ReactNode;
}

/**
 * Variante compacte — tableaux de bord. Pas d'image, une pastille de date.
 * Justification du prototype : « dans un dashboard, la photo n'aide pas à
 * décider et coûte de la bande passante ».
 */
export function EventCardCompact({
  event,
  href,
  detail,
  status,
  className,
}: EventCardCompactProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-[12px] bg-paper px-3.5 py-3', className)}>
      <DateChip date={event.startsAt} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold">
          {href ? (
            <a href={href} className="text-text-strong hover:text-coral">
              {event.title}
            </a>
          ) : (
            event.title
          )}
        </div>
        {detail ? <div className="truncate text-micro text-text-2">{detail}</div> : null}
      </div>

      {status ? <div className="shrink-0">{status}</div> : null}
    </div>
  );
}
