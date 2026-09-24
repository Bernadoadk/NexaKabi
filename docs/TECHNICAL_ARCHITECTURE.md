# NEXA-KABI — ARCHITECTURE TECHNIQUE

> **Phase 0 — Proposition d'architecture.** Aucun code n'est écrit, aucune dépendance installée.
> Ce document est une proposition argumentée à valider avant le démarrage du développement.
>
> Documents liés : `PROJECT_ANALYSIS.md` (produit, design, écrans, parcours),
> `DATABASE_PROPOSAL.md` (modèle de données), `DEVELOPMENT_ROADMAP.md` (plan).

## Sommaire

1. Principes directeurs
2. Stack — évaluation et décisions
3. Structure du monorepo
4. Architecture backend — modules
5. Authentification et autorisation
6. Architecture des paiements
7. Architecture des QR Codes
8. Architecture PWA et hors ligne
9. Design system et implémentation du design
10. Observabilité, sécurité, environnements
11. Risques techniques

---

# 1. PRINCIPES DIRECTEURS

Cinq principes tranchent tous les arbitrages qui suivent.

**P1 — L'argent est la partie critique.** Toute décision qui touche au paiement, au solde ou au
retrait privilégie la traçabilité et l'irréversibilité contrôlée sur la simplicité. Une transaction
n'est jamais modifiée : on écrit une opération inverse.

**P2 — Le réseau n'est pas fiable.** Le client ne fait jamais autorité sur un état métier. Le
check-in fonctionne hors ligne par conception, pas par optimisation.

**P3 — Le poids est une contrainte fonctionnelle.** Moins de 150 Ko pour le premier écran public,
1,2 Mo pour la PWA. Une dépendance qui coûte 80 Ko doit se justifier.

**P4 — Modularité sans sur-ingénierie.** Un monolithe modulaire NestJS, pas des microservices. Les
frontières entre modules sont des frontières de code, pas de déploiement. Elles pourront le devenir.

**P5 — Type safety de bout en bout.** Aucun `any` sans commentaire justifiant l'exception. Le schéma
de validation est la source unique de vérité : un même schéma Zod produit le DTO NestJS, la
documentation OpenAPI et le type client.

---

# 2. STACK — ÉVALUATION ET DÉCISIONS

## 2.1 Frontend

| Technologie proposée     | Décision                     | Justification                                                                                                                                                                                                                |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js (App Router)** | ✅ Conservé                  | Indispensable : SEO sur les pages événement (le partage WhatsApp exige des balises Open Graph rendues côté serveur), RSC pour alléger le bundle mobile, ISR pour le catalogue, routing par fichiers cohérent avec le sitemap |
| **TypeScript**           | ✅ Conservé                  | Non négociable (P5)                                                                                                                                                                                                          |
| **Tailwind CSS**         | ✅ Conservé, **v4**          | Le design system du prototype est un système de tokens ; Tailwind v4 les exprime nativement en CSS custom properties, sans fichier de configuration JS. Zéro CSS mort en production                                          |
| **TanStack Query**       | ✅ Conservé                  | Cache, revalidation, retry, statuts de chargement — exactement ce qu'exigent les états UX du prototype. Indispensable pour le polling du statut de paiement                                                                  |
| **React Hook Form**      | ✅ Conservé                  | Assistant en 8 étapes avec brouillon auto-sauvegardé, formulaires longs, validation par champ. Non contrôlé = peu de re-rendus sur Android d'entrée de gamme                                                                 |
| **Zod**                  | ✅ Conservé, **rôle élargi** | Devient la source unique de vérité partagée entre `apps/web` et `apps/api` via `packages/contracts`                                                                                                                          |
| **Zustand**              | ⚠️ Conservé mais **cadré**   | Ne doit pas devenir un store global. Trois stores maximum : panier de checkout, session du scanner hors ligne, préférences d'affichage. Tout le reste appartient à TanStack Query ou à l'URL                                 |
| **PWA**                  | ✅ Conservé, via **Serwist** | `next-pwa` n'est plus maintenu et ne gère pas l'App Router. Serwist est son successeur direct, compatible App Router, avec un contrôle fin des stratégies de cache — nécessaire vu les trois profils de cache distincts      |

**Ajouts jugés nécessaires** :

| Ajout                                     | Rôle                                          | Justification                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Radix UI Primitives**                   | Dialog, Sheet, Popover, Select, Tabs, Tooltip | L'accessibilité (focus trap, navigation clavier, ARIA) ne se réimplémente pas. Headless : aucune contrainte visuelle, la DA du prototype est appliquée intégralement    |
| **CVA** (`class-variance-authority`)      | Variantes de composants                       | Les boutons ont 9 variantes, les badges 10 : CVA les exprime en types plutôt qu'en concaténation de chaînes                                                             |
| **`@zxing/browser`** ou `BarcodeDetector` | Scanner QR                                    | Stratégie : API `BarcodeDetector` native (disponible sur Chrome Android, coût zéro) avec repli WASM ZXing chargé dynamiquement. Le scanner n'est chargé que sur `/scan` |
| **`qrcode`** (serveur)                    | Génération de QR                              | Génération côté serveur, rendu en SVG inline pour le web (net à toute densité, pas de requête réseau) et en PNG pour le PDF                                             |
| **`dexie`** ou IndexedDB natif            | Cache hors ligne du carnet de scan            | Le carnet de 600+ billets et la file de scans en attente ne tiennent pas en `localStorage`. Dexie apporte des index et des transactions pour ~25 Ko                     |
| **`date-fns`** avec locale `fr`           | Dates                                         | Tree-shakable, contrairement à Moment. Formatage français impératif                                                                                                     |
| **`libphonenumber-js`** (version min)     | Normalisation E.164                           | Voir ambiguïté A2 : le numéro est l'identifiant, sa normalisation ne s'improvise pas                                                                                    |

**Ajouts explicitement refusés** :

| Refusé                                                            | Raison                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kit de composants complet (shadcn/ui copié tel quel, MUI, Chakra) | La direction artistique est trop spécifique (corail à texte encre, perforation de billet, verdict pleine page). Un kit générique serait combattu en permanence. Les primitives Radix + le design system maison coûtent moins cher à terme |
| Framer Motion                                                     | Trois micro-interactions seulement, toutes réalisables en CSS. 40 Ko injustifiables                                                                                                                                                       |
| Une bibliothèque de graphiques lourde (Chart.js, ApexCharts)      | Les statistiques MVP se limitent à une courbe et deux barres. Recharts en import dynamique, uniquement sur les écrans concernés, et jamais en mobile                                                                                      |
| Redux / Redux Toolkit                                             | Le besoin d'état global est marginal                                                                                                                                                                                                      |
| tRPC                                                              | Impose un couplage TypeScript client/serveur incompatible avec les webhooks opérateurs et une future application mobile native                                                                                                            |

## 2.2 Backend

| Technologie proposée | Décision              | Justification                                                                                                                                                                                                                                           |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NestJS**           | ✅ Conservé           | Le système d'autorisation à trois niveaux (plateforme / organisation / événement) s'exprime naturellement en guards composables. L'injection de dépendances rend l'abstraction `PaymentProvider` triviale. Les modules cadrent la croissance            |
| **TypeScript**       | ✅ Conservé           | —                                                                                                                                                                                                                                                       |
| **PostgreSQL**       | ✅ Conservé, **v16+** | Données fortement relationnelles, contraintes d'unicité critiques (un check-in par billet), transactions sérialisables pour le stock, `SELECT … FOR UPDATE` pour la réservation, recherche plein texte native suffisante au MVP                         |
| **Prisma**           | ✅ Conservé           | Migrations fiables, typage complet, lisibilité du schéma. Point d'attention : les opérations critiques (décrément de stock, écriture au grand livre) passeront par `$transaction` avec niveau d'isolation explicite et, si nécessaire, du SQL brut typé |
| **Redis**            | ✅ Conservé           | Trois usages : file BullMQ, limitation de débit (OTP, webhooks), verrous de réservation temporaire de stock et cache de sessions                                                                                                                        |
| **BullMQ**           | ✅ Conservé           | Indispensable dès la Phase Paiements : expiration des commandes, réconciliation périodique des paiements en attente, envoi des notifications, génération des PDF, synchronisation des scans                                                             |

**Ajouts jugés nécessaires** :

