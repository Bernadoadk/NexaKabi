import type { NewsletterEvent } from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import {
  renderButton,
  renderEmailLayout,
  renderEventCard,
  renderFooterLink,
  renderHeading,
  renderNote,
  renderParagraphs,
} from '../notifications/email-layout';
import { formatBeninMoment } from '../notifications/benin-time';

/** Le contenu éditorial d'une campagne, tel que la console l'a composé. */
export interface CampaignContent {
  readonly subject: string;
  readonly preheader: string | null;
  readonly heading: string | null;
  readonly body: string;
  readonly ctaLabel: string | null;
  readonly ctaUrl: string | null;
}

/**
 * E-mail d'une campagne.
 *
 * `unsubscribeUrl` est propre à chaque destinataire — c'est la seule partie
 * qui change d'un envoi à l'autre. Le reste est identique pour tous : pas de
 * « Bonjour Awa », qui obligerait à conserver et à charger un prénom pour
 * chaque adresse sans rien apporter à ce qu'on lit.
 */
export function renderCampaignEmail(input: {
  content: CampaignContent;
  events: readonly NewsletterEvent[];
  webUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const { content, events, webUrl } = input;
  const ctaUrl = content.ctaUrl ? absolute(content.ctaUrl, webUrl) : null;

  const eventCards = events
    .map((event) =>
      renderEventCard({
        title: event.title,
        url: `${webUrl}/e/${event.slug}`,
        when: formatBeninMoment(new Date(event.startsAt)),
        where: [event.venueName, event.cityName].filter(Boolean).join(', ') || null,
        price: describePrice(event),
        // Une image hébergée en local (développement) n'est pas joignable
        // depuis une boîte de réception : mieux vaut pas d'image qu'une icône
        // cassée.
        imageUrl: event.coverImageUrl?.startsWith('https://') ? event.coverImageUrl : null,
      }),
    )
    .join('');

  const html = renderEmailLayout({
    preheader: content.preheader,
    content: [
      content.heading ? renderHeading(content.heading) : '',
      renderParagraphs(content.body),
      eventCards ? `<div style="margin-top:18px;">${eventCards}</div>` : '',
      content.ctaLabel && ctaUrl ? renderButton(content.ctaLabel, ctaUrl) : '',
    ].join(''),
    footer: [
      'Tu reçois cette lettre parce que tu t’es abonné à la newsletter Nexa‑Kabi et que tu as confirmé ton adresse.',
      `${renderFooterLink('Se désabonner', input.unsubscribeUrl)} · ${renderFooterLink('Tous les événements', `${webUrl}/evenements`)}`,
    ].join('<br />'),
  });

  const text = [
    content.heading ?? '',
    content.body.trim(),
    ...events.map(
      (event) =>
        `• ${event.title} — ${formatBeninMoment(new Date(event.startsAt))}${
          event.cityName ? `, ${event.cityName}` : ''
        }\n  ${webUrl}/e/${event.slug}`,
    ),
    content.ctaLabel && ctaUrl ? `${content.ctaLabel} : ${ctaUrl}` : '',
    `Se désabonner : ${input.unsubscribeUrl}`,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return { html, text };
}

/** E-mail de confirmation d'une inscription : un bouton, et ce qui se passe sinon. */
export function renderConfirmationEmail(input: { confirmUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Confirme ton inscription à la newsletter Nexa‑Kabi';

  const html = renderEmailLayout({
    preheader: 'Un clic pour recevoir les meilleurs événements près de chez toi.',
    content: [
      renderHeading('Encore un clic'),
      renderParagraphs(
        'Tu as demandé à recevoir la newsletter Nexa‑Kabi : les sorties à ne pas manquer, une fois de temps en temps, jamais plus.\n\nConfirme ton adresse pour commencer à la recevoir.',
      ),
      renderButton('Confirmer mon adresse', input.confirmUrl),
      renderNote(
        'Ce n’est pas toi ? Ignore simplement ce message : sans confirmation, aucune newsletter ne te sera envoyée.',
      ),
    ].join(''),
  });

  const text =
    'Tu as demandé à recevoir la newsletter Nexa-Kabi.\n\n' +
    `Confirme ton adresse : ${input.confirmUrl}\n\n` +
    'Ce n’est pas toi ? Ignore ce message : sans confirmation, rien ne te sera envoyé.';

  return { subject, html, text };
}

function describePrice(event: NewsletterEvent): string | null {
  if (event.fromPrice === null) return null;
  if (event.fromPrice === 0) return 'Gratuit';
  return `dès ${formatMoney(event.fromPrice, event.currency)}`;
}

/** Un chemin du site devient une adresse complète ; une adresse https reste telle quelle. */
function absolute(url: string, webUrl: string): string {
  return url.startsWith('/') ? `${webUrl}${url}` : url;
}
