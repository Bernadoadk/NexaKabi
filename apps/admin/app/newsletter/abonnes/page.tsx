import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, Users } from 'lucide-react';
import {
  NEWSLETTER_SOURCE_LABELS,
  NEWSLETTER_SUBSCRIBER_STATUS_LABELS,
  type NewsletterSubscriber,
  type NewsletterSubscriberStatus,
  type PaginatedResult,
} from '@nexakabi/contracts';
import { formatDateShort } from '@nexakabi/utils';
import { Alert, Badge, EmptyState, Surface } from '@nexakabi/ui';
import { adminFetch, getAdminUser, hasAdminAccess } from '@/lib/session';
import { AccessDenied } from '../../access';
import { AdminShell } from '../../shell';
import { NewsletterNav } from '../newsletter-nav';
import { UnsubscribeButton } from './unsubscribe-button';

export const metadata: Metadata = { title: 'Abonnés à la newsletter' };

const STATUS_FILTERS: ReadonlyArray<readonly [NewsletterSubscriberStatus | '', string]> = [
  ['', 'Tous'],
  ['ACTIVE', 'Abonnés'],
  ['PENDING', 'À confirmer'],
  ['UNSUBSCRIBED', 'Désabonnés'],
];

const STATUS_TONES: Readonly<
  Record<NewsletterSubscriberStatus, 'success' | 'warning' | 'neutral'>
> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  UNSUBSCRIBED: 'neutral',
};

/**
 * Abonnés à la newsletter.
 *
 * ── Ce qui n'existe PAS ici : « ajouter un abonné » ───────────────────────
 * Une adresse n'entre dans la liste que par la personne elle-même, qui
 * confirme ensuite. Inscrire quelqu'un depuis la console, c'est lui envoyer
 * un e-mail qu'il n'a pas demandé — exactement ce que la newsletter s'interdit.
 */
export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getAdminUser();
  if (!user) redirect('/connexion');
  if (!hasAdminAccess(user, 'newsletter')) return <AccessDenied user={user} space="newsletter" />;
  const canAct = hasAdminAccess(user, 'newsletter', 'act');

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.statut) query.set('statut', params.statut);

  const result = await adminFetch<PaginatedResult<NewsletterSubscriber>>(
    `/newsletter/subscribers?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page), pageSize: '50' }).toString()}`,
  );

  const exportHref = `/api/admin/newsletter/subscribers.csv${query.size > 0 ? `?${query.toString()}` : ''}`;

  return (
    <AdminShell user={user}>
      <div className="flex flex-col gap-5">
        <NewsletterNav />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Abonnés</h1>
            <p className="text-body-s text-text-2">
              Seuls les abonnés qui ont confirmé leur adresse reçoivent la newsletter.
            </p>
          </div>
          <a
            href={exportHref}
            className="inline-flex min-h-[var(--tap-min)] items-center gap-2 rounded-button border border-border-field bg-surface px-[14px] text-body-s font-semibold text-text-strong hover:bg-paper"
          >
            <Download className="size-4" aria-hidden />
            Exporter (CSV)
          </a>
        </header>

        <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
          <form className="flex flex-wrap gap-2.5" action="/newsletter/abonnes">
            {params.statut ? <input type="hidden" name="statut" value={params.statut} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Adresse e-mail ou nom du compte…"
              className="min-h-[var(--tap-min)] flex-1 rounded-field border border-border-field bg-surface px-3 text-body"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(([value, label]) => (
              <FilterChip
                key={value || 'all'}
                label={label}
                href={buildHref({ q: params.q, statut: value })}
                active={(params.statut ?? '') === value}
              />
            ))}
          </div>
        </Surface>

        {!result.ok ? (
          <Alert tone="danger" title="Liste indisponible">
            {result.message}
          </Alert>
        ) : result.data.items.length === 0 ? (
          <EmptyState
            icon={<Users size={26} />}
            title={
              params.q || params.statut
                ? 'Aucun abonné ne correspond'
                : 'Aucun abonné pour l’instant'
            }
            description={
              params.q || params.statut
                ? 'Ajuste la recherche ou les filtres.'
                : 'Les inscriptions arrivent depuis le formulaire du site, l’inscription et les réglages des participants.'
            }
          />
        ) : (
          <>
            <p className="text-micro text-text-3">
              {result.data.total.toLocaleString('fr-FR')} adresse
              {result.data.total > 1 ? 's' : ''}
            </p>

            <Surface variant="panel" padding="none" className="overflow-hidden">
              <ul>
                {result.data.items.map((subscriber) => (
                  <li
                    key={subscriber.id}
                    className="flex flex-wrap items-center gap-3 border-t border-border-subtle p-4 first:border-t-0"
                  >
                    <div className="min-w-[220px] flex-1">
                      <div className="break-all text-body font-bold">{subscriber.email}</div>
                      <div className="text-micro text-text-3">
                        {NEWSLETTER_SOURCE_LABELS[subscriber.source]}
                        {subscriber.userName ? ` · compte de ${subscriber.userName}` : ''} · demande
                        du {formatDateShort(new Date(subscriber.createdAt))}
                        {subscriber.confirmedAt
                          ? ` · confirmée le ${formatDateShort(new Date(subscriber.confirmedAt))}`
                          : ''}
                        {subscriber.unsubscribedAt
                          ? ` · désabonné le ${formatDateShort(new Date(subscriber.unsubscribedAt))}`
                          : ''}
                      </div>
                    </div>

                    <Badge tone={STATUS_TONES[subscriber.status]}>
                      {NEWSLETTER_SUBSCRIBER_STATUS_LABELS[subscriber.status]}
                    </Badge>

                    {canAct && subscriber.status !== 'UNSUBSCRIBED' ? (
                      <UnsubscribeButton subscriberId={subscriber.id} email={subscriber.email} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </Surface>

            {result.data.totalPages > 1 ? (
              <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
                {page > 1 ? (
                  <Link
                    href={buildHref({ q: params.q, statut: params.statut, page: page - 1 })}
                    className="text-body-s font-semibold"
                  >
                    ← Précédents
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-micro text-text-3">
                  Page {page} sur {result.data.totalPages}
                </span>
                {page < result.data.totalPages ? (
                  <Link
                    href={buildHref({ q: params.q, statut: params.statut, page: page + 1 })}
                    className="text-body-s font-semibold"
                  >
                    Suivants →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full bg-ink px-3 py-1.5 text-body-s font-semibold text-white'
          : 'rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2 hover:bg-paper'
      }
    >
      {label}
    </Link>
  );
}

function buildHref(params: { q?: string; statut?: string; page?: number }): string {
  const next = new URLSearchParams();
  if (params.q) next.set('q', params.q);
  if (params.statut) next.set('statut', params.statut);
  if (params.page && params.page > 1) next.set('page', String(params.page));
  const query = next.toString();
  return query ? `/newsletter/abonnes?${query}` : '/newsletter/abonnes';
}
