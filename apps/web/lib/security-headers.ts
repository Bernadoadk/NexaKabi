import type { NextRequest, NextResponse } from 'next/server';

/**
 * En-têtes de sécurité calculés par requête.
 *
 * ── Pourquoi ici et pas dans `next.config.ts` ─────────────────────────────
 * `next.config.ts` porte déjà les en-têtes STATIQUES — cadrage, type MIME,
 * référent, permissions du navigateur. La politique de sécurité du contenu,
 * elle, ne peut pas y vivre : elle a besoin d'un nonce différent à chaque
 * réponse, et un fichier de configuration ne voit pas les requêtes.
 *
 * ── Pourquoi un nonce et non `'unsafe-inline'` ────────────────────────────
 * Next injecte ses propres scripts en ligne — les données de rendu serveur en
 * dépendent. Autoriser tout script en ligne pour cette raison reviendrait à
 * publier une CSP qui n'arrête rien : c'est précisément l'injection en ligne
 * qu'une CSP existe pour bloquer. Le nonce autorise NOS scripts, nommément, et
 * rien d'autre.
 *
 * Le nonce est transmis à Next par l'en-tête `x-nonce` de la requête ; Next le
 * recopie sur les balises qu'il génère.
 *
 * ── Ce que cette politique aurait empêché ─────────────────────────────────
 * L'injection par les données structurées d'un événement : un script hostile
 * refermant le bloc `<script>` n'aurait porté aucun nonce, donc n'aurait pas
 * été exécuté. La faille est corrigée à la source par ailleurs — les deux vont
 * ensemble, l'une bouche le trou, l'autre limite les dégâts du prochain.
 */

/**
 * Origines du paiement Kkiapay : le SDK documenté (`cdn.kkiapay.me/k.js`) et
 * le cadre de sa fenêtre de paiement, que ce SDK ouvre — adresse relevée dans
 * son code. Si Kkiapay change d'hôte, la fenêtre sera bloquée par le
 * navigateur : c'est ici qu'il faudra la suivre.
 */
const KKIAPAY_SDK_ORIGIN = 'https://cdn.kkiapay.me';
const KKIAPAY_WIDGET_ORIGIN = 'https://widget-v3.kkiapay.me';

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes));
}

interface PolicyOptions {
  readonly nonce: string;
  readonly isDevelopment: boolean;
  /**
   * Console d'administration : aucune image ni police externe, aucun cadre.
   * Elle n'affiche que ses propres écrans, et rien de ce qu'un tiers a déposé.
   */
  readonly strict?: boolean;
}

