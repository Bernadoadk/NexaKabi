import { z } from 'zod';

/**
 * Variables d'environnement.
 *
 * Validées au démarrage : si une variable manque ou est invalide, le processus
 * s'arrête immédiatement avec un message lisible. Un service qui démarre à
 * moitié configuré et échoue à la première requête de paiement est bien pire
 * qu'un service qui refuse de démarrer.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  /**
   * URL PostgreSQL complète, y compris le schéma.
   *
   * Chez Neon, c'est l'URL du POOLER (hôte en `-pooler`) : chaque instance
   * serverless ouvre son propre pool, et seul le pooler absorbe cette
   * multiplication de connexions sans atteindre la limite du compute.
   */
  DATABASE_URL: z.string().url(),

  /**
   * URL de connexion DIRECTE, sans pooler. Lue par le CLI Prisma uniquement
   * (`prisma migrate deploy`, voir prisma.config.ts) : les migrations tiennent
   * des verrous et des transactions longues que PgBouncer ne relaie pas.
   * Absente, le CLI retombe sur `DATABASE_URL` — le cas d'une base locale.
   */
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  /** Origines autorisées pour CORS, séparées par des virgules. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  /** Préfixe global des routes de l'API. */
  API_PREFIX: z.string().default('api'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Journaux lisibles (pino-pretty) plutôt que JSON.
   *
   * Par défaut, suit `NODE_ENV` : lisible en développement, JSON ailleurs. À
   * forcer à `false` sur une plateforme serverless qui tourne en mode
   * développement : le transport pino-pretty vit dans un fil d'exécution à
   * part, qu'un bundle de fonction n'embarque pas — et la plateforme sait de
   * toute façon afficher le JSON.
   */
  LOG_PRETTY: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),

  /**
   * Secret de signature des jetons d'accès.
   * En production, 32 caractères minimum et jamais partagé avec un autre service.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),

  /**
   * Poivre appliqué au hachage des codes à 6 chiffres.
   * Sans lui, un code resterait devinable par force brute si la base fuyait :
   * l'espace des possibles n'est que d'un million.
   */
  OTP_PEPPER: z.string().min(32, 'OTP_PEPPER doit faire au moins 32 caractères'),

  /**
   * Secret maître de signature des billets.
   *
   * Chaque événement en dérive sa propre paire de clés Ed25519. La clé privée
   * n'est donc écrite nulle part : une copie de la base ne permet pas de forger
   * un billet.
   *
   * Le changer INVALIDE tous les QR déjà émis. C'est le secret le plus
   * sensible du produit — il doit vivre dans un coffre, jamais dans un dépôt.
   */
  TICKET_SIGNING_SECRET: z
    .string()
    .min(32, 'TICKET_SIGNING_SECRET doit faire au moins 32 caractères'),

  /**
   * Secret de signature des jetons d'accès à une commande en cours.
   *
   * DISTINCT de `JWT_SECRET`, et c'est tout l'intérêt : un jeton de checkout
   * est délivré à quiconque crée une commande, sans authentification aucune.
   * Signé par la même clé que les jetons de session, il serait accepté par le
   * garde de session — un contournement complet de l'authentification.
   *
   * Deux secrets, deux univers de jetons qui ne peuvent pas se confondre.
   */
  CHECKOUT_TOKEN_SECRET: z
    .string()
    .min(32, 'CHECKOUT_TOKEN_SECRET doit faire au moins 32 caractères'),

  /**
   * URL publique de l'API, telle que les opérateurs la joignent.
   *
   * Sert à construire l'URL de rappel des webhooks. Elle ne peut pas être
   * déduite de la requête entrante : un webhook arrive AVANT toute requête, et
   * un proxy peut réécrire l'en-tête `Host`.
   */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000/api'),

  /**
   * FedaPay — agrégateur Mobile Money ouest-africain.
   *
   * `sandbox` tant que le compte n'est pas validé. Les deux environnements ont
   * des HÔTES différents, pas seulement des clés : viser le mauvais avec les
   * bonnes clés échoue à l'authentification, ce qui est le bon comportement.
   */
  FEDAPAY_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
  /** Clé secrète. Vide = FedaPay n'est pas branché, et n'apparaît pas au checkout. */
  FEDAPAY_SECRET_KEY: z.string().default(''),
  /** Secret de signature des webhooks. Propre à chaque point de terminaison. */
  FEDAPAY_WEBHOOK_SECRET: z.string().default(''),

  /**
   * Fournisseur d'envoi des codes.
   * `console` écrit le code dans les journaux : c'est le mode de développement,
   * il évite de dépendre d'un opérateur SMS pour construire tout le reste.
   */
  SMS_PROVIDER: z.enum(['console']).default('console'),

  /**
   * Fournisseur d'envoi des e-mails — billets, reçus, alertes.
   * `console` écrit dans les journaux, même principe que `SMS_PROVIDER`.
   */
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  /** Hôte SMTP. Pour Gmail : smtp.gmail.com. Requis seulement si EMAIL_PROVIDER=smtp. */
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /**
   * Adresse et mot de passe d'application.
   * Pour Gmail, JAMAIS le mot de passe du compte : un mot de passe
   * d'application généré sur https://myaccount.google.com/apppasswords
   * (exige la validation en deux étapes activée sur le compte).
   */
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  /** true = SSL implicite (port 465). false = STARTTLS (port 587, réglage Gmail standard). */
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  /** Adresse affichée comme expéditeur. */
  SMTP_FROM: z.string().default('Nexa-Kabi <no-reply@nexakabi.bj>'),

  /**
   * Google Maps Platform — clé SERVEUR.
   *
   * Recherche de lieux (Places API) et géocodage, appelés depuis l'API et
   * jamais depuis le navigateur : la clé ne quitte pas le serveur, et la
   * recherche est bornée au Bénin côté API plutôt que côté page. Vide, la
   * recherche de lieux est simplement absente de l'assistant — la saisie
   * manuelle du lieu reste possible.
   */
  GOOGLE_MAPS_SERVER_KEY: z.string().default(''),

  /**
   * Cloudinary — stockage des visuels (couvertures, logos, avatars, pièces de
   * vérification).
   *
   * Les trois valeurs viennent du tableau de bord Cloudinary (Dashboard →
   * Product Environment Credentials). Vide, `MediaModule` retombe sur le
   * stockage local de développement — voir `storage.provider.ts`.
   */
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),

  /**
   * Qui déclenche les tâches périodiques.
   *
   * `in-process` : le processus les lance lui-même (`@Cron`), comme sur un
   * serveur qui tourne en continu — poste de développement, conteneur, VPS.
   *
   * `http` : le processus n'a pas de durée de vie garantie (fonction
   * serverless), donc aucune minuterie n'est armée. Un planificateur externe
   * — cron-job.org, Vercel Cron… — appelle `GET /internal/cron/<tâche>` au
   * rythme voulu, avec `CRON_SECRET` en jeton Bearer. Les tâches elles-mêmes
   * ne changent pas : seul le déclencheur change.
   */
  SCHEDULER_MODE: z.enum(['in-process', 'http']).default('in-process'),

  /**
   * Secret attendu sur les appels à `/internal/cron/*`.
   *
   * Attendu en en-tête `Authorization: Bearer …` — à saisir dans le
   * planificateur externe. Obligatoire en mode `http` : sans lui,
   * n'importe qui pourrait déclencher une réconciliation ou une relance à
   * volonté. Vide, les endpoints répondent 403.
   */
  CRON_SECRET: z.string().default(''),

  /** Expose la documentation OpenAPI. Toujours désactivée en production. */
  SWAGGER_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value === 'true'),
});

