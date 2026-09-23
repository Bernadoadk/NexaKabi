# Déploiement — Vercel + Neon

Trois projets Vercel, créés depuis le **même dépôt GitHub**, chacun pointant sur un dossier du
monorepo. Une base PostgreSQL chez Neon. Les visuels chez Cloudinary. Les tâches périodiques
déclenchées par cron-job.org. Tout en région Francfort (`fra1` chez Vercel, `eu-central-1` chez
Neon) : l'API et sa base se parlent dans le même centre de données.

**Tout tient dans les plans gratuits** : Vercel Hobby, Neon Free, Cloudinary Free, cron-job.org.

| Projet Vercel    | Root Directory | Preset  | Rôle                                    |
| ---------------- | -------------- | ------- | --------------------------------------- |
| `nexakabi-api`   | `apps/api`     | NestJS  | API (une seule fonction, Fluid compute) |
| `nexakabi-web`   | `apps/web`     | Next.js | Site public, espace organisateur        |
| `nexakabi-admin` | `apps/admin`   | Next.js | Console d'administration                |

Le navigateur ne parle jamais à l'API : `web` et `admin` la joignent côté serveur, via `API_URL`.
L'API n'a donc besoin ni de domaine « joli », ni de CORS ouvert.

---

## 1. Ce que le dépôt configure déjà

Chaque application porte son `vercel.json`. **Ne rien surcharger dans le tableau de bord** (Build
Command, Output Directory, Install Command) : le fichier fait foi.

| Fichier                  | Ce qu'il fixe                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/vercel.json`   | Preset `nestjs` · install `pnpm install --prod=false` · build `turbo run build && pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts` · `outputDirectory: dist` · région `fra1` |
| `apps/web/vercel.json`   | Preset `nextjs` · build `turbo run build` · région `fra1`                                                                                                    |
| `apps/admin/vercel.json` | Idem                                                                                                                                                         |

Trois mécanismes méritent d'être compris avant de toucher à quoi que ce soit :

- **`outputDirectory: dist` (API).** Le preset NestJS de Vercel cherche son point d'entrée d'abord
  dans ce dossier : il prend donc `dist/main.js`, compilé par `nest build` (tsc, métadonnées de
  décorateurs correctes, client Prisma copié), et non `src/main.ts` qu'il aurait compilé lui-même.
  Vercel capture ensuite l'appel `app.listen()` et route toutes les requêtes vers cette fonction.
  Le dossier n'est **pas** servi en statique.
- **`prisma/seed.ts` dans le build, juste après les migrations.** Il installe les RÉFÉRENTIELS —
  catégories et villes du cahier des charges — sans lesquels aucun événement ne peut être créé
  (« Aucune catégorie disponible »). Il est idempotent (`upsert`) : le relancer à chaque
  déploiement ne duplique rien et rattrape une base neuve. Ce n'est pas un jeu de données de
  démonstration : aucun compte, aucun événement.
- **`prisma migrate deploy` dans le build.** Les migrations s'appliquent pendant le build, avant que
  le nouveau déploiement ne prenne le trafic. Elles passent par `DATABASE_URL_UNPOOLED` (connexion
  directe) — voir `apps/api/prisma.config.ts`. Conséquence : une migration incompatible avec le code
  encore en ligne casse l'ancien déploiement pendant la minute que dure le build. Règle habituelle :
  migrations rétro-compatibles, en deux temps si besoin.
- **Tâches périodiques par HTTP.** Une fonction serverless n'a pas de durée de vie : les `@Cron()`
  n'y tournent pas. Avec `SCHEDULER_MODE=http`, aucune minuterie n'est armée, et un planificateur
  externe — cron-job.org, §6 — appelle `GET /api/internal/cron/<tâche>` au rythme voulu, avec
  `CRON_SECRET` en jeton Bearer (`CronController`, `CronSecretGuard`). Les tâches et leurs verrous
  ne changent pas.

`turbo run build` lancé depuis `apps/<app>` se limite automatiquement à cette application et à
ses dépendances internes (`packages/utils`, `packages/contracts`) ; `turbo` est fourni par Vercel.

