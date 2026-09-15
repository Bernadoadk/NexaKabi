/**
 * URL publique du site.
 *
 * Sert à construire les liens partagés — billet, événement, kit de promotion.
 * Un lien WhatsApp partant avec `localhost` serait inutilisable, et l'erreur ne
 * se verrait qu'après l'envoi : mieux vaut une valeur explicite en
 * configuration qu'une déduction depuis l'en-tête `Host`, qu'un proxy peut
 * réécrire.
 */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}
