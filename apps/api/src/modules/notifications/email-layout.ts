/**
 * Habillage commun des e-mails de la plateforme.
 *
 * ── Pourquoi des tableaux et des styles en ligne ────────────────────────────
 * Les clients de messagerie ignorent les feuilles de style, Outlook ne connaît
 * ni flexbox ni grid, et Gmail retire tout `<style>` d'un message transféré.
 * Ce qui tient partout, c'est le HTML de 2005 : tableaux, styles en ligne,
 * largeur fixe. C'est laid à écrire et c'est le seul choix qui s'affiche.
 *
 * ── Ce qui entre ici est déjà sûr ───────────────────────────────────────────
 * `content` et `footer` sont du HTML composé par nos gabarits, jamais une
 * saisie brute : tout texte venu d'un organisateur, d'un administrateur ou
 * d'un participant passe par `escapeHtml` ou `renderParagraphs` avant.
 */

const COLORS = {
  page: '#F5F4F8',
  card: '#FFFFFF',
  ink: '#12102B',
  text: '#3A3752',
  muted: '#6B6884',
  coral: '#FF4D2E',
  border: '#E8E6EF',
} as const;

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailLayoutInput {
  /** Texte d'aperçu affiché après l'objet dans la boîte de réception. */
  readonly preheader?: string | null;
  /** Corps du message, en HTML déjà échappé. */
  readonly content: string;
  /** Pied de message, en HTML déjà échappé. */
  readonly footer?: string;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  // Le texte d'aperçu est caché dans le corps : c'est la seule façon de le
  // choisir, sans quoi le client affiche le premier texte venu (« Nexa-Kabi »).
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>`
    : '';

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Nexa-Kabi</title>
  </head>
  <body style="margin:0;padding:32px 12px;background:${COLORS.page};font-family:${FONT};color:${COLORS.ink};">
    ${preheader}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:${COLORS.card};border-radius:16px;overflow:hidden;">
      <tr><td style="background:${COLORS.ink};padding:20px 28px;">
        <span style="color:#FFFFFF;font-weight:800;font-size:16px;letter-spacing:-0.01em;">Nexa&#8209;Kabi</span>
      </td></tr>
      <tr><td style="padding:28px;">
        ${input.content}
      </td></tr>
    </table>
    ${
      input.footer
        ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
      <tr><td style="padding:18px 28px;font-size:12px;line-height:1.6;color:${COLORS.muted};text-align:center;">${input.footer}</td></tr>
    </table>`
        : ''
    }
  </body>
</html>`;
}

/** Titre principal du message. */
export function renderHeading(text: string): string {
  return `<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:${COLORS.ink};">${escapeHtml(text)}</h1>`;
}

/**
 * Texte brut en paragraphes.
 *
 * Une ligne vide sépare deux paragraphes, un simple saut de ligne reste un
 * saut de ligne. Les adresses `https://` deviennent des liens — c'est tout le
 * formatage accepté : une campagne composée dans la console ne doit jamais
 * pouvoir injecter de balisage dans l'e-mail.
 */
export function renderParagraphs(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${COLORS.text};">${linkify(escapeHtml(block)).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

/** Bouton d'action. Un seul par message : deux boutons, c'est aucun choix. */
export function renderButton(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 4px;">
  <tr><td style="background:${COLORS.coral};border-radius:11px;">
    <a href="${escapeAttribute(url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:${COLORS.ink};text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

/** Note discrète sous le corps du message. */
export function renderNote(html: string): string {
  return `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${COLORS.muted};">${html}</p>`;
}

/** Lien du pied de page. */
export function renderFooterLink(label: string, url: string): string {
  return `<a href="${escapeAttribute(url)}" style="color:${COLORS.muted};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

/** Carte d'événement, pour une sélection ou une campagne. */
export function renderEventCard(input: {
  title: string;
  url: string;
  when: string;
  where: string | null;
  price: string | null;
  imageUrl: string | null;
}): string {
  const image = input.imageUrl
    ? `<tr><td><a href="${escapeAttribute(input.url)}"><img src="${escapeAttribute(input.imageUrl)}" alt="" width="504" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:12px 12px 0 0;" /></a></td></tr>`
    : '';

  const details = [input.when, input.where, input.price]
    .filter(Boolean)
    .map((part) => escapeHtml(part as string));

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;border:1px solid ${COLORS.border};border-radius:12px;">
  ${image}
  <tr><td style="padding:14px 16px;">
    <a href="${escapeAttribute(input.url)}" style="font-size:16px;font-weight:700;color:${COLORS.ink};text-decoration:none;">${escapeHtml(input.title)}</a>
    <div style="margin-top:4px;font-size:13px;line-height:1.5;color:${COLORS.muted};">${details.join(' · ')}</div>
  </td></tr>
</table>`;
}

/**
 * E-mail d'une notification : titre, phrase, un bouton vers l'action.
 *
 * Volontairement sobre — c'est le pendant e-mail d'une ligne du centre de
 * notifications, pas une lettre d'information.
 */
export function renderNotificationEmail(input: {
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  settingsUrl: string;
}): string {
  return renderEmailLayout({
    preheader: input.body,
    content: `${renderHeading(input.title)}${renderParagraphs(input.body)}${renderButton(input.actionLabel, input.actionUrl)}`,
    footer: `Tu reçois ce message parce que tes réglages le demandent. ${renderFooterLink('Modifier mes alertes', input.settingsUrl)}`,
  });
}

/** Échappe les caractères sensibles au HTML — un texte saisi n'est jamais du balisage de confiance. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Valeur d'attribut : même échappement, et jamais de schéma exécutable. */
function escapeAttribute(url: string): string {
  const safe = /^(https?:|mailto:)/i.test(url) ? url : '#';
  return escapeHtml(safe);
}

/** Transforme les adresses `https://` d'un texte DÉJÀ échappé en liens. */
function linkify(escaped: string): string {
  return escaped.replace(
    /https:\/\/[^\s<]+[^\s<.,;:!?)»]/g,
    (url) => `<a href="${url}" style="color:${COLORS.coral};font-weight:600;">${url}</a>`,
  );
}