function buildPolicy({ nonce, isDevelopment, strict = false }: PolicyOptions): string {
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],

    /**
     * `strict-dynamic` : un script porteur du nonce peut en charger d'autres.
     * Next découpe son exécution en morceaux qu'il insère lui-même ; sans cela
     * l'application ne démarre pas.
     *
     * `'unsafe-eval'` en développement seulement : le rechargement à chaud de
     * Next en dépend. En production, il n'a aucune raison d'être.
     */
    [
      'script-src',
      [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
        // Le SDK Google Maps, chargé par une balise qui porte le nonce ; les
        // modules qu'il tire ensuite passent par `strict-dynamic`. Listé
        // quand même : un navigateur qui ignore `strict-dynamic` retombe sur
        // cette liste d'hôtes. Même raison pour le SDK de paiement Kkiapay,
        // inséré par notre propre code au moment de payer.
        ...(strict ? [] : ['https://maps.googleapis.com', KKIAPAY_SDK_ORIGIN]),
      ],
    ],

    /**
     * Les styles restent en ligne : Tailwind et Next en produisent, et aucun
     * mécanisme d'exécution n'y est attaché. Le risque résiduel — l'exfiltration
     * par sélecteur d'attribut — suppose déjà une injection HTML réussie.
     */
    [
      'style-src',
      ["'self'", "'unsafe-inline'", ...(strict ? [] : ['https://fonts.googleapis.com'])],
    ],

    // Le stockage objet servira les visuels d'événements ; `data:` couvre les
    // images encodées du billet PDF et les icônes de l'application.
    ['img-src', strict ? ["'self'", 'data:'] : ["'self'", 'data:', 'blob:', 'https:']],

    ['font-src', ["'self'", 'data:', ...(strict ? [] : ['https://fonts.gstatic.com'])]],

    /**
     * Le navigateur ne parle jamais directement à l'API : tout passe par les
     * route handlers de cette application. `'self'` suffit donc, et toute
     * tentative d'exfiltration vers un autre hôte est refusée par le navigateur.
     *
     * Trois exceptions nommées. Le SDK de la carte, sur le site public
     * seulement. Le stockage des fichiers, pour le dépôt direct.
     * Et en développement, le rechargement à chaud de Next, qui passe par un
     * WebSocket — un schéma que `'self'` ne couvre pas : sans ces entrées, le
     * développeur perd le rechargement automatique, et une CSP qui gêne le
     * travail quotidien finit désactivée.
     */
    [
      'connect-src',
      [
        "'self'",
        // Tuiles, géométries et polices de la carte : le SDK les demande
        // lui-même, depuis la page. Et le dépôt direct des fichiers chez le
        // stockage (voir `lib/upload-client.ts`) : le navigateur y envoie le
        // fichier avec un ticket signé par l'API, jamais une clé secrète.
        ...(strict
          ? []
          : [
              'https://maps.googleapis.com',
              'https://maps.gstatic.com',
              'https://api.cloudinary.com',
            ]),
        ...(isDevelopment ? ['ws://localhost:*', 'wss://localhost:*', 'http://localhost:*'] : []),
      ],
    ],

    ['media-src', ["'self'"]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],

    // Aucun greffon : ni `<object>`, ni `<embed>`. Un seul cadre tiers, nommé :
    // la fenêtre de paiement Kkiapay, que son SDK ouvre dans un cadre servi
    // par son propre domaine. Autorisé sur tout le site public, pas sur le
    // seul tunnel : la politique est celle du document CHARGÉ, et l'acheteur
    // arrive souvent au paiement par une navigation interne depuis une autre
    // page, sans nouveau document.
    ['object-src', ["'none'"]],
    ['frame-src', strict ? ["'none'"] : [KKIAPAY_WIDGET_ORIGIN]],
    ['child-src', strict ? ["'none'"] : [KKIAPAY_WIDGET_ORIGIN]],

    // Personne ne peut encadrer ces pages : la version moderne de
    // `X-Frame-Options`, qui reste posé pour les navigateurs anciens.
    ['frame-ancestors', ["'none'"]],

    // Un formulaire ne peut poster que vers nous : une injection ne peut pas
    // détourner la saisie vers un serveur tiers.
    ['form-action', ["'self'"]],

    ['base-uri', ["'self'"]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');

  // `upgrade-insecure-requests` n'a de sens que là où le HTTPS existe.
  return isDevelopment ? policy : `${policy}; upgrade-insecure-requests`;
}

/**
 * Pose la CSP sur la réponse, pour un nonce déjà émis.
 *
 * ── Pourquoi le nonce est un PARAMÈTRE et non produit ici ─────────────────
 * Il doit voyager dans les en-têtes de REQUÊTE — c'est là que Next le lit pour
 * l'apposer sur les scripts qu'il génère — et `NextResponse.next()` fige ces
 * en-têtes à l'instant où on l'appelle. Les modifier après ne produit plus
 * rien : la réponse part avec une politique dont le nonce n'a été communiqué à
 * personne, et tous les scripts en ligne sont bloqués, à commencer par
 * l'initialisation du thème.
 *
 * L'appelant tire donc le nonce d'abord, le pose sur les en-têtes, construit
 * la réponse, et n'appelle cette fonction qu'ensuite.
 */
export function applyContentSecurityPolicy(
  nonce: string,
  response: NextResponse,
  options: { strict?: boolean } = {},
): void {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  const policy = buildPolicy({ nonce, isDevelopment, strict: options.strict });

  response.headers.set('Content-Security-Policy', policy);

  /**
   * HSTS, en production seulement.
   *
   * Sur `localhost`, tout est en clair : poser cet en-tête verrouillerait le
   * navigateur du développeur sur `https://localhost` — un blocage qu'on ne
   * lève qu'en allant fouiller les réglages internes du navigateur.
   */
  if (!isDevelopment) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
}

/**
 * Vérifie qu'une requête mutante vient bien de notre propre origine.
 *
 * ── Ce que `SameSite` laisse passer ───────────────────────────────────────
 * `sameSite: 'lax'` bloque déjà l'essentiel des requêtes forgées, mais il
 * dépend entièrement du navigateur : une version ancienne, une extension, un
 * client qui n'applique pas la règle, et le cookie repart. Comparer `Origin`
 * au domaine servi coûte trois lignes et ne dépend d'aucun réglage tiers.
 *
 * `Origin` est un en-tête que le navigateur écrit lui-même et qu'aucun script
 * de page ne peut modifier — c'est ce qui en fait une preuve utilisable.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  // Les méthodes sûres ne changent rien : rien à protéger.
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;

  const origin = request.headers.get('origin');

  // Absent sur certains clients non navigateurs (curl, applications natives).
  // Ils ne portent pas de cookie ambiant : il n'y a rien à forger.
  if (!origin) return true;

  return origin === request.nextUrl.origin;
}
