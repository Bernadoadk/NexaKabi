import Link from 'next/link';
import { Check, Clock, MapPin } from 'lucide-react';
import type { EventDetail } from '@nexakabi/contracts';
import { Badge, Button, CategoryMark, CoverImage, Money, Surface, cn } from '@nexakabi/ui';
import { formatEventRange, formatTimeSpaced } from '@nexakabi/utils';
import { BuyPanel } from '@/app/(public)/e/[slug]/buy-panel';

/**
 * La page d'un événement — le composant que voient participants ET organisateur.
 *
 * ── Pourquoi un seul rendu pour deux écrans ─────────────────────────────────
 * `/e/[slug]` (public) et `/pro/evenements/[id]/apercu` (organisateur, avant
 * publication) affichent la MÊME page : un aperçu qui différerait de la page
 * réelle n'aurait aucune valeur — l'organisateur vérifie précisément ce que
 * ses participants verront. Le mode ne change que ce qui ne PEUT pas être
 * réel avant publication : la billetterie, désarmée en aperçu.
 *
 * Aucun accès serveur ici : les données arrivent en propriété, ce qui permet
 * à l'assistant de création (client) de rendre l'aperçu à l'étape 7.
 */
export interface EventPageViewProps {
  event: EventDetail;
  /** `public` : billetterie armée. `preview` : tout est visible, rien n'est achetable. */
  mode?: 'public' | 'preview';
  className?: string;
}

