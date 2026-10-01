import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  Info,
  Mic2,
  ShieldCheck,
  Sparkles,
  Ticket,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { NotificationType } from '@nexakabi/contracts';
import { formatRelative } from '@nexakabi/utils';
import { EmptyState, Surface, cn } from '@nexakabi/ui';
import { fetchCategories, fetchCities } from '@/lib/events';
import { listOrganizations } from '@/lib/organizations';
import {
  fetchAccountNewsletter,
  fetchFollows,
  fetchInterests,
  fetchNotificationPreferences,
  fetchNotifications,
  fetchPushStatus,
  type NotificationItem,
} from '@/lib/notifications';
import { getCurrentUser } from '@/lib/session';
import { FollowedOrganizers } from './followed-organizers';
import { InterestsForm } from './interests-form';
import { MarkAllReadButton } from './mark-all-read';
import { NewsletterToggle } from './newsletter-toggle';
import { PreferencesForm } from './preferences-form';

export const metadata: Metadata = { title: 'Alertes' };

/**
 * Écran U6 — alertes du participant.
 *
 * ── Ce que le prototype montre, et ce qu'il ne montre pas ──────────────────
 * Un titre « Alertes », un « Tout lire », et une liste d'items portant chacun
 * une icône, un titre, une phrase et une date relative. Rien d'autre : ni
 * filtres, ni archivage, ni corbeille. Un centre de notifications qui demande à
 * être rangé ne l'est jamais.
 *
 * Les réglages vivent au bas de la même page plutôt que derrière un écran de
 * plus : c'est ici qu'on se dit « j'en reçois trop », et l'endroit où on le
 * pense doit être l'endroit où on le corrige. Goûts, suivis et newsletter
 * suivent, dans l'ordre où l'on s'en sert.
 */
export default async function NotificationsPage() {
  const [
    feed,
    preferences,
    push,
    user,
    interests,
    categories,
    cities,
    follows,
    newsletter,
    organizations,
  ] = await Promise.all([
    fetchNotifications(),
    fetchNotificationPreferences(),
    fetchPushStatus(),
    getCurrentUser(),
    fetchInterests(),
    fetchCategories(),
    fetchCities(),
    fetchFollows(),
    fetchAccountNewsletter(),
    listOrganizations(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">Alertes</h1>
          {feed.unreadCount > 0 ? (
            <span className="rounded-full bg-coral px-2 py-0.5 text-micro font-bold text-ink">
              {feed.unreadCount}
            </span>
          ) : null}
        </div>

        {feed.unreadCount > 0 ? <MarkAllReadButton /> : null}
      </header>

      {feed.items.length === 0 ? (
        <EmptyState
          icon={<Bell size={26} />}
          title="Aucune alerte"
          description="Tes confirmations de paiement, les rappels avant tes événements et les nouveautés des organisateurs que tu suis arriveront ici."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {feed.items.map((item) => (
            <li key={item.id}>
              <NotificationRow item={item} />
            </li>
          ))}
        </ul>
      )}

      <PreferencesForm
        initial={preferences}
        push={push}
        hasEmail={Boolean(user?.email)}
        isOrganizer={organizations.length > 0}
      />

      <InterestsForm categories={categories} cities={cities} initial={interests} />

      <FollowedOrganizers initial={follows} />

      <NewsletterToggle initial={newsletter} accountEmail={user?.email ?? null} />
    </div>
  );
}

/**
 * Une alerte.
 *
 * Toute la ligne est cliquable et mène à l'action : un lien discret en bas de
 * carte serait une cible de 40 px sur un écran qu'on tient d'une main.
 */
function NotificationRow({ item }: { item: NotificationItem }) {
  const unread = item.readAt === null;

  return (
    <Surface variant="panel" padding="none">
      <Link
        href={item.actionUrl}
        // `/pro/ouvrir` CHANGE l'organisation active (un cookie) avant de rediriger.
        // Next précharge les liens visibles en production : sans cette précaution,
        // le simple affichage de cette liste basculerait l'organisation, sans
        // aucun geste de la personne — et la dernière du lot l'emporterait.
        prefetch={item.actionUrl.startsWith('/pro/ouvrir') ? false : undefined}
        className={cn(
          'flex min-h-[var(--tap-min)] items-start gap-3 px-4 py-3.5 transition hover:bg-surface-alt',
          // `text-text-strong` explicite : la feuille globale colore les liens
          // en corail, ce qui convient à un lien dans un paragraphe mais
          // donnerait ici quatre titres criards dans une liste.
          'text-text-strong',
          unread && 'bg-coral/[0.04]',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px]',
            ICON_STYLES[item.type],
          )}
        >
          {ICONS[item.type]}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span
              className={cn('text-body-s leading-snug', unread ? 'font-bold' : 'font-semibold')}
            >
              {item.title}
            </span>
            {unread ? (
              <span aria-label="Non lue" className="mt-1 size-1.5 shrink-0 rounded-full bg-coral" />
            ) : null}
          </div>

          <p className="text-body-s leading-snug text-text-2">{item.body}</p>

          <p className="mt-0.5 text-micro text-text-3">
            {formatRelative(new Date(item.createdAt))}
          </p>
        </div>
      </Link>
    </Surface>
  );
}

/** Un pictogramme par type, coloré selon ce qu'il annonce plutôt qu'uniforme —
 *  une confirmation de paiement et un rappel urgent n'ont pas le même poids. */
const ICONS: Readonly<Record<NotificationType, ReactNode>> = {
  PAYMENT_CONFIRMED: <CheckCircle2 className="size-4" />,
  EVENT_REMINDER: <CalendarClock className="size-4" />,
  EVENT_UPDATED: <Info className="size-4" />,
  ORGANIZER_PUBLISHED: <Mic2 className="size-4" />,
  RECOMMENDATION: <Sparkles className="size-4" />,
  REFUND_COMPLETED: <Undo2 className="size-4" />,
  SALE_RECEIVED: <Ticket className="size-4" />,
  SOLD_OUT: <Flame className="size-4" />,
  EVENT_REVIEWED: <ClipboardCheck className="size-4" />,
  VERIFICATION_REVIEWED: <ShieldCheck className="size-4" />,
  PAYOUT_UPDATED: <Wallet className="size-4" />,
};

const ICON_STYLES: Readonly<Record<NotificationType, string>> = {
  PAYMENT_CONFIRMED: 'bg-mint-50 text-mint-700',
  EVENT_REMINDER: 'bg-amber-50 text-amber-700',
  EVENT_UPDATED: 'bg-blue-50 text-blue-700',
  ORGANIZER_PUBLISHED: 'bg-coral-50 text-coral-700',
  RECOMMENDATION: 'bg-ink text-mint-300',
  REFUND_COMPLETED: 'bg-mint-50 text-mint-700',
  SALE_RECEIVED: 'bg-coral-50 text-coral-700',
  SOLD_OUT: 'bg-amber-50 text-amber-700',
  EVENT_REVIEWED: 'bg-blue-50 text-blue-700',
  VERIFICATION_REVIEWED: 'bg-mint-50 text-mint-700',
  PAYOUT_UPDATED: 'bg-ink text-mint-300',
};