/**
 * Valeurs d'exemple publiées dans `.env.example`.
 *
 * Elles figurent dans le dépôt : quiconque l'a lu les connaît. Un secret resté
 * à sa valeur d'exemple n'est pas un secret — et celui de signature des billets
 * permettrait alors de dériver la clé privée de n'importe quel événement, donc
 * de forger des billets sans limite.
 *
 * Le contrôle ne s'applique qu'en production : en développement, ces valeurs
 * doivent rester utilisables sans cérémonie.
 */
const PLACEHOLDER_MARKERS = ['remplacer-par', 'change-moi', 'changeme', 'a-remplacer', 'exemple'];

function looksLikePlaceholder(value: string): boolean {
  const lowered = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * Contrôles qui ne relèvent pas d'un champ isolé.
 *
 * Ils vivent ici plutôt que dans un document : une règle de sécurité écrite
 * dans un fichier Markdown se contourne par oubli, celle-ci empêche le service
 * de démarrer.
 */
function assertConsistency(env: Env, addIssue: (path: string, message: string) => void): void {
  const isProduction = env.NODE_ENV === 'production';

  const secrets: Array<[keyof Env & string, string]> = [
    ['JWT_SECRET', env.JWT_SECRET],
    ['OTP_PEPPER', env.OTP_PEPPER],
    ['TICKET_SIGNING_SECRET', env.TICKET_SIGNING_SECRET],
    ['CHECKOUT_TOKEN_SECRET', env.CHECKOUT_TOKEN_SECRET],
  ];

  // Deux usages qui partagent un secret ne font qu'un seul périmètre de
  // compromission. La règle vaut partout, production comprise ou non : elle ne
  // coûte rien à respecter et évite un couplage qu'on ne voit qu'après.
  const seen = new Map<string, string>();

  for (const [name, value] of secrets) {
    const owner = seen.get(value);

    if (owner) {
      addIssue(name, `${name} doit être distinct de ${owner} : un secret par usage.`);
    } else {
      seen.set(value, name);
    }

    if (isProduction && looksLikePlaceholder(value)) {
      addIssue(name, `${name} est resté à sa valeur d’exemple. Générer : openssl rand -base64 48.`);
    }
  }

  // Une clé FedaPay sans secret de webhook fait calculer la signature avec une
  // clé VIDE : n'importe qui peut alors déclarer un paiement réussi.
  if (env.FEDAPAY_SECRET_KEY && !env.FEDAPAY_WEBHOOK_SECRET) {
    addIssue(
      'FEDAPAY_WEBHOOK_SECRET',
      'FEDAPAY_WEBHOOK_SECRET est obligatoire dès que FEDAPAY_SECRET_KEY est renseignée : ' +
        'sans lui, la signature des webhooks est calculée avec une clé vide, donc forgeable.',
    );
  }

  // En mode `http`, les tâches ne tournent QUE si quelqu'un les appelle — et
  // sans secret, le garde ferme les endpoints. Rien ne tournerait, sans un
  // seul message : commandes jamais expirées, paiements jamais rattrapés.
  // Refuser de démarrer est la seule façon de le voir tout de suite.
  if (env.SCHEDULER_MODE === 'http' && env.CRON_SECRET.length < 32) {
    addIssue(
      'CRON_SECRET',
      'SCHEDULER_MODE=http exige CRON_SECRET (32 caractères minimum). Générer : openssl rand -base64 48.',
    );
  }

  if (isProduction && env.CRON_SECRET && looksLikePlaceholder(env.CRON_SECRET)) {
    addIssue('CRON_SECRET', 'CRON_SECRET est resté à sa valeur d’exemple.');
  }

  if (env.EMAIL_PROVIDER === 'smtp' && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD)) {
    addIssue('SMTP_HOST', 'EMAIL_PROVIDER=smtp exige SMTP_HOST, SMTP_USER et SMTP_PASSWORD.');
  }

  // Les trois valeurs Cloudinary vont ensemble : un tableau de bord n'en donne
  // jamais qu'un sous-ensemble sans intention. Sans ce contrôle, une valeur
  // oubliée basculerait silencieusement sur le stockage local — acceptable en
  // développement, invisible en production jusqu'au premier dépôt de fichier.
  const cloudinaryValues = [
    env.CLOUDINARY_CLOUD_NAME,
    env.CLOUDINARY_API_KEY,
    env.CLOUDINARY_API_SECRET,
  ];
  if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
    addIssue(
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET vont ensemble : ' +
        'renseigne les trois, ou laisse les trois vides pour rester sur le stockage local.',
    );
  }

  if (isProduction) {
    if (env.SWAGGER_ENABLED) {
      addIssue(
        'SWAGGER_ENABLED',
        'La documentation OpenAPI ne doit pas être exposée en production.',
      );
    }

    // Une origine en clair signifie que les cookies de session traversent le
    // réseau sans chiffrement — et `secure` les empêcherait d'être posés.
    const insecure = env.CORS_ORIGINS.filter((origin) => origin.startsWith('http://'));

    if (insecure.length > 0) {
      addIssue('CORS_ORIGINS', `Origines non chiffrées en production : ${insecure.join(', ')}.`);
    }

    if (env.CORS_ORIGINS.includes('*')) {
      addIssue(
        'CORS_ORIGINS',
        'CORS_ORIGINS ne peut pas valoir « * » avec des cookies de session.',
      );
    }

    if (!env.PUBLIC_API_URL.startsWith('https://')) {
      addIssue('PUBLIC_API_URL', 'PUBLIC_API_URL doit être en HTTPS en production.');
    }
  }
}

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  · ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuration d'environnement invalide.\n${details}\n\n` +
        `Copiez .env.example vers .env et complétez les valeurs manquantes.`,
    );
  }

  const problems: string[] = [];

  assertConsistency(result.data, (path, message) => {
    problems.push(`  · ${path} : ${message}`);
  });

  if (problems.length > 0) {
    throw new Error(
      `Configuration d'environnement refusée.\n${problems.join('\n')}\n\n` +
        `Ces contrôles protègent des erreurs qui ne se voient qu'après un incident.`,
    );
  }

  return result.data;
}