export function EventPageView({ event, mode = 'public', className }: EventPageViewProps) {
  const startsAt = new Date(event.startsAt);
  const isCancelled = event.status === 'CANCELLED';
  const preview = mode === 'preview';
  const where = [event.venueName, event.cityName].filter(Boolean).join(', ');

  return (
    <div className={cn(preview ? 'pb-4' : 'pb-24 lg:pb-8', className)}>
      <section
        className={cn(
          'relative overflow-hidden bg-ink',
          preview ? 'h-[240px] sm:h-[300px]' : 'h-[280px] sm:h-[340px]',
        )}
      >
        {/* Le fond de couleur reste posé même avec une image : si celle-ci
            échoue à charger, `CoverImage` se retire et laisse voir la teinte
            de catégorie plutôt que l'icône d'image rompue du navigateur. */}
        <div className="absolute inset-0" style={{ background: event.categoryColor }}>
          {event.coverImageUrl ? (
            <CoverImage src={event.coverImageUrl} className="size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.25em] text-white/20">
                Nexa-Kabi
              </span>
            </div>
          )}
        </div>

        <div aria-hidden className="ink-scrim absolute inset-0" />

        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[1440px] flex-col gap-2.5 px-5 pb-6 text-white">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="overlay-accent">{event.categoryName}</Badge>
            {event.minimumAge ? <Badge tone="overlay">{event.minimumAge} ans+</Badge> : null}
            {isCancelled ? <Badge tone="danger">Annulé</Badge> : null}
            {event.isAlmostSoldOut && !isCancelled ? (
              <Badge tone="overlay">Bientôt complet</Badge>
            ) : null}
          </div>

          <h1
            className={cn(
              'max-w-[760px] font-display font-bold tracking-[-0.035em]',
              preview
                ? 'text-[26px] leading-[1.08] sm:text-[36px] sm:leading-none'
                : 'text-h1 sm:text-[44px] sm:leading-none',
            )}
          >
            {event.title}
          </h1>

          <p className="text-[14.5px] text-on-ink-soft">
            {formatEventRange(startsAt, new Date(event.endsAt))}
            {where ? ` · ${where}` : ''}
          </p>
        </div>
      </section>

      <div
        className={cn(
          'mx-auto grid max-w-[1440px] gap-8 px-5 py-8',
          preview
            ? 'md:grid-cols-[1fr_320px] md:items-start'
            : 'lg:grid-cols-[1fr_360px] lg:items-start',
        )}
      >
        <div className="flex flex-col gap-8">
          {event.description ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-h2 font-bold">À propos</h2>
              <p className="max-w-[68ch] whitespace-pre-line text-body-l text-text-strong">
                {event.description}
              </p>
            </section>
          ) : preview ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-h2 font-bold">À propos</h2>
              <p className="rounded-card border border-dashed border-border-field bg-surface-alt p-4 text-body-s text-text-2">
                Aucune description pour l’instant — elle est obligatoire pour publier. Les
                participants lisent d’abord le programme, puis décident.
              </p>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-h2 font-bold">Bon à savoir</h2>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {event.doorsOpenAt ? (
                <Info
                  label="Ouverture des portes"
                  value={formatTimeSpaced(new Date(event.doorsOpenAt))}
                />
              ) : null}
              {event.minimumAge ? (
                <Info label="Âge minimum" value={`${event.minimumAge} ans`} />
              ) : (
                <Info label="Âge minimum" value="Tout public" />
              )}
              <Info label="Remboursement" value={describeRefundPolicy(event)} />
              {event.address ? <Info label="Adresse" value={event.address} /> : null}
              {event.format !== 'PHYSICAL' && event.onlinePlatform ? (
                <Info label="En ligne" value={event.onlinePlatform} />
              ) : null}
            </dl>

            {event.accessInstructions ? (
              <p className="rounded-[12px] bg-paper p-3.5 text-body text-text-2">
                {event.accessInstructions}
              </p>
            ) : null}
          </section>

          {event.format !== 'ONLINE' && where ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-h2 font-bold">Lieu</h2>
              <Surface variant="panel" padding="comfortable" className="flex items-start gap-3.5">
                <CategoryMark slug={event.categorySlug} color={event.categoryColor} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-body font-bold text-text-strong">{event.venueName}</p>
                  <p className="text-body-s text-text-2">
                    {[event.address, event.cityName].filter(Boolean).join(' · ')}
                  </p>
                  {event.latitude !== null && event.longitude !== null ? (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
                      target="_blank"
                      rel="noopener"
                      className="mt-1.5 inline-flex items-center gap-1.5 text-body-s font-semibold"
                    >
                      <MapPin className="size-4" aria-hidden />
                      Itinéraire
                    </a>
                  ) : preview ? (
                    <p className="mt-1 text-micro text-amber-700">
                      Lieu sans position : l’événement n’apparaîtra pas sur la carte. Localise-le à
                      l’étape « Lieu ».
                    </p>
                  ) : null}
                </div>
              </Surface>
            </section>
          ) : null}

          {/* Le plan est facultatif, mais la section ne l'est pas : un
              participant qui cherche le plan doit trouver une réponse, même
              quand la réponse est « il n'y en a pas ». Une section absente
              laisse croire qu'on a mal regardé. */}
          {event.format !== 'ONLINE' ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-h2 font-bold">Plan du lieu</h2>
              {event.floorPlanUrls.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {event.floorPlanUrls.map((url, index) => (
                    <li
                      key={url}
                      className="overflow-hidden rounded-card border border-border bg-surface"
                    >
                      {/* Pas de recadrage, pas de hauteur imposée : un plan se
                          lit dans ses marges. Le lien ouvre l'image seule, pour
                          zoomer avec les doigts sur un téléphone. */}
                      <a href={url} target="_blank" rel="noopener">
                        <img
                          src={url}
                          alt={`Plan du lieu${event.floorPlanUrls.length > 1 ? ` ${index + 1}` : ''}`}
                          className="w-full bg-paper object-contain"
                          loading="lazy"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <Surface variant="panel" padding="comfortable">
                  <p className="text-body-s text-text-2">
                    Aucun plan disponible pour cet événement.
                  </p>
                </Surface>
              )}
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-h2 font-bold">Organisé par</h2>
            <Surface variant="panel" padding="comfortable" className="flex items-center gap-3.5">
              {event.organizationLogoUrl ? (
                <img
                  src={event.organizationLogoUrl}
                  alt=""
                  className="size-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-white">
                  {event.organizationName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="flex-1">
                {preview ? (
                  <span className="text-body font-bold text-text-strong">
                    {event.organizationName}
                  </span>
                ) : (
                  <Link
                    href={`/o/${event.organizationSlug}`}
                    className="text-body font-bold text-text-strong hover:text-coral"
                  >
                    {event.organizationName}
                  </Link>
                )}
                {event.organizationVerified ? (
                  <div className="mt-1">
                    <Badge tone="verified">
                      <Check className="size-3" strokeWidth={3} />
                      Organisateur vérifié
                    </Badge>
                  </div>
                ) : null}
              </div>
            </Surface>
          </section>
        </div>

        {preview ? (
          <PreviewTicketsPanel event={event} />
        ) : (
          <BuyPanel
            eventId={event.id}
            ticketTypes={event.ticketTypes}
            maxTicketsPerOrder={event.maxTicketsPerOrder}
            cancelled={isCancelled}
            soldOut={event.isSoldOut}
            fromPrice={event.fromPrice}
            feeAmount={event.feeAmount}
            currency={event.currency}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-subtle pb-2">
      <dt className="text-micro text-text-3">{label}</dt>
      <dd className="text-body font-semibold">{value}</dd>
    </div>
  );
}

export function describeRefundPolicy(
  event: Pick<EventDetail, 'refundPolicy' | 'refundDeadlineDays'>,
): string {
  switch (event.refundPolicy) {
    case 'UNTIL_DAYS_BEFORE':
      return `Jusqu’à ${event.refundDeadlineDays ?? 7} jours avant`;
    case 'NONE':
      return 'Aucun remboursement';
    case 'CASE_BY_CASE':
      return 'Au cas par cas, sur demande';
  }
}

/**
 * La billetterie, telle qu'elle s'affichera — sans qu'on puisse acheter.
 *
 * L'organisateur vérifie ici ses tarifs et ses libellés. Les billets cachés
 * (partenaire, presse) y figurent avec leur mention : lui seul les voit.
 */
function PreviewTicketsPanel({ event }: { event: EventDetail }) {
  const visible = event.ticketTypes;

  return (
    <aside className="md:sticky md:top-4">
      <Surface variant="panel" padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-border-subtle px-5 py-4">
          <h2 className="text-h3 font-bold">Billets</h2>
          <p className="text-body-s text-text-2">
            {visible.length === 0
              ? 'Aucune catégorie de billet pour l’instant.'
              : `${visible.length} catégorie${visible.length > 1 ? 's' : ''} · ce que verront les participants`}
          </p>
        </div>

        {visible.length > 0 ? (
          <ul className="flex flex-col">
            {visible.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-start gap-3 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body font-semibold text-text-strong">
                    {ticket.name}
                    {ticket.visibility !== 'PUBLIC' ? (
                      <span className="ml-1.5 text-micro font-medium text-text-3">· caché</span>
                    ) : null}
                  </span>
                  {ticket.description ? (
                    <span className="text-body-s text-text-2">{ticket.description}</span>
                  ) : null}
                  <span className="flex items-center gap-1 text-micro text-text-3">
                    <Clock className="size-3" aria-hidden />
                    {ticket.remaining} place{ticket.remaining > 1 ? 's' : ''} disponible
                    {ticket.remaining > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  {ticket.price === 0 ? (
                    <Badge tone="accent">Gratuit</Badge>
                  ) : (
                    <Money amount={ticket.price} currency={event.currency} size="small" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-body-s text-amber-700">
            Il faut au moins une catégorie pour publier — étape « Billets ».
          </p>
        )}

        <div className="flex flex-col gap-2 border-t border-border bg-paper p-4">
          <Button variant="primary" size="primary" block disabled>
            Obtenir un billet
          </Button>
          <p className="text-center text-micro text-text-3">
            Aperçu · la billetterie ouvre à la publication
          </p>
        </div>
      </Surface>
    </aside>
  );
}
