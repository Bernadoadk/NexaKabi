import { createZodValidationPipe } from 'nestjs-zod';

/**
 * Validation de TOUT ce qu'une route reçoit, par son DTO.
 *
 * ── Le trou que ce pipe bouche ──────────────────────────────────────────────
 * Les contrôleurs déclarent leurs corps par des DTO dérivés des schémas Zod
 * partagés (`createZodDto`). Un DTO ne valide rien par lui-même : il faut un
 * pipe pour l'appliquer, et l'API n'en avait aucun. Une quarantaine de routes
 * recevaient donc le JSON tel quel, sous un type qui promettait le contraire :
 * une confirmation de commande sans acceptation des conditions de vente, un
 * numéro d'acheteur jamais normalisé, des dates restées en chaînes, un montant
 * de retrait lu comme texte (`"5000"`), des quantités décimales.
 *
 * ── Ce qu'il fait, et ce qu'il laisse ───────────────────────────────────────
 * Un paramètre typé par un DTO (`@Body() body: CreateOrderDto`) est passé à
 * son schéma ; la route reçoit la valeur VALIDÉE ET TRANSFORMÉE — dates en
 * `Date`, textes nettoyés, valeurs par défaut posées. Un paramètre typé
 * autrement (`string`, `unknown`, une interface) passe tel quel : il est alors
 * relu explicitement par la route, `schema.parse(body)` — c'est la règle pour
 * tout corps déclaré `unknown`.
 *
 * Un DTO n'est donc JAMAIS relu une seconde fois : un schéma qui transforme
 * (une date ISO devenue `Date`) refuserait sa propre sortie.
 *
 * ── Le format d'erreur ──────────────────────────────────────────────────────
 * L'erreur levée est l'erreur Zod elle-même, que le filtre global traduit en
 * `VALIDATION_FAILED` avec le détail par champ (`toApiError`) — exactement
 * comme les routes qui relisaient déjà leur corps à la main. Les écrans n'ont
 * qu'un format à lire.
 */
export const ApiZodValidationPipe = createZodValidationPipe({
  // Une erreur Zod ressort telle quelle (→ 400 détaillé). Toute autre erreur
  // levée par un schéma — une transformation qui plante — est un défaut du
  // code : elle ressort aussi telle quelle, en 500, plutôt que déguisée en
  // « informations incorrectes ».
  createValidationException: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
});
