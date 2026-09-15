import base from '@nexakabi/config/eslint/nest';

/**
 * ── Pourquoi `console` est autorisé dans `src/scripts/` ────────────────────
 * Ces fichiers sont des outils en ligne de commande — amorçage d'un compte
 * d'administration, jeu de démonstration, contrôle de cohérence. Leur sortie
 * standard EST leur interface : c'est là que s'affichent le secret TOTP à
 * scanner et les codes de secours.
 *
 * Les faire passer par le journal de NestJS les noierait dans un format
 * horodaté conçu pour un serveur, et les codes de secours — qui ne s'affichent
 * qu'une fois — se retrouveraient mêlés à des lignes de démarrage.
 */
export default [
  ...(Array.isArray(base) ? base : [base]),
  {
    files: ['src/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
