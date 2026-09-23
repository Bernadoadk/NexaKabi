# Intégration d'un nouvel agrégateur — étude et intégration (KPay)

> Étude du système de paiement existant et de ce que coûte réellement l'arrivée d'un
> agrégateur supplémentaire. Les sections A à T ont été écrites **avant** toute modification ;
> l'état de livraison ci-dessous a été ajouté après.

---

## Décision V1 — KPay, seul prestataire

Le produit part avec **un seul prestataire opérationnel**. Ce qui a changé :

| | Avant | V1 |
| - | ----- | -- |
| Prestataire actif | Bictorys | **KPay** |
| Bictorys | Actif | **`LEGACY`** — écarté du routage, conservé pour l'historique |
| Moyens ouverts (BJ) | MTN, Moov, carte (Bictorys) | **MTN, Moov (KPay)** |
| Carte | Bictorys | Aucun prestataire (USD chez KPay) |
| État des opérateurs | Inconnu | **Relevé toutes les 5 min chez KPay** |
| Logos | Aucun | **Un par opérateur, avec sa couleur** |

`PaymentProviderDefinition.status` porte la décision : `ACTIVE` ou `LEGACY`. C'est le seul
endroit où « KPay est le seul prestataire du lancement » est écrit. Ajouter CinetPay plus tard
consiste à déposer une implémentation de `PaymentProvider` et à la déclarer `ACTIVE` — le tunnel,
le grand livre, les commissions et les retraits n'ont rien à savoir.

**Pourquoi `LEGACY` et non une suppression** : un prestataire qui a encaissé ne disparaît jamais
vraiment. Des paiements portent son code ; il faut pouvoir les relire, les rembourser et les
expliquer des mois plus tard. Ses 31 lignes de configuration sont fermées, pas effacées.

---

## État de livraison

**KPay est branché et vérifié.** `kpay.site` a été retenu (§G.0), et son catalogue relevé
endpoint par endpoint dans sa documentation.