| Ajout                                 | Rôle                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`nestjs-zod`**                      | Dérive les DTO NestJS et la documentation OpenAPI depuis les schémas Zod de `packages/contracts` — une seule définition pour la validation, les types et la documentation |
| **`@nestjs/swagger`**                 | Documentation OpenAPI générée, base de la génération du client typé                                                                                                       |
| **`@nestjs/throttler`**               | Limitation de débit sur l'authentification et les webhooks                                                                                                                |
| **`pino`** + `nestjs-pino`            | Journalisation structurée JSON avec identifiant de corrélation — condition d'un audit financier exploitable                                                               |
| **`@node-rs/argon2`**                 | Hachage des mots de passe administrateurs (les participants n'en ont pas)                                                                                                 |
| **`@aws-sdk/client-s3`**              | Compatible Cloudflare R2 et S3 ; évite un verrouillage fournisseur                                                                                                        |
| **`sharp`**                           | Redimensionnement et conversion AVIF/WebP des visuels à l'upload — la cible de 150 Ko l'exige                                                                             |
| **`pdfkit`** ou `@react-pdf/renderer` | Billet PDF et relevés. `@react-pdf/renderer` permet de réutiliser les tokens du design system                                                                             |

**Décision refusée** : Drizzle ORM. Techniquement excellent et plus léger, mais son écosystème de
migrations est moins mature que celui de Prisma, et l'équipe gagne plus à disposer d'un studio de
visualisation et de migrations éprouvées sur un projet financier. La couche d'accès aux données étant
isolée dans des repositories, un changement resterait possible.

## 2.3 Monorepo

| Outil               | Décision    | Justification                                                                                                                                                         |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pnpm workspaces** | ✅ Conservé | Économie d'espace disque et d'installation, `node_modules` strict qui empêche les dépendances fantômes                                                                |
| **Turborepo**       | ✅ Conservé | Cache de tâches local et distant, graphe de dépendances entre paquets, exécution incrémentale. Le gain est immédiat dès qu'il y a deux applications et quatre paquets |

**Alternative écartée** : deux dépôts séparés. Le contrat d'API partagé (`packages/contracts`) et le
design system partagé entre `web` et `admin` rendent le monorepo nettement supérieur ici.

## 2.4 Infrastructure

| Composant            | Proposition MVP                                                                                  | Évolution                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Hébergement web      | Vercel (Next.js natif, ISR, edge) — ou Coolify/VPS si la souveraineté des données l'impose       | CDN avec point de présence africain                          |
| Hébergement API      | Vercel Functions (Fluid compute), tâches périodiques via Vercel Cron — voir `docs/DEPLOYMENT.md` | Conteneur sur VPS si la charge ou la souveraineté l'impose   |
| Base de données      | Neon (PostgreSQL managé, pooler intégré, sauvegardes et PITR)                                    | Réplique en lecture pour les statistiques                    |
| Redis                | Instance managée                                                                                 | —                                                            |
| Stockage de fichiers | Cloudinary (visuels transformés à la volée, documents privés en URL signée)                      | Cloudflare R2 si le volume ou les coûts de sortie l'imposent |
| Images               | Transformation à l'upload avec `sharp` + `next/image`                                            | Cloudflare Images si le volume l'exige                       |
| SMS / OTP            | Agrégateur régional à sélectionner (voir risques)                                                | WhatsApp Business API en second canal                        |
| Emails               | Resend ou Postmark                                                                               | —                                                            |
| Surveillance         | Sentry (erreurs) + logs structurés + Uptime Kuma                                                 | OpenTelemetry                                                |

**Point de vigilance** : la latence depuis Cotonou vers un hébergement européen est de l'ordre de
120–180 ms. Acceptable, mais elle impose une conception « peu d'allers-retours » : agrégation des
requêtes, rendu serveur des pages publiques, cache agressif.

---

# 3. STRUCTURE DU MONOREPO

```
nexa-kabi/
├─ apps/
│  ├─ web/                      Next.js — public, participant, organisateur, check-in
│  │  ├─ app/
│  │  │  ├─ (public)/           /, /evenements, /e/[slug], /o/[slug], /recherche
│  │  │  ├─ (auth)/             /connexion, /inscription, /acces-perdu
│  │  │  ├─ (checkout)/         /checkout/[orderRef]/*
│  │  │  ├─ (account)/          /mon-compte/*
│  │  │  ├─ (pro)/              /pro/*
│  │  │  ├─ (scan)/             /scan/*        layout isolé, SW dédié
│  │  │  ├─ t/[token]/          Billet invité
│  │  │  └─ api/                Route handlers BFF (session, upload signé)
│  │  ├─ components/            Composants spécifiques à l'application
│  │  ├─ features/              Découpage par domaine métier
│  │  └─ lib/                   Client API, hooks, service worker
│  │
│  ├─ admin/                    Next.js — admin.nexakabi.bj   (créée en Phase 11)
│  │
│  └─ api/                      NestJS
│     ├─ src/
│     │  ├─ modules/            Un dossier par module métier (voir §4)
│     │  ├─ common/             Guards, interceptors, filters, decorators, pipes
│     │  ├─ infra/              Prisma, Redis, storage, mailer, sms, queue
│     │  └─ main.ts
│     ├─ prisma/                schema.prisma, migrations, seed
│     └─ test/                  e2e
│
├─ packages/
│  ├─ contracts/                Schémas Zod partagés + types + client API généré
│  ├─ ui/                       Design system : tokens, primitives, composants
│  ├─ utils/                    Money (XOF), dates, téléphone, slug, références
│  └─ config/                   Presets eslint, tsconfig, tailwind, prettier
│
├─ docs/                        Documentation projet (ce dossier)
├─ design-reference/            🔒 LECTURE SEULE — prototype de référence
├─ infra/                       docker-compose, scripts, migrations d'infrastructure
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

## 3.1 Décisions de structure

**Pourquoi `admin` en application séparée** — Le prototype impose un sous-domaine distinct avec double
authentification. Une application séparée garantit que le code d'administration n'est jamais servi au
public, réduit la surface d'attaque et permet un déploiement indépendant. Elle partage `ui`,
`contracts` et `utils`, donc le coût de duplication est nul. **Elle n'est créée qu'en Phase 11** —
inutile de porter une application vide pendant dix phases.

**Pourquoi le check-in reste dans `apps/web`** — Le contrôleur reçoit un lien WhatsApp ; un
sous-domaine complique l'installation PWA et la gestion des cookies. Le route group `(scan)` a son
propre layout, son propre manifeste PWA et une stratégie de cache dédiée. **Décision à réviser** si le
bundle de `/scan` dépasse 400 Ko : il devient alors une application autonome.

**Pourquoi `packages/contracts`** — C'est la pièce maîtresse du type safety de bout en bout :

```
packages/contracts/src/
├─ schemas/          Zod : Event, TicketType, Order, Payment, Ticket…
├─ enums/            EventStatus, PaymentStatus, TicketStatus, OrgRole…
├─ dto/              Schémas d'entrée et de sortie par endpoint
└─ index.ts
```

`apps/api` en dérive ses DTO via `nestjs-zod`, ce qui génère automatiquement la documentation
OpenAPI. `apps/web` importe les mêmes types. **Une modification de contrat casse la compilation des
deux côtés** — c'est exactement l'effet recherché.

---

# 4. ARCHITECTURE BACKEND — MODULES

## 4.1 Évaluation du découpage proposé

Le découpage suggéré dans le brief est globalement pertinent. Quatre ajustements :

| Module proposé         | Décision                                 | Motif                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                 | ✅                                       | Cœur, avec OTP et sessions                                                                                                                                                                                                       |
| `users`                | ✅                                       | —                                                                                                                                                                                                                                |
| `organizations`        | ✅                                       | —                                                                                                                                                                                                                                |
| `organization-members` | ⚠️ **Fusionné dans `organizations`**     | Le cycle de vie d'un membre est indissociable de l'organisation ; deux modules imposeraient un couplage circulaire pour un gain nul                                                                                              |
| `events`               | ✅                                       | —                                                                                                                                                                                                                                |
| `event-categories`     | ⚠️ **Fusionné dans un module `catalog`** | Catégories, villes et lieux sont des référentiels de petite taille, administrés ensemble                                                                                                                                         |
| `ticket-types`         | ⚠️ **Fusionné dans `events`**            | Une catégorie de billet n'existe pas hors de son événement ; leurs règles de validation sont entremêlées (quota, période de vente, visibilité)                                                                                   |
| `orders`               | ✅                                       | —                                                                                                                                                                                                                                |
| `payments`             | ✅                                       | Avec sous-dossier `providers/`                                                                                                                                                                                                   |
| `tickets`              | ✅                                       | Émission, jetons, PDF                                                                                                                                                                                                            |
| `check-in`             | ✅                                       | Scan, synchronisation, conflits                                                                                                                                                                                                  |
| `promo-codes`          | ✅ (post-MVP)                            | —                                                                                                                                                                                                                                |
| `payouts`              | ⚠️ **Renommé `finance`**                 | Le module doit porter le grand livre, le solde, les commissions ET les retraits. `payouts` ne décrivait qu'une partie                                                                                                            |
| `notifications`        | ✅                                       | Multi-canal                                                                                                                                                                                                                      |
| `uploads`              | ⚠️ **Renommé `media`**                   | Upload, transformation, purge                                                                                                                                                                                                    |
| `admin`                | ⚠️ **Éclaté**                            | Un module fourre-tout `admin` viole P4. Les endpoints d'administration appartiennent au module métier concerné, protégés par un guard de rôle. Seuls restent dans `admin` : le tableau de bord agrégé et les files de traitement |

**Ajouts** : `moderation` (signalements), `webhooks` (réception, vérification de signature,
idempotence, rejeu), `audit` (journal d'activité, exigé par le prototype).

## 4.2 Liste finale des modules

```
src/modules/
├─ auth/                Sessions, OTP, jetons, appareils, 2FA admin
├─ users/               Profil, préférences, suppression de compte
├─ organizations/       Organisation, membres, invitations, vérification
├─ catalog/             Catégories, villes, lieux (référentiels)
├─ events/              Événement, catégories de billets, publication, brouillon
├─ orders/              Panier, réservation de stock, commande, expiration
├─ payments/            Machine à états, providers, remboursements
│  └─ providers/        mock, mtn-momo, moov-money, celtiis, card, …
├─ tickets/             Émission, jetons signés, QR, PDF, lien public
├─ check-in/            Carnet, scan, synchronisation, conflits
├─ finance/             Grand livre, soldes, commissions, retraits, relevés
├─ promo-codes/         Codes, invitations                        (post-MVP)
├─ notifications/       Email, SMS, WhatsApp, push, préférences
├─ media/               Upload signé, transformation, purge
├─ moderation/          Signalements, workflow, gel de fonds
├─ webhooks/            Réception, signature, idempotence, rejeu
├─ audit/               Journal d'activité horodaté et attribué
├─ admin/               Tableau de bord agrégé, files de traitement
└─ search/              Recherche et filtres publics
```

## 4.3 Anatomie d'un module

```
modules/events/
├─ events.module.ts
├─ events.controller.ts          Endpoints publics et organisateur
├─ events-admin.controller.ts    Endpoints d'administration (guard dédié)
├─ events.service.ts             Orchestration
├─ domain/
│  ├─ event-status.machine.ts    Transitions autorisées
│  └─ ticket-availability.ts     Règles de disponibilité
├─ repositories/
│  └─ events.repository.ts       Seule couche parlant à Prisma
├─ dto/                          Dérivés de packages/contracts
├─ events.listeners.ts           Réactions aux événements applicatifs
└─ __tests__/
```

**Règle** : un service ne fait jamais d'appel Prisma direct ; il passe par un repository. Cela isole
le choix de l'ORM et rend les tests unitaires possibles sans base de données.

## 4.4 Communication inter-modules

Trois mécanismes, par ordre de préférence :

1. **Appel direct de service** pour les dépendances évidentes et synchrones (`OrdersService` appelle
   `EventsService.checkAvailability`).
2. **Événements applicatifs** (`@nestjs/event-emitter`) pour les effets de bord :
   `payment.succeeded` → émission des billets, envoi des notifications, écriture au grand livre. Cela
   évite qu'un échec d'envoi de SMS bloque la génération du billet.
3. **Jobs BullMQ** pour tout ce qui est différé, réessayable ou périodique.

**Événements applicatifs du domaine** :

```
order.created            order.expired           order.cancelled
payment.initiated        payment.pending         payment.succeeded
payment.failed           payment.refunded
ticket.issued            ticket.cancelled
checkin.recorded         checkin.conflict
event.published          event.cancelled         event.postponed
organization.verified    organization.frozen
payout.requested         payout.processing       payout.paid       payout.failed
report.created           report.resolved
```

## 4.5 Aperçu des endpoints principaux

```
POST   /auth/otp/request                { phone }
POST   /auth/otp/verify                 { phone, code } → session
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me

GET    /events                          filtres, pagination, tri
GET    /events/:slug
GET    /events/:slug/ticket-types
GET    /organizations/:slug

POST   /orders                          création + réservation de stock
GET    /orders/:reference
PATCH  /orders/:reference/items
POST   /orders/:reference/promo-code
DELETE /orders/:reference                annulation, libération du stock

POST   /payments/initiate               { orderRef, provider, phone }
GET    /payments/:id/status             polling de secours
POST   /webhooks/payments/:provider     signature vérifiée, idempotent

GET    /tickets/:id
GET    /public/tickets/:token           accès invité
GET    /tickets/:id/pdf

GET    /organizer/organizations
POST   /organizer/organizations
GET    /organizer/events
POST   /organizer/events                brouillon
PATCH  /organizer/events/:id
POST   /organizer/events/:id/publish
GET    /organizer/events/:id/attendees  + export CSV
GET    /organizer/finance/balance
POST   /organizer/finance/payouts
GET    /organizer/team
POST   /organizer/team/invitations

GET    /checkin/events                  événements assignés au contrôleur
GET    /checkin/events/:id/manifest     carnet signé, delta
POST   /checkin/events/:id/scans        lot de scans, idempotent
GET    /checkin/events/:id/stats

POST   /reports                         signalement

GET    /admin/dashboard
GET    /admin/verifications
POST   /admin/organizations/:id/verify
POST   /admin/organizations/:id/freeze
GET    /admin/transactions              + export comptable
GET    /admin/reports
```

---

# 5. AUTHENTIFICATION ET AUTORISATION

## 5.1 Le problème à résoudre

Une même personne peut être simultanément : participante à un événement, propriétaire de son
organisation, gestionnaire dans l'organisation d'un ami, et contrôleuse sur un événement précis d'une
troisième organisation. Un simple champ `role` sur `User` est donc structurellement insuffisant.

**Solution : deux plans d'autorisation combinés.**

```
Plan 1 — RÔLE GLOBAL (sur User)          Plan 2 — APPARTENANCE (sur OrganizationMember)
────────────────────────────────         ──────────────────────────────────────────────
USER      utilisateur ordinaire          OWNER     propriétaire (unique, non révocable)
SUPPORT   lecture + assistance           ADMIN     administration complète, finances
ADMIN     administration plateforme      MANAGER   événements, billets, participants
SUPERADMIN configuration système         SCANNER   scanner, limité à N événements
                                         ANALYST   lecture seule, stats et finances

                          + SCOPE ÉVÉNEMENT (sur OrganizationMember.scopedEventIds)
                            Uniquement pour SCANNER : liste d'événements autorisés,
                            et éventuellement une porte (gate).
```

L'autorisation effective sur une ressource est la résolution de :

```
peut(user, action, ressource) =
     roleGlobal(user) permet action                       // administration plateforme
  ou membre(user, organisation(ressource)) a la permission  // espace organisateur
  ou propriétaire(user, ressource)                          // ses propres billets/commandes
  ou ressource publique et action en lecture
```

## 5.2 Permissions par rôle d'organisation

Table de vérité complète, dérivée des phrases du prototype :

| Permission                   | OWNER | ADMIN | MANAGER |    SCANNER    |    ANALYST     |
| ---------------------------- | :---: | :---: | :-----: | :-----------: | :------------: |
| `organization:read`          |  ✅   |  ✅   |   ✅    | ✅ (minimal)  |       ✅       |
| `organization:update`        |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `organization:delete`        |  ✅   |  ❌   |   ❌    |      ❌       |       ❌       |
| `organization:transfer`      |  ✅   |  ❌   |   ❌    |      ❌       |       ❌       |
| `organization:verify_submit` |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `member:read`                |  ✅   |  ✅   |   ✅    |      ❌       |       ✅       |
| `member:invite`              |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `member:remove`              |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `event:create`               |  ✅   |  ✅   |   ✅    |      ❌       |       ❌       |
| `event:update`               |  ✅   |  ✅   |   ✅    |      ❌       |       ❌       |
| `event:publish`              |  ✅   |  ✅   |   ✅    |      ❌       |       ❌       |
| `event:cancel`               |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `event:read`                 |  ✅   |  ✅   |   ✅    | ✅ (assignés) |       ✅       |
| `ticket_type:manage`         |  ✅   |  ✅   |   ✅    |      ❌       |       ❌       |
| `attendee:read`              |  ✅   |  ✅   |   ✅    | ✅ (minimisé) | ✅ (anonymisé) |
| `attendee:export`            |  ✅   |  ✅   |   ✅    |      ❌       |       ✅       |
| `checkin:scan`               |  ✅   |  ✅   |   ✅    | ✅ (assignés) |       ❌       |
| `checkin:override`           |  ✅   |  ✅   |   ✅    |      ❌       |       ❌       |
| `stats:read`                 |  ✅   |  ✅   |   ✅    |      ❌       |       ✅       |
| `finance:read`               |  ✅   |  ✅   |   ❌    |      ❌       |       ✅       |
| `payout:request`             |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `payout_account:manage`      |  ✅   |  ✅   |   ❌    |      ❌       |       ❌       |
| `promo:manage`               |  ✅   |  ✅   |   ✅    |      ❌       |       ❌       |

Deux points méritent attention :

- **`attendee:read` pour SCANNER est « minimisé »** : nom, catégorie de billet, référence tronquée et
  statut d'entrée. Pas de téléphone complet, pas d'email, pas de montant. Le carnet mis en cache sur
  son appareil contient exactement ce sous-ensemble — c'est aussi une protection en cas de vol du
  téléphone.
- **`attendee:read` pour ANALYST est « anonymisé »** : volumétrie et agrégats, pas la liste nominative.

## 5.3 Mécanisme d'authentification

### Participants et organisateurs — sans mot de passe

```
1. POST /auth/otp/request  { phone: "+229…" }
   → normalisation E.164, limitation de débit (3 demandes / 15 min / numéro,
     10 / heure / IP), génération d'un code à 6 chiffres,
     stockage du HASH du code (jamais le code en clair), TTL 5 minutes,
     envoi SMS avec repli WhatsApp après 45 s si non consommé.
   → réponse identique que le numéro existe ou non (pas d'énumération de comptes).

2. POST /auth/otp/verify   { phone, code }
   → maximum 5 tentatives, puis invalidation du code.
   → si le numéro est inconnu : création du User (status UNVERIFIED → ACTIVE).
   → émission : access token JWT (15 min) + refresh token opaque (90 jours),
     ce dernier lié à un enregistrement Device en base (rotation à chaque usage,
     détection de réutilisation → révocation de toute la famille de jetons).

3. Transport
   → Cookies httpOnly, Secure, SameSite=Lax, domaine .nexakabi.bj
     (partagé entre le site et l'administration ? NON — voir ci-dessous).
```

**Décision sur les cookies** : l'administration utilise un **cookie distinct sur `admin.nexakabi.bj`**,
non partagé avec le domaine principal. Un jeton volé côté public ne doit jamais ouvrir
l'administration.

### Équipe d'administration — identifiant et mot de passe

Un **propriétaire** unique (`nom.owner@xxxx`, amorcé par script) et des **employés**
(`nom.staff@xxxx`, créés depuis l'écran Équipe). Mot de passe seul, haché en scrypt, douze
caractères au minimum ; la double authentification a été retirée à la demande du propriétaire.
Ce qui porte la sécurité à sa place : blocage de quinze minutes après cinq échecs, jeton de
session opaque vérifié en base à chaque requête (révocation immédiate), sessions de 8 h, sessions
coupées à la suspension, à la suppression et à tout changement de mot de passe, journalisation
exhaustive.

Les droits d'un employé sont **par espace** (Événements, Vérifications, Signalements,
Organisations, Utilisateurs, Retraits), à deux niveaux — _consultation_ ou _décision_ — plus un
droit distinct **Mouvements d'argent** (exécuter ou enregistrer un retrait, geler ou dégeler des
fonds), jamais impliqué par un espace. Le calcul vit dans `@nexakabi/contracts`
(`hasAdminAccess`, `canMoveMoney`) et sert des deux côtés : la console masque, l'API refuse.

### Contrôleurs

Invitation par lien WhatsApp à usage unique valable 7 jours → identification par téléphone + code à
6 chiffres, comme les participants. Aucun mot de passe. La session du contrôleur est **limitée dans
le temps à la durée de l'événement + 24 h**, ce qui évite les accès résiduels.

### Fournisseurs tiers

Google et Apple mentionnés dans le prototype comme options secondaires. **Reportés après le MVP** :
ils ajoutent un chemin de création de compte parallèle (donc des cas de fusion de comptes) pour un
gain faible sur un marché où l'identifiant naturel est le téléphone.

## 5.4 Implémentation NestJS

```typescript
// Illustration conceptuelle — non exécutée en Phase 0

@Controller('organizer/events')
@UseGuards(SessionGuard, OrgMemberGuard)
export class OrganizerEventsController {

  @Post(':id/publish')
  @RequirePermission('event:publish')          // vérifié contre le rôle d'organisation
  publish(@Param('id') id: string, @CurrentOrg() org: OrgContext) { … }
}

@Controller('checkin')
@UseGuards(SessionGuard, EventScopeGuard)      // vérifie scopedEventIds pour SCANNER
export class CheckInController { … }

@Controller('admin')
@UseGuards(AdminSessionGuard)
export class AdminController {
  @RequireAdminAccess('payouts', 'act')
  @RequireMoney()
  @Post('payouts/:id/execute') … // « Retraits · décision » ET « Mouvements d'argent »
}
```

L'organisation active est déterminée par un en-tête `X-Organization-Id` (ou un segment de route),
validé par `OrgMemberGuard` qui charge l'appartenance et l'injecte dans le contexte de la requête.
**Aucun contrôleur ne lit `req.user.role` directement** : tout passe par les guards.

## 5.5 Sécurité de l'accès invité aux billets

Le lien `/t/:token` donne accès à un billet sans authentification. Trois mesures :

1. Le jeton est un identifiant aléatoire de 128 bits, indevinable, **distinct** de l'identifiant
   interne du billet.
2. La page n'expose que ce qui figure sur le billet : nom du porteur, événement, catégorie, QR.
   **Ni le téléphone complet, ni l'email, ni le montant payé, ni la commande.**
3. Le jeton peut être révoqué (billet annulé ou remboursé) et est invalidé après l'événement + 30
   jours.

---

# 6. ARCHITECTURE DES PAIEMENTS

## 6.1 Principe fondateur

**Seul le webhook de l'opérateur fait foi.** Un paiement n'est jamais déclaré échoué parce que
l'utilisateur a quitté la page ou qu'un délai navigateur est écoulé. Cette règle, posée explicitement
par le prototype, commande toute la conception.

## 6.2 Pays, moyens de paiement, prestataires

Le système de paiement repose sur **trois objets distincts**, reliés par une configuration et non par
du code. Le Bénin est le premier pays, pas le seul : ouvrir la Côte d'Ivoire consiste à ajouter des
lignes de configuration, jamais un `if (country === 'CI')`.

```
Country                   BJ · CI · SN · TG · BF · ML · …   devise, indicatif, ouvert ?, par défaut ?
        │
CountryPaymentMethod      pays × moyen × prestataire
        │                 collectionEnabled · payoutEnabled          (décision de l'administrateur)
        │                 providerCollectionEnabled · providerPayoutEnabled (constat synchronisé)
        ▼
PaymentRoutingService     listCollectionMethods(pays)   → écran A3, généré
                          resolveCollection(pays, moyen) → prestataire qui encaisse
                          listPayoutMethods(pays)        → formulaire de compte de réception
                          resolvePayout(pays, moyen)     → prestataire qui verse, ou « manuel »
                          syncProvider(prestataire)      → relit le compte marchand
        ▼
PaymentProvider           kkiapay · bictorys (hérité) · mock    une implémentation par PRESTATAIRE
```

Trois pays interviennent dans une vente, et ils peuvent différer : le pays de l'**événement** (fixe la
devise et les moyens du tunnel — c'est le pays de paiement de la commande), le pays de
l'**organisation** (devise de son grand livre, moyens de réception de ses retraits), et le pays du
**payeur** (connu par son numéro ; un Sénégalais peut payer un concert à Cotonou).

**Collecte et versement sont deux capacités distinctes.** Qu'un moyen sache encaisser ne dit rien de
sa capacité à verser. Le compte de réception d'un organisateur se choisit parmi les moyens ouverts en
versement dans son pays, jamais déduit du moyen par lequel les participants ont payé : carte à
l'achat et MTN à la réception est le cas normal.

**Un moyen n'est proposé que si quatre conditions tiennent** : la ligne existe pour ce pays,
l'administrateur l'a ouverte, le prestataire ne l'a pas contredite à la dernière synchronisation, et
le prestataire est branché — sinon, hors production, le simulateur prend sa place ; en production, le
moyen disparaît de l'écran.

```typescript
// apps/api/src/modules/payments/providers/payment-provider.ts

abstract class PaymentProvider {
  readonly code: PaymentProviderCode; // 'kkiapay' | 'bictorys' | 'mock' — un PRESTATAIRE, jamais un moyen
  readonly capabilities: {
    refund: boolean;
    partialRefund: boolean;
    refundMethodKinds: PaymentMethodKind[] | null; // Kkiapay : Mobile Money seulement
    refundWindowDays: number | null;
    payout: boolean;
    statusPolling: boolean;
    /** Le webhook ne prouve rien à lui seul : relire l'état chez le prestataire avant de créditer. */
    verifyWebhookByFetch: boolean;
  };

  /** Comment l'acheteur valide : `push` (téléphone), `redirect` (page), `widget` (fenêtre du prestataire). */
  checkoutFlow(kind: PaymentMethodKind): CheckoutFlow;
  /** Le moyen et le pays sont PASSÉS à chaque appel : le prestataire n'en porte aucun en dur. */
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>; // → redirectUrl ou widget
  /** Reconstruit la fenêtre d'un paiement déjà lancé (obligatoire en `widget`). */
  widget?(input: InitiatePaymentInput): PaymentWidget;
  getStatus(providerReference: string): Promise<ProviderPaymentStatus>; // statut, montant, notre référence
  /** Normalise une notification — `kind: 'payment' | 'payout' | 'refund'`. */
  parseWebhook(raw: RawWebhook): Promise<NormalizedWebhookEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  getRefundStatus?(providerReference: string): Promise<ProviderRefundStatus>;
  payout?(input: PayoutInput): Promise<PayoutResult>;
  getPayoutStatus?(providerReference: string): Promise<ProviderPayoutStatus>;
  /** Ce que le compte marchand sait faire, pays par pays — pour la synchronisation. */
  listMerchantMethods?(): Promise<MerchantMethod[]>;
  listAvailability?(): Promise<ProviderAvailability[]>;
  getBalance?(): Promise<ProviderBalance[]>;
}
```

**Implémentations** :

| Prestataire           | Rôle                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KkiapayProvider`     | **Seul prestataire actif.** Mobile Money et carte en XOF, dans la fenêtre Kkiapay (`widget`) ; vérification serveur `POST /api/v1/transactions/status` ; remboursement intégral Mobile Money (`/api/v1/transactions/revert`) ; pas de versement vers un tiers. Voir `docs/PAYMENT_PROVIDER_KKIAPAY.md` |
| `BictorysProvider`    | **Hérité** : jamais routé, branché seulement pour relire et rembourser ce qu'il a encaissé                                                              |
| `MockPaymentProvider` | Hors production, sans clé Kkiapay. Un seul prestataire pour tous les moyens et tous les pays ; scénarios par numéro (`00`/`11`/`22`) ; page de carte simulée qui envoie le webhook PUIS renvoie l'acheteur |

**Le webhook n'est qu'un signal.** Kkiapay authentifie ses notifications par un secret partagé
(`x-kkiapay-secret`), sans signature du corps. Chaque transaction annoncée est donc **relue** chez
lui avant d'être appliquée ; si la relecture échoue, la notification reste `RECEIVED` et la
réconciliation reprend. Un billet n'est jamais émis sur la seule foi d'un message entrant — ni sur
celle d'un « succès » rapporté par la page.

**La commission ne dépend jamais du moyen de paiement.** `CommissionPolicy` se résout par portée —
organisation > pays > plateforme — et se fige sur la commande. Les frais du prestataire sont une
autre ligne (`PROVIDER_FEE`), constatée à l'encaissement avec ce qu'il annonce avoir retenu SUR
NOUS — des frais payés par l'acheteur en plus du prix n'en font pas partie.

## 6.3 Machine à états

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
  [créée]           ▼                                          │
  INITIATED ──► PENDING ──► PROCESSING ──► SUCCEEDED           │
      │            │             │              │              │
      │            │             │              ├─► REFUNDED   │
      │            │             │              └─► PARTIALLY_REFUNDED
      │            │             │
      │            ├─────────────┴──► FAILED ────┘ (reprise possible)
      │            │
      │            └──► EXPIRED   (délai opérateur dépassé, aucun webhook)
      │
      └──► CANCELLED (annulation explicite avant envoi)
```

| État         | Déclencheur                                                   | Effet sur la commande                     | Effet sur les billets    |
| ------------ | ------------------------------------------------------------- | ----------------------------------------- | ------------------------ |
| `INITIATED`  | Enregistrement local avant l'appel au provider                | `AWAITING_PAYMENT`                        | —                        |
| `PENDING`    | Le provider a accepté la demande, l'utilisateur doit valider  | `AWAITING_PAYMENT`, stock **réservé**     | —                        |
| `PROCESSING` | L'opérateur traite                                            | idem                                      | —                        |
| `SUCCEEDED`  | **Webhook signé** confirmant l'encaissement                   | `PAID`                                    | **Émission des billets** |
| `FAILED`     | Webhook d'échec, ou statut d'échec confirmé par interrogation | `AWAITING_PAYMENT`, stock conservé 30 min | —                        |
| `EXPIRED`    | Job d'expiration, aucun webhook après le délai                | `EXPIRED`, **stock libéré**               | —                        |
| `CANCELLED`  | Annulation utilisateur                                        | `CANCELLED`, stock libéré                 | —                        |
| `REFUNDED`   | Remboursement confirmé                                        | `REFUNDED`                                | Billets `REFUNDED`       |

**Transitions interdites** : `SUCCEEDED` → `FAILED` (un webhook d'échec arrivant après un succès est
journalisé et ignoré), et depuis un état terminal toute transition autre que le remboursement — ou le
**succès tardif**.

**Le succès tardif** (`FAILED`, `EXPIRED`, `CANCELLED` → `SUCCEEDED`) : le prestataire confirme avoir
encaissé un paiement que nous avions clos — validation dans la fenêtre une minute après la fin de la
réservation, confirmation d'opérateur arrivée après notre abandon. L'argent est parti ; le paiement
passe donc à `SUCCEEDED`, et la commande :

- est honorée si ses places sont encore libres (`StockService.secureForPayment` les reprend sous le
  même verrou qu'un achat) ;
- sinon reste telle quelle, et le rapprochement la signale (« Paiement réussi, commande non payée »)
  pour qu'un remboursement suive.

**L'encaissement en double ne s'applique jamais.** La base n'admet qu'un paiement réussi par commande
(index `payment_one_success_per_order`). Un succès qui arrive sur une commande déjà réglée — ou une
seconde transaction réussie sur un paiement déjà réglé — n'est donc pas appliqué : il est consigné
(`payment.duplicate`) et le rapprochement le signale (« Commande payée deux fois »), pour qu'il soit
remboursé. L'acheteur, lui, voit sa commande confirmée.

## 6.4 Séquence nominale

```
Client                API                  Provider           Webhook
  │                    │                       │                 │
  ├─ POST /payments/initiate ─────────────────►│                 │
  │                    ├─ crée Payment(INITIATED)                │
  │                    ├─ verrouille le stock (déjà réservé)     │
  │                    ├─ appelle provider.initiate() ──────────►│
  │                    │◄── providerReference, PENDING ──────────┤
  │◄── { paymentId, status: PENDING, expiresAt } ────────────────┤
  │                    ├─ planifie job expiration (T+3 min)      │
  │                    ├─ planifie job réconciliation (T+30 s, backoff)
  │                    │                       │                 │
  ├─ écran d'attente + compte à rebours        │                 │
  ├─ polling GET /payments/:id/status (5 s)    │                 │
  │                    │                       │                 │
  │        L'utilisateur valide sur son téléphone (USSD)         │
  │                    │                       ├────────────────►│
  │                    │◄─── POST /webhooks/payments/mtn ────────┤
  │                    ├─ vérifie signature HMAC                 │
  │                    ├─ vérifie idempotence (event_id unique)  │
  │                    ├─ transition PENDING → SUCCEEDED         │
  │                    ├─ TRANSACTION :                          │
  │                    │    order → PAID                         │
  │                    │    émission des Tickets + jetons signés │
  │                    │    écriture au grand livre              │
  │                    ├─ émet payment.succeeded                 │
  │                    │      → notifications (WhatsApp, SMS, email)
  │                    │      → génération PDF (job)             │
  │◄── polling renvoie SUCCEEDED ────────────────────────────────┤
  ├─ redirection vers l'écran de confirmation                    │
```

### 6.4.1 Séquence « fenêtre de paiement » (Kkiapay)

Kkiapay ne lance pas de paiement depuis un serveur : c'est son SDK qui ouvre, dans la page, une
fenêtre où l'acheteur choisit son opérateur, saisit son numéro ou sa carte, et valide. La page ne
fait que transporter une RÉFÉRENCE ; le serveur la lit chez Kkiapay, et seule cette lecture règle
la commande.

```
Page                  API                         Kkiapay
  │                    │                             │
  ├─ POST /payments ──►│ Payment(PENDING), expire avec la réservation
  │◄── widget { key publique, sandbox, amount, partnerId = payment.id }
  ├─ openKkiapayWidget ─────────────────────────────►│ l'acheteur valide
  │◄──────────────── succès { transactionId } ───────┤
  ├─ POST /payments/:id/confirm { providerReference }│
  │                    ├─ POST /api/v1/transactions/status ─►│
  │                    │◄── status, amount, partnerId ───────┤
  │                    ├─ partnerId = payment.id ? montant = dû ?
  │                    ├─ TRANSACTION : SUCCEEDED, commande PAID, billets, grand livre
  │◄── SUCCEEDED ──────┤                             │
  │                    │◄── webhook transaction.success (x-kkiapay-secret)
  │                    ├─ relit la transaction, même contrôle → déjà appliqué, sans effet
```

- **Le paiement reste ouvert après un échec.** Dans la fenêtre, l'acheteur peut se tromper puis
  réessayer sur le MÊME paiement (`partnerId` inchangé) : un échec est consigné et montré, le
  paiement reste `PENDING` jusqu'au succès ou à la fin de la réservation.
- **Changer de moyen réutilise le paiement.** MTN → carte : même `partnerId`, seule la famille de la
  fenêtre change — une validation tardive sur l'ancien moyen règle toujours la commande.
- **Trois chemins mènent au même verdict** : la page (`confirm`), la notification, et la
  réconciliation (interrogation de la transaction rattachée). Tous passent par
  `PaymentsService.applyOutcome`, sous verrou : une seule émission de billets.
- **Rien ne s'est rapporté ?** La console (Finance → Transactions → détail) rattache une référence
  de transaction à la main — vérifiée chez Kkiapay avec les mêmes contrôles.

## 6.5 Garanties à implémenter

| Garantie                        | Mécanisme                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Idempotence des webhooks**    | Table `WebhookEvent(providerCode, externalId)` avec index unique. Un événement déjà traité renvoie `200 OK` sans effet de bord. Obligatoire : les opérateurs rejouent            |
| **Vérification de signature**   | HMAC ou signature du provider vérifiée **avant** toute lecture du corps. Corps brut conservé pour rejeu et audit                                                                 |
| **Idempotence de l'initiation** | Clé d'idempotence dérivée de `orderReference + provider`. Une double soumission ne crée pas deux paiements                                                                       |
| **Réconciliation de secours**   | Job périodique interrogeant `getStatus()` sur tous les paiements `PENDING`/`PROCESSING` depuis plus de 60 s, avec backoff exponentiel. Filet de sécurité si un webhook est perdu |
| **Réconciliation quotidienne**  | Comparaison du relevé de l'opérateur avec le grand livre. L'écart est un KPI affiché dans l'administration (« Écart de réconciliation : 0 »)                                     |
| **Verrouillage du stock**       | `SELECT … FOR UPDATE` sur `TicketType` dans la transaction de création de commande. Réservation matérialisée par `StockReservation` avec `expiresAt`                             |
| **Émission atomique**           | La transition vers `PAID`, l'émission des billets et l'écriture au grand livre sont dans **une seule transaction**. Notifications et PDF hors transaction (jobs)                 |
| **Anti-double-paiement**        | Une commande déjà `PAID` refuse toute nouvelle initiation. Un webhook de succès sur une commande déjà payée déclenche une alerte et un remboursement automatique                 |

### 6.5.1 Ce que l'implémentation a corrigé

Trois écarts entre le plan ci-dessus et ce qui fonctionne réellement, découverts
en écrivant les tests de charge. Ils sont consignés ici parce qu'un développeur
qui réécrirait ces fichiers sans les connaître réintroduirait les mêmes défauts.

**L'ordre des verrous n'est pas indifférent.** `SELECT … FOR UPDATE` sur
`TicketType` ne suffit pas : il faut le prendre **avant** d'insérer les lignes de
commande. Une insertion dans `OrderItem` acquiert un verrou `FOR KEY SHARE` sur
la catégorie de billet au titre de la clé étrangère ; deux acheteurs qui
insèrent avant de verrouiller détiennent chacun un verrou partagé et attendent
que l'autre le relâche pour passer en exclusif. PostgreSQL tue alors l'une des
deux transactions. Mesuré : 13 pertes sur 100 acheteurs simultanés.
La réservation se fait donc en deux temps — `lockAndVerify`, puis `apply` — et
la création de la commande s'intercale entre les deux.

**Le pool de connexions fait partie de la garantie.** Une vente flash sérialise
des centaines d'acheteurs sur une même ligne. Avec les valeurs par défaut
(10 connexions, 2 s d'attente), 81 demandes sur 100 étaient refusées faute de
connexion — alors que les places existaient. Le pool est porté à 25 et la
transaction de réservation à `maxWait: 20 s`. Une garantie de correction qui ne
tient pas sous charge n'est pas une garantie.

**La clé d'idempotence doit être stable pendant la fenêtre du double-clic.**
Dériver la clé du nombre total de paiements la fait changer dès qu'un paiement
est créé : dix appels simultanés produisent alors plusieurs paiements. La clé
est dérivée du nombre de tentatives **déjà terminées** — invariante tant
qu'aucune n'a abouti, elle n'avance qu'au moment d'un vrai réessai. Le perdant
de la course sur l'index unique repart avec le paiement du gagnant, jamais avec
une erreur.

### 6.5.2 Tâches périodiques : sans Redis pour l'instant

Le plan prévoit BullMQ pour l'expiration des réservations et la réconciliation.
Redis n'étant pas déployé, ces deux tâches tournent en processus via
`@nestjs/schedule`, protégées par un verrou consultatif PostgreSQL : une seule
instance exécute chaque passage, les autres passent leur tour. La garantie
d'exécution unique en multi-instance est donc préservée sans infrastructure
supplémentaire.

Le verrou est un verrou de TRANSACTION (`pg_try_advisory_xact_lock`), pris et
relâché par la même transaction, ouverte le temps de la tâche. Un verrou de
session (`pg_try_advisory_lock`, la première version) se relâchait par une
seconde requête, partie sur n'importe quelle connexion du pool — et, derrière le
pooler de Neon, sur une connexion serveur partagée : il pouvait rester accroché
et faire sauter les passes au hasard, réconciliation des paiements comprise.

Ce choix reste transitoire. Il devra être révisé dès que l'une de ces trois
conditions apparaît : une tâche dépassant la minute, un besoin de réessai avec
backoff persistant, ou une file d'envois de notifications. La bascule ne touche
que `ReconciliationService` et `AdvisoryLockService`.

## 6.6 Remboursements

| Cas                        | Déclencheur                       | Traitement                                                                                                  |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Annulation d'événement     | Organisateur ou administrateur    | Remboursement automatique en lot, notification immédiate, délai annoncé de 5 jours ouvrés                   |
| Demande selon la politique | Participant, avant la date limite | Automatique si la politique est « remboursable jusqu'à J-N » ; sinon file de traitement organisateur (72 h) |
| Remboursement partiel      | Administrateur                    | Une ligne de grand livre par remboursement, montant libre plafonné au montant payé                          |
| Litige                     | Administrateur                    | Manuel, motif obligatoire, traçable                                                                         |

**Règle** : les frais de service ne sont pas remboursés par défaut (affiché explicitement dans le
récapitulatif du prototype), mais ce comportement est paramétrable par la politique de l'événement.

## 6.7 Grand livre et calcul du solde

Le solde d'un organisateur **n'est pas calculé à la volée** par agrégation des commandes : il découle
d'un **grand livre en écritures immuables** (`LedgerEntry`). C'est la seule façon d'expliquer un
solde, de réconcilier avec un opérateur et de survivre à un audit.

```
Vente d'un billet de 5 000 FCFA (commission 5 % + 100 FCFA, frais opérateur 45 FCFA)

  +5 000  SALE            organisation, événement, commande, billet
  −  350  PLATFORM_FEE    (5 % × 5 000) + 100
  −   45  PROVIDER_FEE
  ────────
   4 605  contribution au solde brut

  Puis :  HOLD  −4 605  jusqu'à la date de déblocage
          RELEASE +4 605  à J+48 h après l'événement (ou 60 % immédiat, palier 2)
          PAYOUT  −X      à l'exécution d'un retrait
          PAYOUT_FEE −Y   frais de retrait 1 %, plafonné à 2 000
          REFUND  −Z      remboursement
          FREEZE / UNFREEZE  gel administratif
```

Solde disponible = somme des écritures `RELEASE` − `PAYOUT` − `PAYOUT_FEE` − `REFUND`, hors montants
gelés. Solde en attente = somme des `HOLD` non encore libérés.

---

# 7. ARCHITECTURE DES QR CODES

## 7.1 Exigences

| Exigence                                                                                      | Origine                  |
| --------------------------------------------------------------------------------------------- | ------------------------ |
| Ne pas encoder un identifiant devinable (`ticketId=123`)                                      | Cahier des charges §12.1 |
| Vérifiable **hors ligne** par le contrôleur                                                   | Prototype, parcours 4    |
| Unicité garantie (un billet = une entrée)                                                     | Cahier des charges §13   |
| Lisible à 30 cm par une caméra Android d'entrée de gamme, écran à 40 % de luminosité, ≥176 px | Prototype, écran billet  |
| Fonctionne sur un billet PDF imprimé                                                          | Prototype                |
| Résistant à la duplication par capture d'écran                                                | Implicite                |

## 7.2 Ce qui ne fonctionne pas

| Approche                                                     | Pourquoi elle échoue ici                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `ticketId` brut                                              | Énumérable, falsifiable                                                                           |
| Jeton aléatoire seul, vérifié en base                        | Nécessite le réseau — inutilisable à la porte                                                     |
| Jeton aléatoire + carnet complet en cache                    | Fonctionne, mais un billet vendu **après** le téléchargement du carnet est refusé à tort          |
| QR rotatif (TOTP)                                            | Incompatible avec le PDF imprimé et avec la consultation hors ligne d'un billet reçu par WhatsApp |
| HMAC avec clé symétrique embarquée dans la PWA du contrôleur | La clé serait extractible, permettant de forger des billets valides                               |

## 7.3 Solution retenue : signature asymétrique + carnet local

**Deux couches complémentaires.**

### Couche 1 — Authenticité (Ed25519, vérifiable hors ligne, sans secret partagé)

```
Charge utile signée (compacte, base64url) :
  v   1                       version du format
  t   <ticketPublicId>        identifiant public du billet, 16 octets aléatoires
  e   <eventShortId>          identifiant court de l'événement
  x   <exp>                   expiration (fin de l'événement + 24 h), en heures Unix

QR encodé :
  NK1.<payload_b64url>.<signature_ed25519_b64url>

Taille : ~50 octets de charge utile + 64 octets de signature
      → ~155 caractères base64url → QR version 7, niveau de correction M.
      Parfaitement lisible à 176 px.
```

- La **clé privée** de signature est détenue **uniquement par le serveur**, dans un secret
  d'environnement (idéalement un KMS). Une paire de clés **par événement**, dérivée d'une clé
  maîtresse, afin qu'une fuite reste circonscrite.
- La **clé publique de l'événement** est distribuée au contrôleur avec le carnet. Elle ne permet que
  de vérifier, jamais de forger.
- Le contrôleur vérifie la signature **hors ligne, instantanément** (Ed25519 en WebCrypto, moins
  d'une milliseconde).

### Couche 2 — Unicité et enrichissement (carnet local + synchronisation)

Le carnet (`manifest`) téléchargé à l'ouverture de l'événement contient, pour chaque billet :

```
{ ticketPublicId, attendeeName, ticketTypeName, referenceSuffix, status, checkedInAt? }
```

Volume : environ 120 octets par billet → **72 Ko pour 600 billets**, compressé. Compatible avec la
cible de poids.

Le contrôleur applique cette logique :

```
1. Signature valide ?                      non → BILLET INVALIDE (rouge)
2. Expiration dépassée ?                   oui → BILLET EXPIRÉ (rouge)
3. Événement correspond ?                  non → AUTRE ÉVÉNEMENT (rouge)
4. Présent dans le carnet local ?
     non → billet émis après le téléchargement :
           signature valide donc AUTORISÉ (vert), marqué « hors carnet »,
           vérifié à la synchronisation
     oui → 5.
5. Déjà marqué comme entré (local ou serveur) ?
     oui → DÉJÀ UTILISÉ (ambre) + heure et porte de la première entrée
     non → VALIDE (vert), enregistrement local horodaté, mise en file de synchronisation
```

**C'est le point clé** : la signature garantit l'authenticité même sans réseau et même pour un billet
absent du carnet ; le carnet garantit l'unicité et fournit le nom à afficher.

## 7.4 Gestion des conflits de double scan

Deux contrôleurs hors ligne peuvent valider le même billet. Le prototype tranche : **jamais d'erreur
affichée au contrôleur pendant l'événement**, qui ne peut rien y faire.

```
À la synchronisation, le serveur applique :
  1. Contrainte unique en base : un seul CheckIn "effectif" par ticket.
  2. En cas de collision, le scan dont l'horodatage CLIENT est le plus ancien gagne.
     (L'horloge du client est corrigée par l'écart mesuré au téléchargement du carnet.)
  3. Le scan perdant est enregistré comme CheckInConflict, avec les deux contrôleurs,
     les deux horodatages et les deux portes.
  4. Le conflit remonte à l'organisateur (écran Check-in), jamais au contrôleur.
```

## 7.5 Limites assumées

- **La capture d'écran d'un QR valide fonctionne** tant que le billet n'a pas été scanné. C'est
  inhérent à un QR statique. La protection réelle est l'unicité du check-in : le second porteur est
  refusé. Le prototype l'assume et prévoit le message « vérifie la pièce d'identité ».
- **Évolution possible** : QR dynamique rotatif (une valeur toutes les 30 s dans la PWA quand elle est
  en ligne), avec repli sur le QR statique hors ligne. À évaluer après le lancement, uniquement si la
  fraude par capture d'écran devient mesurable.

## 7.6 Format de référence de billet

Relevé dans le prototype : `NK-8F4C21-01` — préfixe plateforme, référence de commande à 6 caractères,
suffixe séquentiel du billet dans la commande.

**Alphabet : hexadécimal majuscule `0-9A-F`.** Les quatre références du prototype — `NK-8F4C21`,
`NK-8F51A0`, `NK-8F4F02`, `NK-6A9042` — le sont toutes. Une base 32 excluant les caractères ambigus
aurait été un choix défendable en soi, mais elle contredirait les références du prototype, qui
contiennent des `0` et des `1`. La lisibilité est traitée autrement : la saisie manuelle du
contrôleur corrige les confusions de glyphes (`O`→`0`, `I`→`1`, `S`→`5`…), puisque l'alphabet
hexadécimal ne contient aucune de ces lettres — une occurrence est donc forcément une erreur de
lecture. Voir `packages/utils/src/reference.ts`.

La recherche manuelle du contrôleur porte sur les **4 derniers caractères**.

---

# 8. ARCHITECTURE PWA ET HORS LIGNE

## 8.1 Trois profils, trois stratégies

Le prototype décrit trois usages hors ligne différents. Une seule stratégie de cache serait
inadaptée.

| Profil           | Ce qui est mis en cache                                                         | Volume cible                | Stratégie                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Participant**  | Coque applicative, billets à venir + QR, dernier écran de découverte consulté   | ~1,2 Mo + billets           | Coque en `CacheFirst`, données en `StaleWhileRevalidate`, billets en `CacheFirst` avec revalidation en arrière-plan |
| **Contrôleur**   | Coque du scanner, carnet de l'événement, clé publique, file de scans en attente | ~400 Ko + 72 Ko/600 billets | Carnet en IndexedDB, écriture locale d'abord, synchronisation en arrière-plan                                       |
| **Organisateur** | Coque, brouillon d'événement en cours                                           | ~300 Ko                     | Brouillon en IndexedDB, sauvegarde différée                                                                         |

## 8.2 Ordre de priorité du cache

Ordre explicite donné par le prototype, à respecter :

```
1. Les billets à venir et leurs QR signés
2. La coque de l'application (1,2 Mo, sans images)
3. Le dernier écran de découverte consulté
4. Le brouillon d'événement en cours, côté organisateur
5. Le carnet de scan, côté contrôleur

Rien d'autre. « Un cache trop large sur un Android d'entrée de gamme
se traduit par une application désinstallée. »
```

## 8.3 Périmètre MVP et évolutions

| Fonctionnalité                                              |    MVP    |                 Post-MVP                  |
| ----------------------------------------------------------- | :-------: | :---------------------------------------: |
| Manifeste et installation (« Ajouter à l'écran d'accueil ») |    ✅     |                                           |
| Service worker et coque applicative en cache                |    ✅     |                                           |
| Billets consultables hors ligne (QR + informations)         |    ✅     |                                           |
| Scanner hors ligne complet (carnet, vérification, file)     |    ✅     |                                           |
| Synchronisation en arrière-plan des scans                   |    ✅     |                                           |
| Bandeau hors ligne non bloquant                             |    ✅     |                                           |
| Luminosité forcée à l'affichage du QR                       |    ✅     |                                           |
| Notifications push (Web Push)                               |           |                    ✅                     |
| Brouillon d'événement hors ligne                            |           |                    ✅                     |
| Achat hors ligne (mise en file d'une commande)              | ❌ jamais | Incompatible avec la réservation de stock |
| Apple Wallet / Google Wallet                                |           | ✅ (structure de billet déjà compatible)  |
| Application native React Native                             |           |      ✅ (l'API REST est déjà prête)       |

### 8.3.1 Ce que l'implémentation a corrigé

**Ed25519 dans WebCrypto n'est pas acquis.** La §7.3 annonce une vérification
« Ed25519 en WebCrypto, moins d'une milliseconde ». C'est exact — là où
l'algorithme existe. Il n'est arrivé qu'avec Chrome 137, Safari 17 et
Firefox 129, alors que la cible déclarée de ce produit est un Android d'entrée
de gamme, parfois plus ancien.

Un contrôleur dont le téléphone refuserait TOUS les billets serait la panne la
plus visible imaginable, et elle se produirait précisément à la porte, sans
réseau pour se mettre à jour. `apps/web/lib/scan/verify.ts` détecte donc la
capacité par un essai réel au démarrage, et bascule sinon sur `@noble/ed25519`
— chargé dynamiquement, donc payé uniquement par les appareils concernés.

**La détection d'un conflit d'index dépend de l'adaptateur de pilote.** Avec
`@prisma/adapter-pg`, `meta.target` reste indéfini : le nom de l'index violé se
trouve dans `meta.driverAdapterError.cause.constraint.index`. Chercher au
mauvais endroit fait silencieusement échouer l'arbitrage des doubles scans, qui
sont alors rejetés au lieu d'être consignés. Voir §7.4 et
`apps/api/src/modules/checkin/checkin.service.ts`.

**Background Sync n'est pas disponible partout.** L'API n'existe ni sur Safari
ni sur Firefox. La synchronisation repose donc sur l'événement `online` ET sur
une relance périodique de vingt secondes — cette dernière couvrant le cas, très
fréquent en 3G, d'un réseau qui revient sans changement d'interface réseau.

## 8.4 Accès à la caméra

```
1. Demande de permission explicite, avec explication AVANT l'invite navigateur
   (une permission refusée est très difficile à récupérer).
2. facingMode: 'environment', résolution adaptée (640×480 suffit pour un QR,
   consomme quatre fois moins de CPU que 1080p sur un appareil d'entrée de gamme).
3. Détection : BarcodeDetector natif si disponible → sinon ZXing WASM chargé
   dynamiquement (~250 Ko, uniquement en repli).
4. Torche via la contrainte `torch` sur la piste vidéo, si supportée.
5. Vibration distincte par verdict (Vibration API) : court pour valide,
   double pour déjà utilisé, long pour invalide.
6. Caméra libérée dès que l'écran passe en arrière-plan (batterie).
```

**Contrainte** : `getUserMedia` exige HTTPS. Aucun test possible en HTTP hors `localhost`.

## 8.5 Synchronisation des scans

```
Scan hors ligne
   ↓
Écriture immédiate en IndexedDB (file `pendingScans`)
   { ticketPublicId, scannedAt (horloge corrigée), gate, deviceId, nonce }
   ↓
Compteur « en attente de sync : 12 » visible en permanence
   ↓
Reconnexion détectée (événement `online` ou Background Sync)
   ↓
POST /checkin/events/:id/scans   — envoi par lots de 50, idempotent via `nonce`
   ↓
Réponse : { accepted[], conflicts[] }
   ↓
Purge de la file, mise à jour du carnet local, remontée des conflits à l'organisateur
```

**La file n'est jamais purgée avant confirmation du serveur.** En cas d'échec, réessai avec backoff
exponentiel, et la file survit à un rechargement de page comme à une fermeture de l'application.

---

# 9. DESIGN SYSTEM ET IMPLÉMENTATION DU DESIGN

## 9.1 Tokens

Les valeurs relevées dans `PROJECT_ANALYSIS.md` §3 sont traduites en variables CSS dans
`packages/ui`, consommées par Tailwind v4 via `@theme`.

```css
/* packages/ui/src/tokens.css — illustration */
@theme {
  --color-ink: #12102b;
  --color-ink-700: #1e1a48;
  --color-coral: #ff4d2e;
  --color-coral-50: #ffede8;
  --color-mint: #12b981;
  --color-amber: #f0a92e;
  --color-red: #e03535;
  --color-blue: #3b82f6;
  --color-paper: #f6f5f2;
  --color-surface: #ffffff;
  --color-border: #e7e4dc;
  --color-text-2: #6e6a80;
  --color-text-3: #9c98ac;

  --radius-badge: 6px;
  --radius-field: 10px;
  --radius-button: 11px;
  --radius-card: 14px;
  --radius-panel: 18px;
  --radius-block: 24px;

  --shadow-sm: 0 1px 2px rgb(18 16 43 / 0.06);
  --shadow-md: 0 6px 18px -6px rgb(18 16 43 / 0.18);
  --shadow-lg: 0 20px 44px -16px rgb(18 16 43 / 0.32);

  --font-display: 'Bricolage Grotesque', system-ui, sans-serif;
  --font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;

  --tap-min: 44px;
  --tap-mobile: 48px;
  --tap-primary: 52px;
}
```

## 9.2 Inventaire des composants à produire

| Catégorie          | Composants                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primitives**     | `Button` (9 variantes), `IconButton`, `Input`, `PhoneInput`, `MoneyInput`, `Select`, `DatePicker`, `TimePicker`, `Checkbox`, `Radio`, `Switch`, `Textarea`, `FileDrop`, `OtpInput`          |
| **Affichage**      | `Badge` (10 variantes), `Card`, `Panel`, `Stat`, `Money`, `DateChip`, `Avatar`, `Separator`, `Skeleton`                                                                                     |
| **Structure**      | `Table` + `TableAsCards` (bascule automatique), `Tabs`, `Stepper`, `Breadcrumb`, `Pagination`, `Sidebar`, `BottomNav`                                                                       |
| **Superpositions** | `Dialog`, `Sheet` (bottom sheet mobile), `Popover`, `Tooltip`, `Toast`, `ConfirmDialog` (variante destructive avec conséquences chiffrées)                                                  |
| **États**          | `EmptyState` (2 variantes), `ErrorState`, `OfflineBanner`, `LoadingSkeleton`, `LongWait`                                                                                                    |
| **Métier**         | `EventCard` (4 variantes), `TicketCard`, `DigitalTicket` (avec perforation), `QrDisplay`, `TicketTypeRow`, `PaymentMethodOption`, `ScanVerdict` (3 couleurs), `RoleBadge`, `StatusTimeline` |

## 9.3 Règles de composition à faire respecter par la revue de code

1. Un seul bouton corail par zone de décision.
2. Aucun statut porté par la couleur seule : toujours un libellé textuel.
3. Toute zone tactile ≥ 44 px (48 px en mobile).
4. Aucune largeur fixe sur un bouton.
5. Tout montant passe par `<Money>` : espace insécable, chiffres tabulaires, suffixe atténué.
6. Toute date passe par un formateur français localisé.
7. Cinq états dessinés avant qu'un écran soit considéré comme livré.
8. Aucune animation en dehors des trois autorisées.

## 9.4 Accessibilité

Cible **WCAG 2.1 AA**, cohérente avec l'exigence de contraste du prototype :

- Contraste vérifié automatiquement en CI sur les couples de tokens.
- Navigation clavier complète (Radix la fournit sur les primitives).
- Étiquettes de formulaire associées, messages d'erreur reliés par `aria-describedby`.
- Zone de focus visible (`outline: 3px solid rgba(18,16,43,.10)` — déjà dans le prototype).
- `prefers-reduced-motion` respecté sur les trois animations.
- Verdicts de scan : couleur **+ icône + texte + vibration** (quatre canaux redondants).

---

# 10. OBSERVABILITÉ, SÉCURITÉ, ENVIRONNEMENTS

## 10.1 Sécurité — liste de contrôle

| Domaine              | Mesure                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport            | HTTPS strict, HSTS, redirection systématique                                                                                                                               |
| En-têtes             | CSP stricte, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`                                                                                             |
| Authentification     | Cookies httpOnly/Secure/SameSite, rotation des refresh tokens, détection de réutilisation                                                                                  |
| Force brute          | Limitation de débit sur OTP (par numéro et par IP), verrouillage progressif                                                                                                |
| Injection            | Prisma paramétré ; tout SQL brut passe par des requêtes typées, jamais de concaténation                                                                                    |
| XSS                  | React échappe par défaut ; interdiction de `dangerouslySetInnerHTML` sauf sur du contenu assaini (description d'événement → assainissement serveur avec une liste blanche) |
| CSRF                 | API sans état avec jeton `Bearer` en en-tête sur les mutations, ou double-submit cookie si cookies seuls                                                                   |
| Upload               | Type MIME vérifié côté serveur, extension recalculée, taille limitée, ré-encodage systématique par `sharp` (détruit toute charge utile embarquée)                          |
| Webhooks             | Signature vérifiée avant traitement, idempotence, limitation de débit, corps brut journalisé                                                                               |
| Secrets              | Jamais dans le dépôt ; variables d'environnement validées au démarrage par un schéma Zod (échec rapide)                                                                    |
| Données personnelles | Minimisation (carnet du contrôleur), stockage privé des pièces de vérification, destruction des pièces d'identité à la décision, suppression de compte effective            |
| Administration       | Sous-domaine séparé, identifiant et mot de passe scrypt, droits par espace, sessions courtes révocables, journalisation exhaustive                                          |
| Dépendances          | `pnpm audit` en CI, Dependabot                                                                                                                                             |

## 10.1 bis Vérification d'identité et droit béninois

Référence : **loi n° 2017-20 du 20 avril 2018 portant Code du numérique en République du Bénin**,
Livre cinquième (protection des données à caractère personnel et de la vie privée), modifiée par la
**loi n° 2020-35 du 6 janvier 2021**. Autorité de contrôle : l'**APDP**.

Le catalogue qui fait autorité vit dans `packages/contracts/src/verification-documents.ts` : il dit
quelle pièce peut être demandée, à quel statut d'organisateur, sur quel fondement. L'API applique la
même règle que la console ; ce que l'écran n'affiche pas, l'API le refuse.

### Quatre règles, et ce qu'elles imposent au code

| Règle                        | Traduction dans le produit                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Proportionnalité**         | Aucune pièce d'identité n'est demandée par défaut, à personne. Le rapprochement avec le titulaire du compte Mobile Money suffit — l'opérateur a déjà vérifié cette identité. Une pièce ne devient déposable qu'après une demande écrite et motivée d'un modérateur (`VerificationRequest.requestedDocuments`). |
| **Consentement exprès**      | L'image du visage est une **donnée biométrique** au sens béninois : la définition vise les caractéristiques physiques permettant l'identification unique, « telles que les images faciales », sans exiger de traitement technique particulier — plus large que le RGPD. Une case unique (`IDENTITY_CONSENT`), cochée avant tout dépôt, couvre toutes les pièces personnelles. La version acceptée est enregistrée avec chaque fichier. |
| **Pas de données sensibles** | Le Code interdit par principe le traitement des données révélant les opinions religieuses, philosophiques, politiques, syndicales, la vie sexuelle, l'origine raciale, la santé et la génétique. D'où le retrait des **statuts d'association** du catalogue : ils décrivent l'objet de l'association. Le **récépissé de déclaration** prouve l'existence légale sans rien révéler. Jamais de casier judiciaire, de certificat médical ni de relevé bancaire. |
| **Conservation limitée**     | Les pièces **personnelles** — selfie, CIP, carte d'identité, passeport — sont détruites du stockage dès la décision rendue (`VerificationsService.purgePersonalDocuments`). La ligne en base survit, datée, pour que le dossier dise encore ce qui a été fourni. Les pièces d'**entité** (RCCM, IFU, récépissé, acte) restent : registres publics, pas des données personnelles. |

### Ce qu'on ne fait pas, délibérément

**Aucune reconnaissance faciale, aucun gabarit biométrique, aucun rapprochement automatique.** Un
modérateur regarde la photo et la pièce, et décide. Un traitement d'identification automatisée ferait
basculer la plateforme sous un régime d'autorisation préalable de l'APDP — pour un gain nul sur
quelques dossiers par semaine.

### Ce qui reste à faire hors du code

Deux formalités qu'aucune ligne de code ne remplace, à accomplir **avant la mise en service réelle** :

1. **Déclarer le traitement auprès de l'APDP** (formalités préalables, articles 405 et suivants).
2. **Publier une politique de confidentialité** reprenant les finalités, les durées de conservation
   et les droits d'accès, de rectification et d'opposition — la page `/confidentialite` existe et
   doit être alignée sur ce qui précède.

Cette section décrit une architecture, pas un avis juridique : une relecture par un conseil inscrit
au barreau béninois reste nécessaire avant l'ouverture commerciale.

## 10.2 Observabilité

- **Journalisation structurée** (pino) avec `requestId` propagé, et `orderRef` / `paymentId` sur toute
  la chaîne financière.
- **Sentry** côté web et API, avec filtrage des données personnelles.
- **Métriques métier** exposées dans l'administration : taux de conversion du tunnel, taux de succès
  par opérateur, délai médian de confirmation Mobile Money, écart de réconciliation, taux de scan
  hors ligne, taux de conflit.
- **Alertes** : écart de réconciliation ≠ 0, taux d'échec de paiement au-dessus d'un seuil, file de
  webhooks en retard, job en échec répété.

## 10.3 Environnements

| Environnement | Base de données           | Paiements             | Objet                    |
| ------------- | ------------------------- | --------------------- | ------------------------ |
| `local`       | PostgreSQL Docker         | `MockPaymentProvider` | Développement            |
| `preview`     | Base éphémère par branche | Mock                  | Revue de PR              |
| `staging`     | Copie anonymisée          | Bac à sable opérateur | Recette, tests de charge |
| `production`  | Managée, PITR             | Réel                  | —                        |

## 10.4 Qualité

| Niveau              | Outil                                         | Périmètre                                                                       |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| Types               | `tsc --noEmit`                                | Bloquant en CI                                                                  |
| Lint                | ESLint + règle interdisant `any` non justifié | Bloquant                                                                        |
| Format              | Prettier                                      | Bloquant                                                                        |
| Tests unitaires     | Vitest                                        | Logique métier : calcul des frais, machines à états, disponibilité, grand livre |
| Tests d'intégration | Jest + Testcontainers                         | Repositories, transactions, contraintes d'unicité                               |
| Tests e2e API       | Supertest                                     | Parcours d'achat complet avec provider simulé                                   |
| Tests e2e web       | Playwright                                    | Achat, création d'événement, scan (caméra simulée)                              |
| Performance         | Lighthouse CI                                 | Seuils : LCP < 2,5 s en 3G simulée, poids du premier écran < 150 Ko             |
| Accessibilité       | axe-core dans Playwright                      | Bloquant sur les écrans du tunnel d'achat                                       |

**Couverture ciblée** : 90 % sur `payments`, `finance`, `tickets`, `check-in`. Aucune cible imposée
ailleurs — la couverture n'est pas un objectif en soi.

---

# 11. RISQUES TECHNIQUES

| #   | Risque                                                                                                                                | Impact                                 | Probabilité              | Mitigation                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Contractualisation Mobile Money** : délais d'obtention des accès marchands MTN/Moov, exigences KYC, absence d'environnement de test | 🔴 Bloque le lancement                 | Élevée                   | Démarrer la démarche **dès la Phase 1**, en parallèle du développement. Évaluer un agrégateur régional comme plan A. `MockPaymentProvider` permet de développer 100 % du reste sans attendre |
| R2  | **Statut réglementaire de la détention de fonds** (BCEAO)                                                                             | 🔴 Bloque la production                | Moyenne                  | Conseil juridique en Phase 1. Privilégier un montage où les fonds ne transitent pas par un compte propre                                                                                     |
| R3  | **Webhook perdu ou tardif** → billet non délivré alors que le client a payé                                                           | 🔴 Perte de confiance                  | Élevée                   | Réconciliation par interrogation avec backoff + réconciliation quotidienne + alerte sur écart                                                                                                |
| R4  | **Concurrence sur le stock** lors d'une vente flash                                                                                   | 🟠 Sur-vente                           | Moyenne                  | `SELECT … FOR UPDATE`, réservations à expiration, test de charge dédié en Phase 6                                                                                                            |
| R5  | **Conflits de scan hors ligne** mal gérés                                                                                             | 🟠 Refus injustifié à la porte         | Moyenne                  | Politique « premier horodatage gagne », conflit remonté à l'organisateur et jamais au contrôleur, horloge client corrigée                                                                    |
| R6  | **Performance sur Android d'entrée de gamme**                                                                                         | 🟠 Abandon                             | Élevée                   | Budget de performance en CI, RSC par défaut, imports dynamiques, images AVIF, tests sur appareil réel dès la Phase 5                                                                         |
| R7  | **Coût et délivrabilité des SMS OTP**                                                                                                 | 🟠 Blocage à l'inscription             | Élevée                   | Deux fournisseurs, repli WhatsApp après 45 s, limitation de débit, surveillance du taux de livraison                                                                                         |
| R8  | **WhatsApp Business API** : validation Meta, modèles de message pré-approuvés, délais                                                 | 🟠 Canal principal indisponible        | Moyenne                  | Démarrer la validation tôt. Repli : lien `wa.me` pré-rempli côté client (aucune API requise) — suffisant pour le MVP                                                                         |
| R9  | **Latence Cotonou ↔ Europe**                                                                                                          | 🟡 Lenteur perçue                      | Certaine                 | Conception avec peu d'allers-retours, ISR sur les pages publiques, CDN, agrégation des requêtes                                                                                              |
| R10 | **Fuite du carnet de billets** depuis un téléphone de contrôleur                                                                      | 🟡 Données personnelles                | Faible                   | Carnet minimisé, session limitée à la durée de l'événement + 24 h, purge automatique                                                                                                         |
| R11 | **Compromission de la clé de signature des QR**                                                                                       | 🔴 Billets forgeables                  | Faible                   | Clé dérivée par événement, stockage en KMS, rotation possible, révocation d'un événement sans impacter les autres                                                                            |
| R12 | **Complexité du grand livre** sous-estimée                                                                                            | 🟠 Soldes faux                         | Moyenne                  | Écritures immuables, tests de propriétés sur l'invariant de solde, réconciliation quotidienne automatisée                                                                                    |
| R13 | **Ambiguïté du modèle de commission** (A1) découverte tard                                                                            | 🟠 Reprise du calcul et de l'affichage | Certaine si non tranchée | Trancher avant la Phase 6 ; modéliser les deux répartitions dès le départ                                                                                                                    |
| R14 | **Format de numérotation téléphonique** (A2)                                                                                          | 🔴 Inscription et paiement cassés      | Élevée                   | Valider le plan de numérotation avant la Phase 3, normaliser en E.164, prévoir la conversion de l'ancien format                                                                              |
