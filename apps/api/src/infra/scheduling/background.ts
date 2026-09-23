import { Logger } from '@nestjs/common';
import { waitUntil } from '@vercel/functions';

const logger = new Logger('Background');

/**
 * Poursuit un travail APRÈS la réponse HTTP.
 *
 * ── Pourquoi c'est nécessaire ───────────────────────────────────────────────
 * Certains appelants n'attendent pas : KPay abandonne une notification au bout
 * de trois secondes, la rejoue deux fois, puis cesse. Or le traitement d'un
 * encaissement — relecture chez le prestataire, confirmation de la commande,
 * émission des billets, grand livre — dépasse ce délai au premier appel
 * d'une instance qui démarre. La bonne réponse est celle que le prestataire
 * recommande lui-même : accuser réception tout de suite, traiter ensuite.
 *
 * ── Pourquoi `waitUntil` ────────────────────────────────────────────────────
 * Sur une plateforme serverless, une instance peut être suspendue dès la
 * réponse envoyée : un travail simplement « lancé » y mourrait au hasard.
 * `waitUntil` demande à Vercel de garder l'instance en vie jusqu'à la fin de
 * la promesse. Ailleurs — serveur classique, poste de développement — il ne
 * fait rien, et la promesse s'exécute normalement dans le processus.
 *
 * Si le travail échoue malgré tout, rien n'est perdu : les tâches de
 * réconciliation relisent l'état chez le prestataire chaque minute. Ce qui
 * passe par ici doit donc toujours avoir un tel filet.
 */
export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const promise = work().catch((error: unknown) => {
    logger.error({ err: error }, `${label} : échec du traitement en arrière-plan`);
  });

  waitUntil(promise);
}