| Livré | Détail |
| ----- | ------ |
| `KpayProvider` | Encaissement USSD, statut, versement, webhooks signés HMAC-SHA256 |
| Codes de moyen **par pays** | `MTN_MOMO_BEN`, `ORANGE_SEN`… — dimension nouvelle du modèle |
| Coexistence des prestataires | Bictorys et KPay branchés ensemble : la bascule devient possible |
| Configuration | 8 lignes `country_payment_method`, **fermées**, en position 110+ |
| Garde-fous d'environnement | Trio de clés exigé, préfixe de clé contrôlé contre `NODE_ENV` |
| Contrôle montant/devise | Une notification qui ne concorde pas est refusée et consignée |
| **Correctif F7** | Les webhooks orphelins sont enfin repris (défaut silencieux de l'existant) |

**Ce qui reste volontairement hors périmètre** : la carte par KPay (facturée en USD, §G.0),
le remboursement par son API (inexistant), l'administration financière et le remboursement
manuel (§E.2, antérieurs à KPay), les logos (§H.2).

**Décisions prises en cours d'intégration, toutes fondées sur sa documentation :**

- **La carte n'est pas confiée à KPay.** Sa page hébergée facture **en USD** (minimum 1 USD),
  l'acheteur réglant l'équivalent en monnaie locale. Une commande Nexa-Kabi est un entier de
  francs CFA : passer par une conversion dont nous ne maîtrisons ni le taux ni l'arrondi ferait
  diverger le montant encaissé du montant dû, et le grand livre avec.
- **`capabilities.refund: false`.** Son API n'expose aucun remboursement — seulement des
  notifications `refund.*` pour ceux décidés depuis son tableau de bord. Le service de
  remboursement dit alors clairement qu'il faut le faire à la main.
- **Le Togo et Wave ne sont pas couverts** par KPay ; ils restent chez Bictorys.
- **Pas de `KPAY_ENVIRONMENT`.** Une seule adresse, et c'est le préfixe de la clé qui décide.
  Un réglage séparé laisserait croire qu'on peut viser le bac à sable avec une clé de
  production — on ne peut pas.

**Recette exécutée** (`typecheck`, `lint`, `build` au vert sur les 7 paquets ; API démarrée,
migration appliquée, base nettoyée après) :

- signature valide acceptée, signature falsifiée refusée (401), corps altéré après signature
  refusé (401) ;
- cinq notifications identiques → **une seule ligne** `webhook_event` ;
- notification d'un paiement inconnu conservée en `RECEIVED` pour reprise, jamais rejetée ;
- `refund.*` ignoré sans erreur, `payout.*` reconnu comme versement ;
- codes de moyen résolus par pays, et `null` là où KPay ne traite pas (MTN au Sénégal, carte,
  Togo) ;
- configuration refusée au démarrage sur clé incomplète ou préfixe incohérent ;
- Bictorys et KPay branchés ensemble, sans avertissement ni régression.

**Avant le premier encaissement réel** : poser les clés de bac à sable, déclarer le webhook
sur `https://<api>/api/webhooks/payments/kpay`, puis ouvrir un moyen à la fois depuis
« Pays & paiements ». Le bac à sable de KPay ne propose des numéros de test **que pour le
Cameroun** : la recette de bout en bout au Bénin demandera soit des numéros béninois de test
fournis par KPay, soit un premier encaissement réel de petit montant.

---

## Avertissement liminaire — deux écarts avec l'énoncé

**1. Nexa-Kabi n'utilise pas PayDunya.** Une recherche exhaustive du dépôt (code, schéma,
migrations, documentation, verrou de dépendances) ne trouve aucune occurrence de PayDunya.
Le prestataire réellement implémenté est **Bictorys**, doublé d'un **simulateur** (`mock`)
actif hors production tant qu'aucune clé n'est renseignée. Une implémentation FedaPay a
existé et a été supprimée (`apps/api/src/modules/payments/providers/fedapay.provider.ts`,
visible en `D` dans l'état Git courant). Il n'y a donc **rien à retirer de PayDunya** : le
sujet réel est l'ajout — ou la substitution — d'un prestataire à Bictorys.

**2. « KPay » désigne deux sociétés distinctes**, et le choix entre les deux change
sensiblement le travail. Voir §G.0. Ce point doit être tranché avant toute implémentation.

---

## A. État actuel du projet

Monorepo pnpm + Turborepo, trois applications et quatre paquets partagés.

| Emplacement          | Rôle                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `apps/web`           | Next.js — public, participant, organisateur (`/pro`), check-in     |
| `apps/admin`         | Next.js — console d'administration                                 |
| `apps/api`           | NestJS — API REST, Prisma, tâches planifiées                       |
| `packages/contracts` | Schémas Zod, énumérations, machines à états — source de vérité     |
| `packages/ui`        | Design system (33 composants)                                      |
| `packages/utils`     | Montants entiers, téléphones E.164, devises, dates                 |

**Base de données** : PostgreSQL, 48 modèles Prisma (2 110 lignes de schéma). Les entités
financières sont toutes présentes : `Payment`, `PaymentAttempt`, `WebhookEvent`, `Refund`,
`LedgerEntry`, `Payout`, `PayoutAccount`, `CommissionPolicy`, `Country`,
`CountryPaymentMethod`, `AuditLog`.

**Rôles et permissions.** Trois plans distincts, sans recouvrement :

- _Global_ : `USER`, `OWNER`, `STAFF`.
- _Organisation_ : `OWNER`, `ADMIN`, `MANAGER`, `SCANNER`, `ANALYST`, appliqués par
  `OrgMemberGuard` via une matrice de permissions ; aucun contrôleur ne compare un rôle en dur.
- _Console_ : sept espaces (`events`, `verifications`, `reports`, `organizations`, `users`,
  `payouts`, `settings`), chacun en _consultation_ ou _décision_, plus un droit séparé
  `canMoveMoney` exigé par tout geste déplaçant de l'argent.

**Tests.** Le projet n'a **aucune suite de tests automatisés**, par décision explicite
(README, §« Aucune donnée de démonstration »). La vérification se limite à `pnpm typecheck`,
`pnpm lint`, `pnpm build`, et à une recette manuelle par les écrans réels. Cette contrainte
gouverne §Q.

---

## B. Workflow actuel

### Achat

1. `POST /api/checkout/orders` — commande en `DRAFT`, stock réservé (`StockReservation`),
   `expiresAt` posé. Un jeton de checkout signé (secret **distinct** de celui des sessions)
   autorise la suite sans compte.
2. `PATCH .../buyer` puis `POST .../confirm` — la commande passe en `AWAITING_PAYMENT`. Les
   montants sont figés ici : `subtotalAmount`, `platformFeeAmount` et sa répartition
   acheteur/organisateur, `totalAmount`, `organizerNetAmount`, avec l'identifiant de la
   politique de commission appliquée.
3. `GET .../payment-methods` — moyens ouverts **dans le pays de la commande**.
4. `POST .../payments` — `PaymentsService.initiate()`.
5. Écran d'attente, interrogation toutes les 3 s de `GET .../payments/:paymentId`.
6. Webhook du prestataire → `PaymentsService.handleWebhook()`.
7. `applyOutcome()` → `SUCCEEDED` → `orders.markPaid()` dans la même transaction →
   événement `order.paid` → émission des billets.

### Le paiement, en détail

`initiate()` (`payments.service.ts:108`) enchaîne, dans cet ordre :

- refus si la commande n'est pas `AWAITING_PAYMENT` ou si sa réservation a expiré ;
- **routage avant toute écriture** — `PaymentRoutingService.resolveCollection(pays, moyen)` ;
- normalisation du numéro payeur dans le pays **de paiement** (un payeur sénégalais donne un
  `+221`, pas l'indicatif de son identifiant de connexion) ;
- reprise d'une demande en cours identique ; abandon explicite si le moyen ou le numéro diffère ;
- clé d'idempotence **déterministe** `${orderId}:${retryGeneration}`, où le rang ne compte que
  les demandes **terminées** — deux clics simultanés calculent la même clé, l'index unique
  tranche, et le perdant repart avec le paiement du gagnant plutôt qu'avec une erreur ;
- appel du prestataire, journalisation dans `PaymentAttempt`, écriture d'audit.

En cas d'absence de réponse du prestataire, le paiement **reste `INITIATED`** : déclarer
l'échec risquerait de contredire un débit réellement passé. La réconciliation tranchera.

### Statuts et machine à états

`PaymentStatus` : `INITIATED`, `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `EXPIRED`,
`CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`. Les transitions passent par un point unique,
`applyOutcome()`, sous verrou `SELECT … FOR UPDATE`, et sont validées par
`canTransitionPayment()`. Un échec arrivant **après** un succès est consigné et **non appliqué**.

`OrderStatus` : `DRAFT`, `AWAITING_PAYMENT`, `PAID`, `COMPLETED`, `EXPIRED`, `CANCELLED`,
`REFUNDED`, `PARTIALLY_REFUNDED`. `PayoutStatus` : `PENDING`, `PROCESSING`, `PAID`, `FAILED`,
`CANCELLED`. `RefundStatus` : `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.

> L'énoncé demandait `CREATED`/`SUCCESS`. Les équivalents existent sous d'autres noms
> (`INITIATED`/`SUCCEEDED`) et sont utilisés partout, base comprise. **Il ne faut pas les
> renommer** : le gain serait nul et le risque considérable.

### Retrait organisateur

Solde calculé (§I) → `POST /organizer/finance/payouts` → `Payout` en `PENDING` → exécution
automatique si un prestataire branché sait verser sur ce moyen, sinon virement manuel
enregistré en console (`POST /admin/payouts/:id/record`).

---

## C. Architecture actuelle

```
apps/web  ──cookies httpOnly──▶  route handlers Next  ──▶  API NestJS
                                                            │
                          ┌─────────────────────────────────┤
                          │                                 │
                   PaymentsService                  PaymentRoutingService
                          │                                 │
                          ▼                                 ▼
                 PaymentProviderRegistry         CountryPaymentMethod (base)
                          │
              ┌───────────┴───────────┐
       BictorysProvider        MockPaymentProvider
```

**Le navigateur ne parle jamais directement à l'API** : les jetons vivent dans des cookies
`httpOnly` posés par les route handlers de Next. Aucun secret de prestataire ne peut donc
atteindre le client, structurellement.

**Trois concepts séparés** (`packages/contracts/src/payments.ts`) :

| Concept         | Exemple                    | Vu du participant | Où il est défini              |
| --------------- | -------------------------- | ----------------- | ----------------------------- |
| **Pays**        | `BJ` → XOF, +229           | Oui (implicite)   | Table `country`               |
| **Moyen**       | `mtn_momo` → « MTN MoMo »  | **Oui**           | Catalogue en contrats         |
| **Prestataire** | `bictorys` → `mtn_money`   | **Jamais**        | Enum + implémentation         |

La table `country_payment_method` relie les trois, avec **deux paires de drapeaux** : la
_décision_ de l'administrateur (`collectionEnabled`/`payoutEnabled`) et le _constat_
synchronisé depuis le compte marchand (`providerCollectionEnabled`/`providerPayoutEnabled`,
`null` = pas encore su). Un moyen n'est proposé que si décision **et** constat l'autorisent
**et** qu'un prestataire est branché.

---

## D. Ce qui peut être conservé — intégralement

C'est la conclusion principale de l'étude : **l'architecture demandée existe déjà**. Aucune
des pièces suivantes ne doit être réécrite pour accueillir un agrégateur de plus.

| Élément                                    | Fichier                                    | Verdict |
| ------------------------------------------ | ------------------------------------------ | ------- |
| Contrat `PaymentProvider` (9 méthodes)     | `providers/payment-provider.ts`            | Conservé tel quel |
| Registre de prestataires                   | `provider.registry.ts`                     | Conservé |
| Routage pays → moyen → prestataire         | `payment-routing.service.ts` (497 l.)      | Conservé |
| Machine à états + verrou `FOR UPDATE`      | `payments.service.ts:494`                  | Conservé |
| Idempotence webhook `(providerCode, externalId)` | `schema.prisma:1496`                 | Conservé |
| Idempotence initiation                     | `payments.service.ts:182`                  | Conservé |
| Réconciliation par interrogation           | `reconciliation.service.ts`                | Conservé, à étendre (§P) |
| Grand livre immuable                       | `ledger.service.ts` (496 l.)               | Conservé |
| Politique de commission par portée         | `commission.service.ts`                    | Conservé |
| Versements + planificateur                 | `payouts.service.ts` (763 l.)              | Conservé |
| Remboursements (service)                   | `refunds.service.ts`                       | Conservé, à exposer (§E) |
| Journal d'audit                            | `audit.service.ts`                         | Conservé |
| Tunnel d'achat, écrans A3/A4/A6            | `payment-flow.tsx`                         | Conservé, logos à ajouter |
| Console « Pays & paiements »               | `admin-settings.controller.ts`             | Conservé |
| Permissions console + `canMoveMoney`       | `packages/contracts/src/admin.ts`          | Conservé |

Le contrat `PaymentProvider` couvre déjà, nommément : `initiate`, `getStatus`,
`parseWebhook`, `refund`, `payout?`, `getPayoutStatus?`, `listMerchantMethods?`, plus un
drapeau `capabilities` à cinq entrées. Il correspond point par point à l'interface souhaitée
dans l'énoncé — la seule différence est `getAvailableMethods`, qui existe sous le nom
`listMerchantMethods` et remonte le **compte marchand**, la disponibilité restant une
décision de configuration.

---

## E. Ce qui doit être adapté

### E.1 — Obligatoire pour brancher KPay

1. **`PAYMENT_PROVIDERS`** (`contracts/src/enums.ts:202`) : ajouter `'kpay'`. Enum figée par
   choix — elle interdit qu'un code de prestataire inconnu entre en base.
2. **`PAYMENT_PROVIDER_DEFINITIONS`** (`contracts/src/payments.ts:234`) : table de
   correspondance `mtn_momo → <code KPay>`, etc. **Codes issus de la documentation, jamais
   déduits** — c'est la règle déjà appliquée à Celtiis Cash, volontairement absent chez
   Bictorys faute de code documenté.
3. **`KpayProvider`** : une classe, ~400 lignes, sur le modèle de `bictorys.provider.ts`.
4. **`config/env.ts`** : `KPAY_*` + règle de cohérence « clé renseignée ⇒ secret de webhook
   obligatoire », comme celle qui existe pour Bictorys (`env.ts:282`).
5. **`PaymentsModule`** — _modification structurelle réelle_. La fabrique actuelle
   (`payments.module.ts:43`) enregistre **un seul** prestataire :

   ```ts
   if (bictorysKey) providers.push(new BictorysProvider(config));
   else if (!isProduction) providers.push(new MockPaymentProvider(config));
   ```

   Deux prestataires réels ne peuvent pas coexister. C'est exactement ce qu'exige une
   migration progressive (§R). À remplacer par une accumulation, le simulateur restant
   conditionné à « hors production **et** aucun prestataire réel ».

6. **Migration SQL** : lignes `country_payment_method` pour `kpay`, sur le modèle de
   `20260919120000_country_methods_west_africa`.

### E.2 — Demandé par l'énoncé, réellement manquant

7. **Logos des moyens de paiement** (§H). Aucun asset n'existe ; l'écran A3 affiche un bouton
   radio et un libellé.
8. **Administration financière** (§J). La console n'a qu'un écran « Retraits ». Il n'existe
   **aucune** vue des paiements, aucune vue comptable, aucun rapprochement.
9. **Remboursements pilotables.** `RefundsService` existe (300 lignes) mais **n'est exposé par
   aucun contrôleur** : son unique appelant est `events.service.ts:544`, l'annulation
   d'événement. Un remboursement au cas par cas est donc **impossible aujourd'hui**, alors
   que le modèle le prévoit (`RefundReason.CUSTOMER_REQUEST`, `DISPUTE`, `ADMIN`) et que les
   événements peuvent porter une politique `CASE_BY_CASE`. C'est un trou fonctionnel
   indépendant du changement de prestataire.
10. **Distinction frais constatés / frais estimés** (§I.3).

---

## F. Problèmes et risques actuels

| # | Sujet | Constat | Gravité |
| - | ----- | ------- | ------- |
| F1 | Remboursement | Service non exposé ; aucun remboursement manuel possible | **Élevée** |
| F2 | Admin finance | Aucune vue des paiements ni vue comptable | **Élevée** |
| F3 | Frais prestataire | `providerFeeAmount` tombe à `0` si le prestataire ne les annonce pas (`payments.service.ts:548`) ; rien ne distingue « nul » de « inconnu » | Moyenne |
| F4 | Rapprochement | Sens unique : on détecte le webhook perdu, jamais la transaction du prestataire sans paiement chez nous | Moyenne |
| F5 | Module paiements | Un seul prestataire à la fois — empêche toute bascule progressive | Moyenne |
| F6 | Simulateur | Remplace **n'importe quel** prestataire absent (`payment-routing.service.ts:433`), y compris pour des lignes configurées pour un autre. Borné au hors-production, donc acceptable — à ne pas élargir | Faible |
| F7 | Réconciliation | `extractProviderReference` (`reconciliation.service.ts:189`) lit `providerReference` **à la racine** du corps brut. Aucun prestataire réel n'émet ce champ : les webhooks orphelins de Bictorys (`{id, status}`) ne sont donc **jamais** repris — ils sont marqués `FAILED`. À corriger en déléguant au `parseWebhook` du prestataire | **Élevée** |
| F8 | Remboursement partiel | `Refund.amount` existe, mais Bictorys ne rembourse qu'intégralement (`partialRefund: false`) | Faible |
| F9 | Ordre des webhooks | Géré par la machine à états, pas par un horodatage : un `PROCESSING` tardif après `SUCCEEDED` est refusé par `canTransitionPayment`. Correct, mais repose entièrement sur la table de transitions | Faible |

> **F7 est le défaut le plus sérieux trouvé dans l'existant**, et il est silencieux : il ne se
> manifeste que lorsqu'un webhook précède l'enregistrement de l'initiation, cas rare mais
> précisément celui que le filet est censé rattraper.

**Ce qui est déjà correct et ne doit pas être « amélioré »** : la vérification du secret en
temps constant (`timingSafeEqual`), la relecture systématique chez le prestataire avant tout
crédit (`verifyWebhookByFetch`), le corps brut conservé, la réponse 200 même sur rejeu, le
masquage du numéro payeur à l'écran, l'absence totale de limitation de débit sur les webhooks.

---

## G. Architecture cible

### G.0 — Décision préalable : quel KPay ?

Deux sociétés portent ce nom. Le choix n'est pas cosmétique.

| | **K-Pay Africa** | **K-PAY** |
| - | ---------------- | --------- |
| Site | `kpay.africa` | `kpay.site` |
| Base d'API | `pay.esicia.com` | `admin.kpay.site` |
| Pays | Rwanda | **12 pays, dont Bénin, Côte d'Ivoire, Sénégal** |
| Devises | RWF (USD annoncé) | Multi-devises |
| Moyens | MoMo MTN, Airtel, Visa/MC, SPENN | Mobile Money, cartes, portefeuilles, USDT |
| Auth | `Kpay-Key` + Basic | `x-api-key`, `kpay_test_` / `kpay_live_` |
| Paiement | `{"action":"pay"}` | `POST /api/v1/payments/init` |
| Statut | `{"action":"checkstatus"}` | documenté |
| Remboursement | **non documenté** | annoncé |
| Payout | **non documenté** | annoncé |
| Idempotence | aucune | **`externalId`**, conflit → `409` |

**K-PAY (`kpay.site`) est le seul compatible avec Nexa-Kabi** : K-Pay Africa ne couvre ni le
Bénin, ni le XOF, et n'expose ni remboursement ni versement — deux capacités dont le produit
dépend. La suite de cette étude suppose `kpay.site`.

**Deux réserves à lever avant d'écrire la première ligne :**

- **Mobile Money direct ou page hébergée ?** La documentation publique décrit surtout un
  parcours par page hébergée (`init` → `gatewayUrl` → redirection). Aujourd'hui, un paiement
  MoMo se valide **sur le téléphone sans quitter Nexa-Kabi** ; seule la carte redirige. Si
  KPay n'offre pas d'API MoMo directe, **l'UX du moyen le plus utilisé change** — ce que
  l'énoncé demande précisément d'éviter (§20). Le contrat `InitiatePaymentResult` sait déjà
  exprimer les deux formes (`redirectUrl` / `confirmationUrl`), donc le code encaisse le
  changement ; c'est une décision **produit**, pas technique.
- **Signature des webhooks.** La page publique mentionne les webhooks sans en publier la
  spécification. Sans signature vérifiable, il faudra poser `verifyWebhookByFetch: true` —
  ce que fait déjà Bictorys, donc sans surcoût.

### G.1 — Schéma cible

```
Participant
    │  choisit un MOYEN (MTN MoMo, Wave, carte) — jamais un prestataire
    ▼
Nexa-Kabi ── PaymentRoutingService ──▶ country_payment_method
    │                                   « BJ + mtn_momo → kpay / <code KPay> »
    ▼
PaymentProviderRegistry ──▶ KpayProvider │ BictorysProvider │ MockPaymentProvider
    │
    ▼
KPay ──webhook──▶ WebhooksController ──▶ parseWebhook (normalisation)
                            │
                            ▼
                  PaymentsService.applyOutcome()   ← point de passage UNIQUE
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
            Order → PAID         LedgerEntry × 3
                  │              (SALE, PLATFORM_FEE, PROVIDER_FEE)
                  ▼                   │
             Tickets émis             ▼
                              Solde organisateur → Payout
```

**Ce qui change** : une classe de plus dans le dossier `providers/`, une ligne de plus dans
une enum, des lignes de configuration en base. **Rien d'autre.** Aucun service métier, aucun
écran, aucune table.

### G.2 — Répartition des responsabilités

| KPay | Nexa-Kabi |
| ---- | --------- |
| Initier et traiter le paiement | Panier, commande, réservation de stock |
| Dialoguer avec les opérateurs | Prix, devise, billets, QR signés |
| Confirmer, fournir les statuts | **Machine à états métier** |
| Émettre les callbacks | Idempotence, audit, rapprochement |
| Exécuter les versements | **Commissions, grand livre, soldes** |
| Annoncer ses frais | Remboursements, reporting, permissions |

La frontière est déjà matérialisée : le seul type que KPay franchit est
`NormalizedWebhookEvent`, et le seul verbe métier est `applyOutcome`.

---

## H. Gestion multi-pays et logos

### H.1 — Pays, moyens, disponibilité : déjà résolu

La chaîne complète existe. Ouvrir la Côte d'Ivoire avec Wave et KPay se fait **dans l'écran
« Pays & paiements » de la console, sans code**. `KNOWN_COUNTRIES` couvre déjà 11 pays
(BJ, CI, SN, TG, BF, ML, NE, GN, CM, GH, NG) avec leur devise (XOF, GNF, XAF, GHS, NGN),
leur indicatif et leur drapeau, dérivés du registre téléphonique de `@nexakabi/utils` — une
seule liste, pas deux à faire diverger.

L'endpoint demandé par l'énoncé (`GET /payments/methods?country=BJ`) existe sous la forme
`GET /api/checkout/orders/:reference/payment-methods`, **rattaché à la commande plutôt qu'au
pays**. C'est plus sûr : le pays de paiement est celui figé sur la commande, il ne peut pas
être influencé par un paramètre d'URL. Réponse actuelle :

```json
{ "countryCode": "BJ", "currency": "XOF", "dialCode": "229",
  "methods": [ { "code": "mtn_momo", "label": "MTN MoMo", "kind": "MOBILE_MONEY",
                 "description": "Validation par code USSD", "group": "mobile_money",
                 "requiresPhone": true, "redirects": false } ],
  "notice": "…" }
```

Il ne manque que `logo`. Aucun `if (country === 'BJ')` n'existe dans le frontend — vérifié.

### H.2 — Logos : le seul vrai manque

Aucun asset d'opérateur n'existe dans le dépôt. Proposition, cohérente avec le design system :

- **SVG monochromes ou couleur de marque**, dans `apps/web/public/paiements/<code>.svg`,
  nommés par le code du **moyen** (`mtn_momo.svg`), jamais par celui du prestataire — un
  changement d'agrégateur ne doit toucher aucun asset.
- Champ `logo: string | null` ajouté à `checkoutPaymentMethodSchema` et rempli depuis
  `PAYMENT_METHOD_DEFINITIONS`, à côté de `label` et `description`. Le catalogue reste la
  source unique.
- Repli sur une pastille typographique si l'asset manque — l'écran ne doit jamais casser
  parce qu'un logo est absent.
- `MethodList` (`payment-flow.tsx:359`) : le logo remplace visuellement la puce radio, qui
  reste présente pour l'accessibilité. **La structure de la liste ne change pas.**

> Les marques sont déposées : les logos doivent venir des chartes officielles des opérateurs,
> avec leurs contraintes d'usage. Ce n'est pas un détail juridique négligeable.

---

## I. Gestion financière

### I.1 — Commission Nexa-Kabi : déjà configurable et déjà flexible

`CommissionPolicy` porte `percentageBps` (500 = 5 %), `fixedAmountPerTicket`,
`minFeePerOrder`, `maxFeePerOrder`, `buyerSharePercent` (100 = frais entièrement à
l'acheteur), `appliesToFreeTickets`, `payoutFeeBps`, `payoutFeeMax`, `minPayoutAmount`, plus
une fenêtre de validité (`validFrom`/`validTo`).

Résolution par portée (`commission.service.ts:33`) : **organisation > pays > plateforme >
constante de repli**. Les montants résolus sont **figés sur la commande** — modifier une
politique ne réécrit jamais une vente passée.

L'énoncé demande de prévoir une variation par type d'événement, catégorie, campagne et moyen
de paiement. **Recommandation : ne pas l'ajouter maintenant.** Les trois portées existantes
couvrent les besoins identifiés, et le modèle interdit délibérément la variation par moyen de
paiement — principe assumé et documenté : « la commission ne dépend jamais du moyen de
paiement ; les frais du prestataire sont une ligne à part ». L'énoncé prévient lui-même contre
l'usine à gaz ; ajouter deux portées coûterait une migration et une résolution plus fragile
pour un besoin encore théorique.

### I.2 — Grand livre

Trois écritures par vente, délibérément non fusionnées (`ledger.service.ts:116`) :

```
Client paie 10 000 F
   ├── SALE          +10 000   (crédit organisation)
   ├── PLATFORM_FEE     −500   (commission Nexa-Kabi, politique résolue)
   └── PROVIDER_FEE     −150   (frais réels du prestataire)
                     ────────
        net organisateur  9 350
```

Treize types d'écritures existent (`SALE`, `HOLD`, `RELEASE`, `PLATFORM_FEE`, `PROVIDER_FEE`,
`REFUND`, `REFUND_FEE_REVERSAL`, `PAYOUT`, `PAYOUT_FEE`, `PAYOUT_REVERSAL`, `FREEZE`,
`UNFREEZE`, `ADJUSTMENT`), avec contrainte en base sur la cohérence du signe.

Trois propriétés à préserver, toutes déjà en place :

- **Immuabilité** — garantie par déclencheurs ; aucune méthode ne met à jour ni ne supprime.
- **Le solde n'est pas un champ** — il se recalcule. Un compteur serait plus rapide et faux le
  jour où deux écritures concurrentes le mettent à jour, et surtout **inexplicable**.
- **Le déblocage est temporel** — une écriture `PENDING` dont `availableAt` est passée compte
  comme disponible. Aucune tâche ne « débloque » : le temps suffit.

Chaque écriture référence organisation, événement, commande, paiement, versement et
remboursement : la reconstruction complète demandée par l'énoncé est possible aujourd'hui.

### I.3 — Frais du prestataire : le seul correctif financier nécessaire

Aujourd'hui, `applyOutcome` écrit `providerFeeAmount: outcome.providerFeeAmount ?? 0`. Un
prestataire muet produit donc une ligne `PROVIDER_FEE` **absente**, indiscernable d'un
prestataire réellement gratuit. Le rapprochement devient impossible.

**Correctif proposé, minimal** : ajouter à `Payment` un champ
`providerFeeSource: 'REPORTED' | 'ESTIMATED' | 'UNKNOWN'`. `REPORTED` quand le prestataire
l'annonce (`merchantFees` chez Bictorys), `ESTIMATED` quand une grille de configuration
l'applique, `UNKNOWN` sinon. Les montants ne changent pas ; seule leur **qualité** devient
lisible, ce qui est exactement ce que §12 de l'énoncé demande.

### I.4 — Versements

`Payout` porte déjà `grossAmount`, `feeAmount`, `netAmount`, `providerCode`,
`providerReference`, `failureReason`, les horodatages et l'opérateur qui a traité. Le solde
est protégé par la vérification d'identité, un gel administratif possible, et un montant
minimum issu de la politique. Rien à créer.

---

## J. Administration financière

C'est, avec les remboursements, le principal chantier d'écrans. Les **données existent
toutes** ; il manque les lectures et les vues.

### J.1 — Nouvel espace console

Ajouter `finance` à `ADMIN_SPACES` (`contracts/src/admin.ts:50`), avec les niveaux
_consultation_ / _décision_ déjà prévus par le modèle. Un comptable obtient la consultation
sans `canMoveMoney` ; tout geste déplaçant de l'argent reste soumis à ce droit séparé.

### J.2 — Écrans

**1. Paiements** — liste paginée, filtres : période, pays, devise, événement, organisateur,
statut, moyen, prestataire, fourchette de montant. Recherche par référence de commande,
identifiant de paiement, référence prestataire, téléphone **masqué par défaut** (le numéro
complet exige `canMoveMoney` et laisse une trace d'audit).

**2. Détail d'un paiement** — la chronologie demandée au §16 de l'énoncé, reconstituée depuis
`PaymentAttempt` (chaque échange horodaté avec durée et erreur), `WebhookEvent` (corps brut
conservé), `AuditLog` et `LedgerEntry` :

```
Paiement créé            14:02:11   INITIATED
Appel KPay               14:02:11   PaymentAttempt · INITIATE · 412 ms
Réponse KPay             14:02:12   PENDING · réf. kp_7f3a…
Webhook reçu             14:02:48   WebhookEvent · succeeded
Relecture chez KPay      14:02:48   confirmé
Paiement réussi          14:02:48   SUCCEEDED
Commande confirmée       14:02:48   Order PAID
Billets émis             14:02:48   2 billets
Écritures au grand livre 14:02:48   SALE +10 000 · PLATFORM_FEE −500 · PROVIDER_FEE −150
```

**3. Vue comptable** — agrégations par période, devise, pays, organisateur, événement :
encaissé brut, frais prestataire, commission Nexa-Kabi, dû aux organisateurs, déjà versé,
remboursé, en attente, échoué. `stats.service.ts` (370 lignes) fournit déjà des agrégations
par organisation et par événement : la vue plateforme s'y ajoute plutôt que de la dupliquer.

**4. Rapprochement** (§P) et **5. Remboursements** (§E.2‑9).

**Export CSV** pour chaque vue — le motif existe déjà (`GET …/attendees.csv`).

---

## K. Base de données

**Aucune table nouvelle n'est nécessaire.** Les onze entités citées par l'énoncé existent,
sauf `Reconciliation` et `Fee`, qui ne se justifient pas :

| Entité de l'énoncé | Existant | Décision |
| ------------------ | -------- | -------- |
| `Payment` | `Payment` | Réutilisé |
| `PaymentAttempt` | `PaymentAttempt` | Réutilisé |
| `PaymentProviderTransaction` | `providerReference` + `providerPayload` sur `Payment` | Inutile |
| `PaymentMethod` | `CountryPaymentMethod` + catalogue en contrats | Réutilisé |
| `PaymentWebhookEvent` | `WebhookEvent` | Réutilisé |
| `LedgerEntry` | `LedgerEntry` (13 types) | Réutilisé |
| `Fee` | Colonnes de `Order` + `CommissionPolicy` | Inutile |
| `Payout` | `Payout` | Réutilisé |
| `Refund` | `Refund` | Réutilisé |
| `Reconciliation` | — | Différé (§P) |
| `AuditLog` | `AuditLog` | Réutilisé |

**Migrations nécessaires** (trois, toutes petites) :

1. Valeur `kpay` dans l'énumération des prestataires, si elle est contrainte côté base.
2. Colonne `Payment.providerFeeSource` (§I.3), avec valeur par défaut rétro-compatible.
3. Lignes `country_payment_method` pour `kpay` sur les pays ouverts.

---

## L. API

**Aucun endpoint de paiement existant ne change.** Les routes du tunnel, du webhook et de
l'espace organisateur restent identiques : c'est la garantie que le changement de prestataire
est invisible pour le participant.

`POST /api/webhooks/payments/:provider` accepte déjà n'importe quel prestataire enregistré :
`/api/webhooks/payments/kpay` fonctionnera sans modifier le contrôleur.

**À créer** — uniquement pour combler §E.2 :

| Méthode | Route | Objet |
| ------- | ----- | ----- |
| `GET` | `/admin/finance/payments` | Liste filtrée |
| `GET` | `/admin/finance/payments/:id` | Détail + chronologie |
| `GET` | `/admin/finance/summary` | Agrégations comptables |
| `GET` | `/admin/finance/payments.csv` | Export |
| `GET` | `/admin/finance/reconciliation` | Écarts (§P) |
| `POST` | `/admin/finance/reconciliation/run` | Passe manuelle |
| `GET` | `/admin/refunds` | Liste des remboursements |
| `POST` | `/admin/orders/:reference/refund` | Remboursement, `canMoveMoney` requis |

---

## M. Frontend

**Ce qui ne change pas** : le parcours en quatre étapes, le `Stepper`, le compte à rebours de
réservation, l'écran d'attente et sa règle cardinale — _un paiement en attente n'est jamais
présenté comme un échec_ —, l'écran d'échec et sa phrase « Aucun montant n'a été débité ·
panier conservé », le masquage du numéro, la mention de sécurité, les trois états de
`PaymentFlow` dans une seule route.

**Ce qui change :**

| Fichier | Modification |
| ------- | ------------ |
| `payment-flow.tsx` · `MethodList` | Logo à gauche, radio conservé pour l'accessibilité |
| `apps/web/public/paiements/*.svg` | Nouveaux assets |
| `apps/admin/app/finance/**` | Nouveaux écrans (§J) |
| `apps/admin/app/nav.tsx` | Entrée « Finance » |

**Règle du projet à respecter** : « un écran n'est livré que lorsque ses cinq états sont
dessinés — vide, chargement, erreur, succès, hors ligne ».

---

## N. Webhooks

L'architecture demandée est **déjà en place**. Rappel du chemin complet, tel qu'il
fonctionnera pour KPay sans modification du contrôleur :

1. `POST /api/webhooks/payments/kpay`, hors limitation de débit, corps **brut** préservé
   (`rawBody: true`).
2. `KpayProvider.parseWebhook()` — authentification **avant toute lecture du corps**, sur le
   corps brut jamais re-sérialisé. `WebhookSignatureError` → 401 et journal d'alerte ;
   `WebhookIgnoredError` → 200 silencieux.
3. Normalisation vers `NormalizedPaymentWebhook` | `NormalizedPayoutWebhook` — `kind` sépare
   encaissement et versement, qui arrivent par le même point d'entrée.
4. **Idempotence** : `WebhookEvent (providerCode, externalId)` unique en base. `externalId`
   se construit `<transaction>:<statut>` — le même événement rejoué produit la même clé, un
   changement d'état en produit une autre. Un rejeu `PROCESSED`/`IGNORED` sort immédiatement ;
   un rejeu d'un événement **échoué** est repris, sinon la panne se figerait.
5. **Paiement introuvable** → ligne conservée en `RECEIVED`, jamais rejetée : le prestataire
   notifie parfois avant que notre transaction d'initiation soit validée.
6. **Relecture avant crédit** (`verifyWebhookByFetch`) : un succès annoncé est relu chez le
   prestataire. Si la relecture échoue, rien n'est appliqué et la réconciliation reprendra.
   **Aucun billet n'est jamais émis sur la seule foi d'un message entrant.**
7. `applyOutcome()` sous verrou, transitions validées, commande confirmée dans **la même
   transaction** (délais portés à 20 s — mesuré : avec les valeurs par défaut, 143 paiements
   sur 200 restaient bloqués lors d'un test de vente flash).
8. Réponse **200 systématique**, même sur rejeu : un prestataire qui reçoit une erreur rejoue
   en boucle puis abandonne.

Un même webhook reçu 2, 5 ou 20 fois ne peut donc produire ni deux commandes ni deux billets —
garanti par un index unique en base, pas par une vérification applicative.

**Seule correction à apporter** : F7, la reprise des webhooks orphelins, qui doit passer par
`parseWebhook` du prestataire au lieu d'un champ `providerReference` que personne n'émet.

---

## O. Sécurité

**Déjà acquis** : secrets exclusivement serveur (le navigateur ne joint jamais l'API) ;
validation d'environnement au démarrage avec refus de démarrer ; secrets distincts par usage
imposé par le code ; comparaison de secrets en temps constant ; corps brut vérifié ; montant
**jamais transmis par le client** — `initiate()` lit `order.totalAmount` en base ; jeton de
checkout signé par un secret distinct de celui des sessions ; `canMoveMoney` séparé des
niveaux d'accès ; audit de toute opération financière ; numéro masqué à l'écran ;
redirections de retour validées (`http`/`https` uniquement) ; CSP stricte sur la page de
paiement simulée.

**À ajouter pour KPay** :

- `KPAY_API_KEY` renseignée ⇒ `KPAY_WEBHOOK_SECRET` obligatoire, contrôlé dans
  `assertConsistency()` — refus de démarrer, pas un avertissement.
- Vérification, dans `handleWebhook`, que **montant et devise** annoncés correspondent au
  paiement. Aujourd'hui seule la référence est rapprochée ; le risque est faible grâce à la
  relecture, mais le contrôle est explicitement demandé (§9 de l'énoncé) et coûte trois lignes.
- Journalisation de `externalId`, `providerReference` et statut — **jamais** de clé, de corps
  complet en niveau `info`, ni de numéro en clair.

---

## P. Rapprochement

**Existant** : sens unique — chaque minute, les paiements en attente de moins de 24 h sont
interrogés (50 par passe, premier appel après 45 s) ; chaque nuit à 3 h, balayage sur 72 h
avec reprise des webhooks orphelins ; verrou consultatif PostgreSQL pour éviter deux passes
concurrentes ; un rattrapage par interrogation est consigné en audit
(`paymentReconciled`, avec `recoveredBy: 'status_poll'`), ce qui alimente un indicateur de
fiabilité du prestataire.

**Manquant** : le sens inverse. Une transaction chez KPay sans paiement chez nous n'est jamais
détectée — c'est le seul écart capable de faire perdre de l'argent sans aucun signal.

**Proposition** : une méthode **facultative** au contrat, sur le modèle exact de
`listMerchantMethods` — un prestataire qui ne l'expose pas ne la déclare pas, et rien ne
casse :

```ts
listTransactions?(range: { from: Date; to: Date }): Promise<ProviderTransaction[]>;
```

Une passe quotidienne compare, par période, les transactions du prestataire aux paiements en
base et classe les écarts : paiement sans transaction, transaction sans paiement, montant
divergent, statut divergent, doublon. **Pas de table `Reconciliation` pour l'instant** : le
rapport se calcule à la demande et s'affiche dans l'écran dédié. La table ne se justifiera que
le jour où il faudra historiser les décisions de rapprochement.

---

## Q. Tests

**Le projet n'a aucune suite de tests automatisés, et c'est une décision assumée.** Aucun
`TEST_DATABASE_URL`, aucun `pnpm test`. Introduire un cadre de tests ici serait contraire aux
règles du projet. La vérification repose sur :

1. **`pnpm typecheck`, `pnpm lint`, `pnpm build`** — les contrats Zod partagés font qu'une
   incohérence entre API et frontend est une erreur de compilation. Le paquet `contracts` doit
   être reconstruit après toute édition, sinon le typage vérifie l'ancienne version.
2. **Recette manuelle par les écrans réels**, en bac à sable KPay, avec nettoyage ensuite par
   `reset-to-clean-state.ts`.

**Scénarios à couvrir, par ordre de gravité décroissante :**

| Scénario | Attendu |
| -------- | ------- |
| MoMo nominal | Billets émis, 3 écritures au grand livre, notification envoyée |
| Webhook rejoué 5 fois | 1 commande, N billets, `WebhookEvent` en `IGNORED` |
| Webhook avant initiation | Ligne `RECEIVED`, reprise à la passe suivante |
| Échec puis nouvel essai | Réservation conservée, rang d'idempotence incrémenté |
| Double-clic sur « Payer » | Un seul paiement, un seul appel prestataire |
| `FAILED` reçu après `SUCCEEDED` | Transition refusée, consignée, non appliquée |
| Webhook non signé / mal signé | 401, rien appliqué |
| Webhook annonçant un succès démenti par la relecture | Rien crédité, avertissement |
| Expiration de la demande | `EXPIRED`, stock libéré, panier récupérable |
| Carte via page hébergée | Retour sur l'écran d'attente, verdict par interrogation |
| Remboursement | `Refund` + écritures, billets `REFUNDED` |
| Versement | `PROCESSING` puis `PAID` par webhook ou interrogation |
| Bictorys et KPay actifs ensemble | Chaque webhook routé vers le bon prestataire |

---

## R. Migration

Le point qui rend la bascule sûre : **la configuration est en base, par pays et par moyen.**
Le prestataire d'un moyen se change dans un écran, sans déploiement.

**Étape 1 — Coexistence.** Corriger `PaymentsModule` (§E.1‑5) pour que plusieurs prestataires
réels s'enregistrent ensemble. Sans cela, aucune bascule progressive n'est possible.

**Étape 2 — Branchement à vide.** Clés KPay de bac à sable renseignées, lignes
`country_payment_method` créées mais `collectionEnabled = false`. KPay est branché, invisible
du public, et la synchronisation horaire constate ce que le compte marchand sait faire.

**Étape 3 — Bascule par moyen.** Un moyen à la fois, en commençant par le moins utilisé.
`country_payment_method` porte déjà un `position` : la ligne KPay passe devant la ligne
Bictorys pour le même moyen, et `resolveCollection` prend **la première ligne effective**.
Revenir en arrière consiste à remettre l'ordre initial.

**Les paiements en cours ne sont jamais orphelins** : chaque `Payment` porte son
`providerCode`. Un paiement lancé chez Bictorys continue d'être interrogé et notifié chez
Bictorys, même si tous les nouveaux paiements partent chez KPay. C'est acquis par conception
(`pollProvider` lit `payment.providerCode`, `payments.service.ts:618`) — **aucune migration de
données n'est nécessaire**, et aucun webhook en vol n'est perdu.

**Étape 4 — Versements**, séparément de la collecte, les deux drapeaux étant indépendants.

**Étape 5 — Retrait de Bictorys**, seulement lorsque plus aucun paiement récent ne le
référence. Garder le code coûte peu ; le supprimer trop tôt interdit tout retour.

---

## S. Étude concurrentielle

Pratiques observées chez Eventbrite, Billetweb, Weezevent, et chez les plateformes de
billetterie d'Afrique de l'Ouest.

**Ce que Nexa-Kabi fait déjà aussi bien ou mieux :**

- _Frais visibles avant paiement, avec répartition acheteur/organisateur paramétrable_
  (`buyerSharePercent`) — Eventbrite ne le rend pas configurable à ce grain.
- _Rétention des fonds jusqu'après l'événement_, avec paliers liés à la vérification et à
  l'historique — c'est le modèle Eventbrite, déjà implémenté (`resolveHoldTier`).
- _Prestataire invisible du participant_ — pratique de toutes les plateformes matures.
- _Grand livre en écritures immuables plutôt qu'un solde_ — pratique des plateformes
  financières, rare en billetterie.

**Ce qu'il vaut la peine de reprendre :**

1. **Logos d'opérateurs** — universel sur le marché africain (Paystack, Flutterwave, Wave). Un
   opérateur se reconnaît à sa couleur avant son nom, et l'écran de choix est le point exact
   où l'acheteur abandonne. → §H.2.
2. **Reçu financier par commande, lisible par l'organisateur** — brut, frais, commission, net.
   Les données existent ; l'écran organisateur ne les décompose pas encore.
3. **Relevé de versement** listant les commandes couvertes. La liaison existe
   (`LedgerEntry.payoutId`), la vue non.
4. **Rapprochement présenté comme une liste d'écarts à traiter**, pas comme un rapport à lire
   (Stripe). → §P.
5. **Remboursement depuis la commande**, en un geste, avec motif obligatoire — chez tous les
   concurrents, impossible chez nous aujourd'hui. → §E.2‑9.

**Ce qu'il faut éviter :** l'empilement de moyens de paiement mondiaux non pertinents
localement, et l'affichage du nom du prestataire au participant — les deux dégradent la
conversion sans rien apporter.

---

## T. Plan d'implémentation

Neuf étapes, chacune vérifiable indépendamment. Les étapes 1 à 5 livrent KPay ; 6 à 8
comblent les manques de l'existant ; elles peuvent avancer en parallèle.

| # | Étape | Contenu | Risque |
| - | ----- | ------- | ------ |
| **0** | **Lever les préalables** | Confirmer l'identité de KPay (§G.0), obtenir les clés de bac à sable, la spécification des webhooks et le catalogue des moyens par pays | **Bloquant** |
| 1 | Contrats | `'kpay'` dans l'enum, table de correspondance des moyens, champ `logo` | Faible |
| 2 | Environnement | `KPAY_*` + règle « clé ⇒ secret de webhook » | Faible |
| 3 | `KpayProvider` | Les 9 méthodes du contrat, mapping des statuts, signature | **Élevé** |
| 4 | Module + migration | Coexistence des prestataires, lignes de configuration | Moyen |
| 5 | Recette bac à sable | Les 13 scénarios du §Q | Moyen |
| 6 | Logos | Assets + `MethodList` | Faible |
| 7 | Admin finance | Espace `finance`, 4 écrans, endpoints, export | Moyen |
| 8 | Remboursements | Route + écran, `canMoveMoney` | Moyen |
| 9 | Correctifs | **F7** (orphelins), F3 (`providerFeeSource`), F4/§P (rapprochement inverse), contrôle montant/devise | Moyen |

> **F7 peut être corrigé immédiatement, avant même l'étape 0** : c'est un défaut de l'existant,
> indépendant du prestataire, et il est silencieux.

**Après chaque étape** : `pnpm typecheck`, `pnpm lint`, `pnpm build`, puis vérification que le
tunnel d'achat complet fonctionne toujours avec le simulateur.

---

## Récapitulatif

**Ce qui existe** : toute l'architecture demandée — abstraction de prestataire, routage
multi-pays, machine à états, idempotence, grand livre, commissions, versements,
réconciliation, audit, permissions.

**Ce qui manque** : un fichier de prestataire, des logos, l'administration financière, le
remboursement manuel, et quatre correctifs dont un sérieux (F7).

**Ce qui doit changer** : une enum, une fabrique de module, trois petites migrations.

**Ce qui ne doit pas changer** : les statuts, les endpoints du tunnel, le parcours d'achat, le
design, le grand livre, le modèle de commission.

> L'effort réel n'est pas de « faire évoluer le système de paiement » : il est déjà conçu pour
> ça. Il est d'écrire un adaptateur de plus, et de livrer les écrans d'administration
> financière qui manquaient déjà avant que KPay soit envisagé.
