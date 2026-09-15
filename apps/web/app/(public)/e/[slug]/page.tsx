import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatEventRange, formatMoney } from '@nexakabi/utils';
import { fetchEvent } from '@/lib/events';
import { EventPageView } from '@/components/event-page-view';

/**
 * Page événement (écran P4) — « la page la plus importante du produit ».
 *
 * C'est elle qui reçoit le trafic WhatsApp : ses métadonnées Open Graph sont
 * donc rendues côté serveur, sans quoi l'aperçu partagé serait vide et le lien
 * perdrait l'essentiel de son pouvoir de conversion.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchEvent(slug);

  if (!event) return { title: 'Événement introuvable' };

  const when = formatEventRange(new Date(event.startsAt), new Date(event.endsAt));
  const where = [event.venueName, event.cityName].filter(Boolean).join(', ');
  const price =
    event.fromPrice === 0
      ? 'Entrée gratuite'
      : event.fromPrice
        ? `À partir de ${formatMoney(event.fromPrice)}`
        : '';

  const description = [when, where, price].filter(Boolean).join(' · ');

  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: 'website',
      locale: 'fr_BJ',
      siteName: 'Nexa-Kabi',
      images: event.coverImageUrl ? [{ url: event.coverImageUrl }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: event.title, description },
    alternates: { canonical: `/e/${event.slug}` },
  };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await fetchEvent(slug);

  if (!event) notFound();

  return (
    <main>
      {/* Données structurées : le SEO d'un catalogue d'événements en dépend. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(buildEventJsonLd(event)) }}
      />

      {/* La page elle-même vit dans `EventPageView`, partagée avec l'aperçu
          de l'organisateur : ce qu'il vérifie avant de publier est exactement
          ce qui s'affiche ici. */}
      <EventPageView event={event} mode="public" />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Event = NonNullable<Awaited<ReturnType<typeof fetchEvent>>>;

/**
 * Sérialise des données structurées pour un bloc `<script>`.
 *
 * ── Ce que `JSON.stringify` seul laissait passer ──────────────────────────
 * Il échappe les guillemets, pas les chevrons. Le titre, la description, le
 * nom du lieu et les libellés de billets sont saisis par l'organisateur : une
 * description contenant `</script><script>…` refermait le bloc et rendait
 * exécutable ce qui suivait, sur une page publique, pour chaque visiteur.
 *
 * Échapper à l'ÉCRITURE plutôt qu'à la saisie : la donnée reste intacte en
 * base, et le correctif couvre aussi les champs ajoutés plus tard.
 *
 * Les chevrons et l'esperluette sont réécrits en séquences d'échappement JSON.
 * Le parseur restitue le caractère d'origine — la donnée affichée ne change
 * pas — mais l'analyseur HTML ne voit jamais de balise fermante.
 *
 * Les deux séparateurs de ligne Unicode suivent : valides en JSON, illégaux
 * dans un littéral JavaScript, ils casseraient le bloc à l'analyse. Un bogue
 * d'affichage plutôt qu'une faille, mais il se corrige au même endroit.
 */
function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** Données structurées schema.org, pour le référencement du catalogue. */
function buildEventJsonLd(event: Event) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description ?? undefined,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus:
      event.status === 'CANCELLED'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode:
      event.format === 'ONLINE'
        ? 'https://schema.org/OnlineEventAttendanceMode'
        : 'https://schema.org/OfflineEventAttendanceMode',
    location: event.venueName
      ? {
          '@type': 'Place',
          name: event.venueName,
          address: [event.address, event.cityName].filter(Boolean).join(', '),
        }
      : undefined,
    image: event.coverImageUrl ?? undefined,
    organizer: { '@type': 'Organization', name: event.organizationName },
    offers: event.ticketTypes.map((ticket) => ({
      '@type': 'Offer',
      name: ticket.name,
      price: ticket.price,
      priceCurrency: ticket.currency,
      availability: ticket.available ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
    })),
  };
}