**Modules ES et chargeur de Vercel.** NestJS 12 est publié en modules ES, et l'API est compilée en
CommonJS : elle fait donc `require()` de modules ES. Node 22.12+ l'accepte nativement, mais le
chargeur maison de Vercel le refuse par défaut — d'où la variable `NODE_OPTIONS=--experimental-require-module`
(§4). Ce chargeur a une seconde particularité : les `import` d'un module ES atteint par `require()`
sont résolus avec la condition `require` des paquets (fichiers `.cjs`), alors que le traçage du
build ne les avait pas embarqués. C'est pourquoi `packages/utils` et `packages/contracts` sont
publiés en **double sortie** : `dist/` (ES, pour web et admin) et `dist/cjs/` (CommonJS, pour
l'API, via la condition `require` de leur `exports`). L'API ne charge ainsi plus aucun module ES
en dehors de NestJS lui-même.

---

## 2. Prérequis

1. **Vercel — plan Hobby** (gratuit). Il suffit pour cette phase de test. Sa seule vraie limite
   pour nous : Vercel Cron y est plafonné à **une exécution par jour**, et un `vercel.json` qui
   déclare des crons plus fréquents fait **échouer le déploiement**. C'est pourquoi `vercel.json`
   n'en déclare aucun et que l'horloge est tenue par cron-job.org (§6). Hobby est aussi réservé aux
   projets non commerciaux : le jour où l'app encaisse pour de vrai, passer en Pro.
2. **Neon** — un compte, un projet en région **AWS Europe (Frankfurt)**.
3. **Cloudinary** — obligatoire : une fonction n'a pas de disque, le stockage local est refusé.
4. **cron-job.org** — un compte gratuit, pour déclencher les tâches périodiques (§6).
5. **Cinq secrets distincts**, générés une fois et gardés dans un coffre :

   ```bash
   openssl rand -base64 48
   ```

   pour `JWT_SECRET`, `OTP_PEPPER`, `TICKET_SIGNING_SECRET`, `CHECKOUT_TOKEN_SECRET` et
   `CRON_SECRET`. L'API refuse de démarrer si deux d'entre eux sont identiques.

6. Le dépôt poussé sur GitHub, branche `main`.

---

## 3. Neon — la base

1. **New Project** → nom `nexakabi`, région **AWS Europe (Frankfurt)**, PostgreSQL 17.
2. Panneau **Connect** → choisir le snippet **Prisma** : il donne les deux URL qu'il nous faut.
   - `DATABASE_URL` — hôte en `…-pooler.eu-central-1.aws.neon.tech` (pooler) → pour l'API.
   - `DATABASE_URL_UNPOOLED` — même hôte sans `-pooler` (connexion directe) → pour les migrations.
     Les deux se terminent par `?sslmode=require`. Les garder telles quelles.
3. Ne pas créer les tables à la main : le premier build de l'API applique toutes les migrations.

> Le rôle Neon par défaut est propriétaire de la base : c'est ce qu'il faut pour `migrate deploy`.

---

## 4. Vercel — projet API (en premier)

Les deux front-ends ont besoin de l'URL de l'API ; elle vient donc en premier.

1. Tableau de bord → **Add New… → Project** → **Import** le dépôt GitHub.
2. **Project Name** : `nexakabi-api` (il détermine l'URL : `https://nexakabi-api.vercel.app`).
3. **Root Directory** → **Edit** → `apps/api`.
4. **Framework Preset** : `NestJS` est détecté tout seul. Laisser Build Command, Output Directory
   et Install Command **sans override** — `vercel.json` s'en charge.
5. **Environment Variables** (environnement _Production_) :

| Variable                       | Valeur                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` — Vercel utilise alors la version de pnpm déclarée dans `package.json` (11.x)    |
| `NODE_OPTIONS`                 | `--experimental-require-module` — **sans elle, l'API plante au démarrage** (voir §1) |
| `NODE_ENV`                     | `development` — **voir §8 avant de mettre autre chose**                              |
| `LOG_PRETTY`                   | `false`                                                                              |
| `LOG_LEVEL`                    | `info`                                                                               |
| `SWAGGER_ENABLED`              | `false`                                                                              |
| `SCHEDULER_MODE`               | `http`                                                                               |
| `CRON_SECRET`                  | secret généré                                                                        |
| `DATABASE_URL`                 | URL **pooler** de Neon                                                               |
| `DATABASE_URL_UNPOOLED`        | URL **directe** de Neon                                                              |
| `JWT_SECRET`                   | secret généré                                                                        |
| `OTP_PEPPER`                   | secret généré                                                                        |
| `TICKET_SIGNING_SECRET`        | secret généré — **ne jamais le changer ensuite** : tous les QR émis seraient nuls    |
| `CHECKOUT_TOKEN_SECRET`        | secret généré                                                                        |
| `CLOUDINARY_CLOUD_NAME`        | tableau de bord Cloudinary                                                           |
| `CLOUDINARY_API_KEY`           | idem                                                                                 |
| `CLOUDINARY_API_SECRET`        | idem                                                                                 |
| `PUBLIC_API_URL`               | `https://nexakabi-api.vercel.app/api` (à ajuster si Vercel a suffixé le nom)         |
| `CORS_ORIGINS`                 | laisser vide pour l'instant, complété au §7                                          |
| `GOOGLE_MAPS_SERVER_KEY`       | facultatif — clé serveur (Places + Geocoding)                                        |
| `EMAIL_PROVIDER`, `SMTP_*`     | facultatif — `smtp` + réglages Gmail pour envoyer les billets par e-mail             |

Ne **pas** définir `PORT` ni `API_PREFIX`.

6. **Deploy.** Dans le journal de build, vérifier dans l'ordre : `pnpm install` avec pnpm 11,
   `turbo run build` (utils → contracts → api), puis `prisma migrate deploy` qui liste les
   migrations appliquées, puis le seed : « 15 catégories, 7 villes ».
7. Contrôles :
   - `https://nexakabi-api.vercel.app/api/health` → `{"status":"ok","checks":{"database":"up"}}`.
   - `https://nexakabi-api.vercel.app/api/categories` → quinze catégories. Une liste vide signifie
     que le seed n'a pas tourné : la création d'événement échouerait avec « Aucune catégorie
     disponible ». Rattrapage sans redéploiement, depuis un poste :
     `$env:DATABASE_URL='<URL Neon>'; pnpm --filter @nexakabi/api db:seed`.
   - Un appel à `https://nexakabi-api.vercel.app/api/internal/cron/retry-outbound` sans en-tête
     répond `403` : le garde est en place. Les tâches ne tourneront qu'après le §6.

> **Déploiements de prévisualisation.** Chaque branche poussée crée un déploiement _Preview_ qui
> lit les variables de l'environnement _Preview_ — vides par défaut, donc le build échoue, sans
> conséquence. Ne **jamais** y mettre la base de production : le build y lancerait les migrations
> de la branche. Pour des previews utiles, créer une branche Neon dédiée (ou l'intégration Neon du
> Vercel Marketplace, qui le fait seule). Sinon, ne construire que la production :
> **Settings → Git → Ignored Build Step** → _Custom_ → `[ "$VERCEL_ENV" != "production" ]`
> (sortie 0 = build ignoré, sortie 1 = build lancé).

---

## 5. Vercel — projets web et admin

Même procédure, deux fois.

**`nexakabi-web`** — Root Directory `apps/web`, preset Next.js détecté.

| Variable                              | Valeur                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| `ENABLE_EXPERIMENTAL_COREPACK`        | `1`                                                           |
| `API_URL`                             | `https://nexakabi-api.vercel.app/api`                         |
| `SITE_URL`                            | `https://nexakabi-web.vercel.app` (sans barre oblique finale) |
| `NEXT_PUBLIC_SITE_URL`                | même valeur                                                   |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | clé navigateur, restreinte par référent au domaine du site    |

**`nexakabi-admin`** — Root Directory `apps/admin`.

| Variable                       | Valeur                                |
| ------------------------------ | ------------------------------------- |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`                                   |
| `API_URL`                      | `https://nexakabi-api.vercel.app/api` |

Ne **pas** définir `NODE_ENV` sur ces deux projets : Next.js construit en production, et c'est ce
qu'il faut (cookies `secure`, HSTS, CSP stricte).

---

## 6. Planificateur des tâches — cron-job.org

L'API a neuf tâches de fond (`@Cron()` dans le code, plus la purge du transit) : libération des
réservations expirées, rattrapage des paiements en attente, réconciliation des versements et des
remboursements, reprise des envois en échec, rappels, balayage nocturne, purge des dépôts non
conclus, relevé de l'état des opérateurs, synchronisation du compte marchand. Sans elles, les
places restent bloquées par des commandes abandonnées, un paiement confirmé en différé ne l'est
jamais, et un opérateur en panne reste proposé aux acheteurs. Sur Vercel, personne ne les lance :
c'est cron-job.org qui appelle leurs URL, gratuitement, à la minute, avec l'en-tête secret.

1. Créer un compte sur [cron-job.org](https://cron-job.org). Fuseau horaire du compte :
   `Africa/Porto-Novo` (seul le balayage nocturne y est sensible).
2. Pour chacune des tâches du tableau, **Create cronjob** :
   - **Title** : le nom de la tâche.
   - **URL** : `https://nexakabi-api.vercel.app/api/internal/cron/<tâche>`.
   - **Schedule** : selon le tableau ci-dessous.
   - Onglet **Advanced → Headers** : nom `Authorization`, valeur `Bearer <CRON_SECRET>` — la même
     valeur, à l'octet près, que la variable `CRON_SECRET` du projet API. Méthode : `GET`.
   - Laisser les notifications d'échec activées, enregistrer.

| Tâche                    | Planning                     | Rôle                                                 |
| ------------------------ | ---------------------------- | ---------------------------------------------------- |
| `release-expired-orders` | chaque minute                | rend les places des réservations arrivées à échéance |
| `poll-pending-payments`  | chaque minute                | interroge l'opérateur sur les paiements en attente   |
| `reconcile-payouts`      | chaque minute                | conclut les versements et remboursements en cours    |
| `sync-payment-availability` | toutes les 5 minutes      | relève chez KPay l'état des opérateurs (panne, retards) |
| `retry-outbound`         | toutes les 10 minutes        | réessaie les e-mails et SMS en échec                 |
| `purge-staged-uploads`   | tous les jours à 4 h 30      | supprime les dépôts directs jamais conclus (transit) |
| `send-reminders`         | chaque heure, à la 7ᵉ minute | rappels avant événement                              |
| `sync-payment-providers` | chaque heure, à la 17ᵉ minute | constate les moyens ouverts sur le compte marchand — **facultatif en V1** : KPay n'expose pas cette liste, la tâche ne fait rien |
| `nightly-sweep`          | tous les jours à 3 h         | reprise des webhooks orphelins                       |

3. Vérifier depuis la page d'un job (exécution de test) : réponse `200` avec
   `{"job":"…","durationMs":…}`. Un `403` signifie que l'en-tête est absent ou que le secret
   diffère de celui du projet Vercel.
4. Côté Vercel, **Logs** du projet API : `Tâche release-expired-orders exécutée en … ms` apparaît
   chaque minute.

Chaque appel dure quelques dizaines de millisecondes ; les verrous consultatifs en base empêchent
tout double traitement si deux appels se chevauchent. Un échec est visible dans l'historique du job
et notifié par e-mail ; l'appel suivant repart normalement.

> **Le jour du plan Pro**, Vercel Cron peut reprendre l'horloge : remettre dans
> `apps/api/vercel.json` un bloc `"crons"` avec une entrée par tâche
> (`{ "path": "/api/internal/cron/<tâche>", "schedule": "* * * * *" }`, schedules `* * * * *`,
> `*/5 * * * *`, `*/10 * * * *`, `7 * * * *`, `17 * * * *`, `0 3 * * *`, `30 4 * * *`) et supprimer
> les jobs cron-job.org. Vercel envoie
> alors `CRON_SECRET` de lui-même. Rien d'autre ne change.

---

## 7. Boucler

1. Projet **API** → variable `CORS_ORIGINS` = `https://nexakabi-web.vercel.app,https://nexakabi-admin.vercel.app`
   → **Redeploy** (Deployments → ⋯ → Redeploy). Les variables ne sont lues qu'au déploiement.
2. Vérifier le parcours complet sur le site : connexion (le code OTP s'affiche à l'écran, cf. §8),
   création d'un événement avec visuel (Cloudinary), achat avec le simulateur de paiement, billet
   PDF, contrôle d'accès.
3. **Domaines personnalisés** (quand ils existent) : `nexakabi.bj` → web, `admin.nexakabi.bj` → admin,
   `api.nexakabi.bj` → API, chacun dans **Settings → Domains** du projet concerné. Puis mettre à jour
   `SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `API_URL` (×2), `PUBLIC_API_URL`, `CORS_ORIGINS`, la
   restriction de référent de la clé Google Maps navigateur — et redéployer les trois projets.

Vercel ne redéploie que les projets touchés par un commit (`apps/web` seul → seul `web` se
reconstruit ; `packages/contracts` → les trois).

---

## 8. Pourquoi l'API tourne en `NODE_ENV=development` — et comment passer en production

L'API est **stricte en production**, par construction (`config/env.ts`, fournisseurs) : elle
refuse de démarrer si un fournisseur simulé est en jeu. Or aujourd'hui :

- le seul fournisseur SMS existant est `console` (`ConsoleSmsProvider` lève une erreur en
  production) ;
- sans clé Bictorys, le paiement passe par le simulateur (`MockPaymentProvider`, interdit en
  production) — et avec `BICTORYS_API_KEY` vide en production, il n'y a **aucun** moyen de
  paiement.

Tant que l'app n'est pas branchée à un opérateur SMS et à Bictorys, la mise en ligne tourne donc en
mode développement. Ce que cela implique, concrètement :

| Comportement en `development`                       | Conséquence sur la mise en ligne actuelle                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Le code OTP est renvoyé et affiché à l'écran        | **N'importe qui peut se connecter avec n'importe quel numéro.** Aucune donnée réelle ne doit y vivre. |
| Simulateur de paiement actif (scénarios `00/11/22`) | Aucun argent ne circule                                                                               |
| Pas de HSTS, secrets d'exemple tolérés              | Vercel force déjà HTTPS ; **générer quand même de vrais secrets**                                     |
| Swagger possible                                    | Désactivé par `SWAGGER_ENABLED=false`                                                                 |
| Journaux lisibles par défaut                        | Forcés en JSON par `LOG_PRETTY=false`                                                                 |

**Passer en production**, le jour venu :

1. Brancher un fournisseur SMS réel (à implémenter : `SMS_PROVIDER` n'accepte que `console`).
2. Renseigner `BICTORYS_API_KEY` **et** `BICTORYS_WEBHOOK_SECRET` (plus
   `BICTORYS_PAYOUT_SECRET_CODE` pour les versements), `BICTORYS_ENVIRONMENT=live`, et déclarer
   le webhook `https://<api>/api/webhooks/payments/bictorys` sur le tableau de bord Bictorys.
   Puis, dans la console, « Pays & paiements » → **Synchroniser** : les moyens que le compte
   marchand ne sait pas traiter se ferment d'eux-mêmes.
3. `PUBLIC_WEB_URL`, `CORS_ORIGINS` et `PUBLIC_API_URL` en `https://` uniquement,
   `SWAGGER_ENABLED=false`. `PUBLIC_WEB_URL` est l'adresse de retour d'un paiement par carte.
4. Mettre `NODE_ENV=production` sur le projet API, redéployer. La validation de démarrage
   vérifie tout le reste (secrets restés à l'exemple, Cloudinary complet, cohérence Bictorys) et
   refuse net si quelque chose manque — c'est voulu.

`installCommand: pnpm install --prod=false` est déjà en place pour ce moment-là : sans lui,
`NODE_ENV=production` ferait sauter les `devDependencies` à l'installation, donc le CLI Nest, donc
le build.

---

## 9. Limites connues de la plateforme

- **Les fichiers ne transitent pas par les fonctions.** Chaque fonction Vercel plafonne le corps
  d'une requête à 4,5 Mo (413 au-delà, avant même d'atteindre le code) ; la bordure du projet API
  (preset NestJS) répond en outre 503 `SERVICE_UNAVAILABLE` à toute requête `multipart/form-data`
  de plus de ~1 Mo, avant d'invoquer la fonction — aucun log côté API (mesuré le 17 sept. 2026, le
  projet web n'est pas concerné). Les dépôts se font donc **directement du navigateur vers
  Cloudinary** avec un ticket signé par l'API (`POST /api/media/upload-ticket`), dans un espace de
  transit privé (`incoming/`) ; l'API ne reçoit qu'une référence, reprend le fichier, le contrôle,
  le ré-encode et supprime le transit. Limite : **10 Mo** (`UPLOAD_MAX_BYTES` dans
  `@nexakabi/contracts`), qui est aussi le plafond par fichier du plan gratuit Cloudinary. La CSP du
  web autorise `https://api.cloudinary.com` en `connect-src` pour cela. Sans Cloudinary configuré
  (développement), le fichier passe par l'API en corps brut `application/octet-stream` — jamais en
  multipart. Voir `apps/web/lib/upload-client.ts` et `apps/api/src/modules/media/media-intake.service.ts`.
- **Démarrage à froid** : quelques secondes à la première requête après une période d'inactivité
  (Nest + connexion Neon). Fluid compute garde ensuite l'instance chaude. Neon suspend aussi son
  compute après cinq minutes d'inactivité sur les petits plans — première requête plus lente.
- **Renouvellement de session** : `apps/web/middleware.ts` sérialise les rafraîchissements
  concurrents _par instance_. Sur Vercel, deux requêtes simultanées peuvent atterrir sur deux
  instances : rare, et l'API révoque alors proprement la lignée — l'utilisateur se reconnecte.
- **Journaux** : Vercel conserve peu d'historique sans intégration (Logs → _Log Drains_ pour
  exporter). Les codes OTP en mode développement y sont visibles : une raison de plus pour ne pas
  y mettre de données réelles.
- **Tâches périodiques** : elles dépendent d'un service tiers (cron-job.org). S'il tombe, rien ne
  casse dans l'application — les réservations expirent en retard et les paiements différés se
  confirment plus tard, dès la reprise des appels. Ses notifications d'échec par e-mail sont le
  signal à surveiller.
