# NEXA-KABI — PLAN DE DÉVELOPPEMENT

> **Phase 0 — Proposition de plan.** Aucun développement n'est engagé. Ce plan est à valider avant le
> démarrage.
>
> Documents liés : `PROJECT_ANALYSIS.md`, `TECHNICAL_ARCHITECTURE.md`, `DATABASE_PROPOSAL.md`.

> **Décision du 12 septembre 2026 — plus de tests automatisés.** Les suites unitaires et
> d'intégration, leurs fixtures, la base `nexakabi_test` et `TEST_DATABASE_URL` ont été retirées à
> la demande du propriétaire : le produit se vérifie sur lui-même, en réel, par ses écrans et le
> cahier de recette. Les mentions de couverture et de « tests d'intégration » dans les phases
> ci-dessous décrivent ce qui a existé au moment de leur livraison, et ne sont plus d'actualité.

---

# 1. PRINCIPES DU PLAN

**Le plan proposé dans le brief a été réordonné sur quatre points.**

| Proposition initiale                                | Ajustement                                                                                   | Motif                                                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 6 « Payments » après Phase 5 « Checkout »     | **Fusionnées** en une phase Checkout & Paiements                                             | Le checkout sans machine à états de paiement n'est pas testable ; les séparer produirait une phase livrant du code non vérifiable                                                                |
| Phase 3 « Authentication » avant Phase 4 « Events » | Insertion d'une phase **Organisations** entre les deux                                       | Un événement appartient à une organisation ; sans organisation, la Phase Events devrait inventer un propriétaire temporaire à jeter ensuite                                                      |
| Phase 11 « PWA » en fin de parcours                 | **Éclatée** : le hors-ligne du check-in dans la phase Check-in, la PWA participant plus tard | Le hors-ligne n'est pas une couche cosmétique ajoutée à la fin : il conditionne l'architecture du scanner                                                                                        |
| Phase 12 « Testing » en dernier                     | **Supprimée en tant que phase**                                                              | Les tests appartiennent à chaque phase. Une phase finale de tests signifie qu'on a livré onze phases non testées. Il reste une phase de **durcissement et recette**, qui n'est pas la même chose |

**Trois règles de conduite** :

1. **Chaque phase se termine sur quelque chose de démontrable.** Pas de phase « infrastructure » de
   trois semaines sans écran.
2. **Chaque écran est livré avec ses cinq états** (vide, chargement, erreur, succès, hors ligne),
   conformément à la règle du prototype. Un écran sans ses états n'est pas livré.
3. **Les tests de la logique financière sont écrits en même temps que le code**, pas après.

**Une piste parallèle non technique démarre immédiatement** : contractualisation Mobile Money,
conseil juridique, fournisseurs SMS, validation WhatsApp Business. Ce sont les chemins critiques les
plus longs et ils ne dépendent d'aucune ligne de code (voir §4).

---

# 2. PRÉREQUIS AVANT LA PHASE 1

Trois décisions doivent être prises avant d'écrire du code. Elles sont détaillées dans
`PROJECT_ANALYSIS.md` §8.

| Décision                                                                 | Référence | Pourquoi bloquant                                                                                               |
| ------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| **Modèle de commission** — qui paie les frais, et selon quelle formule ? | A1        | Détermine le calcul des totaux, l'affichage sur toute la chaîne d'achat, et le grand livre                      |
| **Plan de numérotation téléphonique béninois** (8 ou 10 chiffres)        | A2        | Le numéro est l'identifiant d'authentification et la clé de rapprochement Mobile Money                          |
| **Montage juridique de détention des fonds**                             | A10       | Détermine si les fonds transitent par un compte propre ou par un PSP agréé — architecture financière différente |

Trois décisions secondaires peuvent être prises pendant la Phase 1 : politique de déblocage du solde
(A4), statut de vérification des événements (A5), périmètre de la facturation (A9).

---

# 3. PHASES

## Phase 1 · Fondations

**Objectif** : un monorepo qui compile, se teste, se déploie, avec une base de données et un premier
écran servi de bout en bout.

| Livrable              | Détail                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo              | pnpm workspaces + Turborepo, structure de `TECHNICAL_ARCHITECTURE.md` §3                                                          |
| `packages/config`     | Presets ESLint (dont la règle interdisant `any` non justifié), TypeScript, Prettier, Tailwind                                     |
| `packages/utils`      | `Money` (XOF, entiers, formatage à espace insécable), dates françaises, normalisation E.164, génération de références et de slugs |
| `packages/contracts`  | Squelette : enums, schémas Zod de base                                                                                            |
| `apps/api`            | NestJS amorcé, Prisma connecté, validation d'environnement par Zod, journalisation pino, health check, Swagger                    |
| `apps/web`            | Next.js App Router, Tailwind v4, layout public minimal                                                                            |
| Infrastructure locale | `docker-compose` : PostgreSQL 16 + Redis                                                                                          |
| CI                    | Lint, typecheck, tests, build sur chaque PR ; cache Turborepo                                                                     |
| Déploiement           | Environnements `preview` et `staging` opérationnels                                                                               |

**Critère de sortie** : une page publique servie par `apps/web` affiche une donnée provenant de
`apps/api`, en local, en preview et en staging. Un `pnpm test` vert en CI.

**Ne pas faire** : aucune entité métier au-delà du strict nécessaire ; pas de composants.

---

## Phase 2 · Design system

**Objectif** : la bibliothèque de composants du prototype, documentée et testée, avant qu'un seul
écran métier ne soit construit.

| Livrable       | Détail                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens         | Toutes les valeurs de `PROJECT_ANALYSIS.md` §3 en variables CSS Tailwind v4                                                                                                        |
| Polices        | Bricolage Grotesque et Plus Jakarta Sans, auto-hébergées, sous-ensemble latin étendu, `font-display: swap`                                                                         |
| Primitives     | `Button` (9 variantes), `IconButton`, `Input`, `PhoneInput`, `MoneyInput`, `Select`, `DatePicker`, `TimePicker`, `Checkbox`, `Radio`, `Switch`, `Textarea`, `FileDrop`, `OtpInput` |
| Affichage      | `Badge` (10 variantes), `Card`, `Panel`, `Stat`, `Money`, `DateChip`, `Avatar`, `Skeleton`                                                                                         |
| Structure      | `Table` + bascule automatique en cartes, `Tabs`, `Stepper`, `Breadcrumb`, `Pagination`, `Sidebar`, `BottomNav`                                                                     |
| Superpositions | `Dialog`, `Sheet`, `Popover`, `Tooltip`, `Toast`, `ConfirmDialog` destructif                                                                                                       |
| États          | `EmptyState` (2 variantes), `ErrorState`, `OfflineBanner`, `LoadingSkeleton`, `LongWait`                                                                                           |
| Métier         | `EventCard` (4 variantes), `StatusTimeline`, `RoleBadge`                                                                                                                           |
| Documentation  | Storybook ou page de galerie interne, avec chaque variante et chaque état                                                                                                          |
| Tests          | Contraste automatisé sur les couples de tokens, axe-core sur chaque composant                                                                                                      |

**Critère de sortie** : une page de galerie reproduit fidèlement l'écran « Design system » du
prototype. Contrôle visuel côte à côte avec `design-reference/`.

**Ne pas faire** : les composants métier complexes (billet numérique, verdict de scan) — ils viennent
avec leur phase.

---

## Phase 3 · Authentification et comptes

**Objectif** : entrer dans le produit.

| Livrable | Détail                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Modèle   | `User`, `Device`, `OtpChallenge`, `AdminCredential`                                                            |
| OTP      | Demande, envoi SMS (fournisseur simulé au début), vérification, limitation de débit, repli WhatsApp après 45 s |
| Sessions | JWT court + refresh opaque avec rotation, détection de réutilisation, cookies httpOnly, durée 90 jours         |
| Écrans   | P8 (3 étapes du prototype), P9 récupération d'accès, U7 profil                                                 |
| Guards   | `SessionGuard`, `RequireGlobalRole`                                                                            |
| Sécurité | scrypt et droits par espace pour l'administration, limitation par numéro et par IP, absence d'énumération de comptes |
| Tests    | Parcours OTP complet, expiration, tentatives maximales, rotation de jeton, détection de rejeu                  |

**Critère de sortie** : un utilisateur s'inscrit avec son numéro, reçoit un code, ouvre une session,
la conserve après rechargement, et se déconnecte de tous ses appareils.

**Dépendance** : la décision A2 (format des numéros) doit être prise.

---

## Phase 4 · Organisations et équipes

**Objectif** : le contenant de tout le reste.

| Livrable     | Détail                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Modèle       | `Organization`, `OrganizationMember`, `MemberInvitation`, `PayoutAccount`, `VerificationRequest`, `VerificationDocument`       |
| Autorisation | `OrgMemberGuard`, `EventScopeGuard`, décorateur `@RequirePermission`, table de permissions de `TECHNICAL_ARCHITECTURE.md` §5.2 |
| Écrans       | O14 organisation, O13 équipe et rôles avec journal d'activité, acceptation d'invitation                                        |
| Média        | Module `media` : upload signé vers R2, transformation `sharp`, AVIF/WebP                                                       |
| Audit        | Module `audit`, écriture systématique sur les actions sensibles                                                                |
| Tests        | Matrice de permissions **exhaustive** : chaque rôle × chaque permission                                                        |

**Critère de sortie** : un utilisateur crée son organisation, invite un gestionnaire par lien
WhatsApp, celui-ci accepte, et la matrice de permissions est vérifiée par des tests.

**Point d'attention** : la matrice de permissions est la fondation de sécurité du produit. Elle est
testée intégralement ici, pas plus tard.

---

## Phase 5 · Événements, billetterie et découverte publique

**Objectif** : la première moitié de la promesse — « créer facilement un événement » et « découvrir ».

| Livrable            | Détail                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Modèle              | `Category`, `City`, `Venue`, `Event`, `EventImage`, `TicketType`, `EventSigningKey`                           |
| Machine à états     | `EventStatus` complète, avec les deux chemins de publication (A5)                                             |
| Assistant           | O3, les **8 étapes**, brouillon auto-sauvegardé, reprise exacte à l'étape                                     |
| Écrans organisateur | O1 vue générale, O2 liste, O4 vue de l'événement, O5 billets, O10 paramètres                                  |
| Écrans publics      | P1 accueil, P2 découverte avec filtres, P3 catégorie, P4 page événement, P6 profil organisateur, P7 recherche |
| SEO                 | Métadonnées Open Graph par événement (essentiel pour l'aperçu WhatsApp), sitemap, données structurées `Event` |
| Performance         | ISR sur le catalogue, images AVIF, **budget de 150 Ko sur le premier écran vérifié en CI**                    |
| Recherche           | Plein texte PostgreSQL en français, filtres combinables en query string                                       |
| Tests               | Transitions d'état, règles de disponibilité, publication conditionnelle                                       |

**Critère de sortie** : un organisateur crée un événement en 8 étapes, le publie, et l'événement est
visible publiquement avec un aperçu WhatsApp correct. Lighthouse passe les seuils sur mobile 3G.

---

## Phase 6 · Checkout et paiements

**Objectif** : le cœur du produit et sa partie la plus risquée. Phase la plus longue.

| Livrable             | Détail                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modèle               | `Order`, `OrderItem`, `StockReservation`, `Payment`, `PaymentAttempt`, `WebhookEvent`, `Refund`, `CommissionPolicy`                                 |
| Réservation de stock | `SELECT … FOR UPDATE`, contrainte CHECK en base, expiration par job BullMQ                                                                          |
| Calcul des frais     | Implémentation de la grille versionnée, avec la répartition participant/organisateur (A1)                                                           |
| Abstraction          | Interface `PaymentProvider` + `MockPaymentProvider` simulant : succès, échec, timeout, webhook tardif, webhook dupliqué, webhook hors séquence      |
| Machine à états      | `PaymentStatus` complète, transitions interdites verrouillées                                                                                       |
| Webhooks             | Réception, vérification de signature, idempotence par `(providerCode, externalId)`, rejeu                                                           |
| Réconciliation       | Job d'interrogation avec backoff, job de réconciliation quotidien, KPI d'écart                                                                      |
| Écrans               | A1 à A6 (billets, coordonnées, récapitulatif, choix, attente, succès, échec)                                                                        |
| Tests                | **Couverture cible 90 %** : concurrence sur le stock (test de charge), idempotence, double paiement, webhook perdu, expiration, reprise après échec |

**Critère de sortie** : avec `MockPaymentProvider`, un achat complet aboutit ; un webhook rejoué
n'émet pas de billet en double ; 100 achats simultanés sur 50 places n'en vendent que 50 ; un webhook
perdu est rattrapé par la réconciliation.

**Dépendance** : la décision A1 doit être prise avant le démarrage.

### État : LIVRÉE ✅

Critère de sortie vérifié, chaque point par un test automatisé sur PostgreSQL
(`apps/api/src/modules/orders/checkout.integration.test.ts`, 27 scénarios) :

| Vérification                                       | Résultat                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Achat complet avec `MockPaymentProvider`           | ✅ commande `PAID`, stock transféré de réservé à vendu, compte créé en silence |
| 100 achats simultanés sur 50 places                | ✅ exactement 50 acceptés                                                      |
| Webhook rejoué                                     | ✅ reconnu `duplicate`, stock décrémenté une seule fois                        |
| Webhook d'échec après un succès                    | ✅ consigné `IGNORED`, commande inchangée                                      |
| Signature de webhook invalide                      | ✅ 401, aucun effet                                                            |
| Webhook perdu                                      | ✅ rattrapé par l'interrogation de réconciliation                              |
| Expiration d'un panier abandonné                   | ✅ places rendues, commande `EXPIRED`                                          |
| Double-clic et dix appels simultanés sur « Payer » | ✅ un seul paiement créé                                                       |

**Couverture atteinte** (`pnpm --filter @nexakabi/api test:coverage`, sur la
logique — services, gardes, fournisseurs, mappeurs) :

| Module          | Lignes     |
| --------------- | ---------- |
| `orders`        | **90,7 %** |
| `orders/guards` | **100 %**  |
| `payments`      | **90,3 %** |

Les contrôleurs sont écartés de la mesure : ce sont des déclarations de routes
au-dessus de services testés, et la seule partie qui décide vraiment — le garde
d'accès — est testée séparément. La justification figure dans
`apps/api/vitest.config.ts`.

### Quatre défauts trouvés par ces tests, et corrigés

Ils ne se voyaient ni au typage, ni au lint, ni à l'usage manuel. Ils sont
documentés parce qu'ils se reproduiraient à la moindre réécriture.

1. **Interblocage sous charge.** Insérer les lignes de commande AVANT de prendre
   le verrou de stock fait acquérir à chaque transaction un verrou partagé
   (`FOR KEY SHARE`, au titre de la clé étrangère) sur la catégorie de billet ;
   les transactions s'attendent ensuite mutuellement pour passer en exclusif.
   Mesuré : 13 transactions perdues sur 100 acheteurs simultanés. Corrigé en
   prenant le verrou en premier — voir la note d'ordonnancement de
   `StockService`.
2. **Pool de connexions sous-dimensionné.** Avec les valeurs par défaut, 81
   demandes sur 100 étaient refusées faute de connexion, alors que les places
   existaient. Corrigé : pool à 25, `maxWait` à 20 s sur la transaction de
   réservation.
3. **Clé d'idempotence instable.** Fondée sur le nombre total de paiements, elle
   changeait dès qu'un paiement était créé : dix appels simultanés créaient
   plusieurs paiements. Corrigée pour ne compter que les tentatives **déjà
   terminées** — stable pendant la fenêtre du double-clic, elle n'avance qu'au
   moment d'un vrai réessai.
4. **Réessai impossible sur collision de référence.** Le code attrapait la
   violation d'unicité et retirait une nouvelle référence — sauf qu'à
   l'intérieur d'une transaction PostgreSQL, une commande échouée annule la
   transaction entière : toute instruction suivante est refusée avec `25P02`.
   Le filet existait sans rien rattraper. Corrigé par un `SAVEPOINT` autour de
   chaque tentative.

Un cinquième problème, de nature différente, a été corrigé au passage : les
fichiers de test partageant une base unique s'exécutaient en parallèle et se
tronquaient mutuellement les tables, produisant des échecs intermittents sur des
tests sans rapport avec la modification en cours. `fileParallelism: false`.

### Deux écarts assumés par rapport au plan initial

| Prévu                                 | Livré                                                     | Raison                                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expiration par job **BullMQ**         | Tâches `@nestjs/schedule` + verrou consultatif PostgreSQL | Redis n'est pas déployé, et l'installer pour deux tâches périodiques serait une infrastructure de plus à exploiter. `pg_try_advisory_lock` donne la même garantie d'exécution unique en multi-instance. La bascule ne touchera qu'un fichier |
| Émission des billets à l'encaissement | Événement `order.paid` émis, sans abonné                  | Le billet appartient à la phase 7. Le point d'accroche existe déjà, dans la transaction de confirmation                                                                                                                                      |

---

## Phase 7 · Billets et QR

**Objectif** : livrer le billet, en faire un objet.

| Livrable   | Détail                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Modèle     | `Ticket`, jetons `publicId` et `accessToken` distincts                                             |
| Signature  | Ed25519 par événement, clé privée en KMS, clé publique distribuable, format `NK1.<payload>.<sig>`  |
| Émission   | Dans la transaction de confirmation de paiement, jamais en dehors                                  |
| Composants | `DigitalTicket` avec perforation, `QrDisplay` ≥176 px, états valide / utilisé / annulé             |
| Écrans     | A7 billet, U1 tableau de bord, U2 mes billets (3 onglets), U3 détail, U4/U5 commandes, `/t/:token` |
| Livraison  | Lien WhatsApp pré-rempli (`wa.me`), email de secours, PDF téléchargeable                           |
| PDF        | Génération en job, mise en cache sur R2                                                            |
| Tests      | Signature et vérification, format de référence, unicité, expiration de jeton, révocation           |

**Critère de sortie** : après un achat simulé, deux billets distincts sont émis, chacun avec son QR
signé vérifiable, consultables via trois chemins (compte, lien public, PDF).

### État : LIVRÉE ✅

| Vérification                                      | Résultat                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| Deux billets distincts après un achat de 2 places | ✅ `NK-…-01` et `NK-…-02`, identifiants et jetons tous différents |
| QR signé, vérifiable hors ligne                   | ✅ 127 caractères, Ed25519, vérifié avec la seule clé publique    |
| Trois chemins d'accès                             | ✅ compte, lien public `/t/[token]`, PDF (21 Ko, `%PDF-`)         |
| Émission dans la transaction d'encaissement       | ✅ aucun billet tant que le paiement n'est pas confirmé           |
| Webhook rejoué                                    | ✅ deux billets, pas quatre                                       |
| Clé privée absente de la base                     | ✅ `privateKeyRef = derived:v1`, dérivation HKDF à la demande     |

**Couverture** : `tickets` 100 % sur le service de signature, 21 tests d'intégration.

### Deux décisions notables

1. **La clé privée n'existe nulle part.** Elle est dérivée à la demande d'un
   secret maître par HKDF-SHA256, avec l'identifiant de l'événement en sel. Une
   copie de la base ne permet donc de forger aucun billet — ce qui n'aurait pas
   été vrai en la stockant, fût-ce chiffrée.
2. **Charge utile binaire de 27 octets**, et non JSON. Le jeton complet tient en
   127 caractères, soit un QR version 6 en correction M : nettement plus lisible
   à 176 px qu'un encodage bavard. Le détail du format est documenté dans
   `packages/utils/src/qr.ts`.

### État : LIVRÉE ✅

| Vérification                                  | Résultat                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Achat de 2 places                             | ✅ `NK-13E21C-01` et `NK-13E21C-02`, identifiants et jetons tous distincts |
| QR signé, vérifiable hors ligne               | ✅ verdict `valid` avec la seule clé publique de l'événement               |
| Billet forgé, altéré, expiré, autre événement | ✅ refusés, chacun avec son verdict propre                                 |
| Chemin 1 · compte                             | ✅ `/mon-compte/billets` → `/mon-compte/billets/[id]`                      |
| Chemin 2 · lien public                        | ✅ `/t/[token]`, sans compte, QR identique                                 |
| Chemin 3 · PDF                                | ✅ 21 ko, `%PDF-1.3`, QR à 600 px                                          |
| Webhook rejoué                                | ✅ 2 billets, pas 4                                                        |
| Billet d'un autre porteur                     | ✅ 404                                                                     |

Tests : **303** au total (76 utils, 101 contrats, 126 API), dont 21 nouveaux sur l'émission et la
signature des billets et 21 sur le codec du jeton QR.

### Deux décisions de conception

**La clé privée n'existe nulle part.** Le plan prévoyait un KMS ; le résultat va plus loin. Chaque
événement dérive sa paire Ed25519 d'un secret maître par HKDF-SHA256 — la base ne stocke que la clé
PUBLIQUE et une référence de dérivation (`derived:v1`). Une copie complète de la base de données ne
permet donc de forger aucun billet. Un KMS restera utile pour protéger le secret maître lui-même,
mais il n'est plus sur le chemin critique de la signature.

**Le QR fait 127 caractères, pas 155.** La charge utile est un tampon binaire de 27 octets (version,
identifiant public, code d'événement, expiration en heures Unix) plutôt qu'une structure textuelle.
Le QR tient en version 6 au lieu de 7 : moins de modules, donc plus gros à taille d'écran égale —
ce qui est exactement ce que demande une lecture à 176 px dans la pénombre.

### Trois défauts trouvés en vérifiant à l'écran

1. **Le jeton `surface-2` n'existe pas.** Il était utilisé à onze endroits — fonds de page, survols
   de lignes, encoches du billet. Tailwind produisait simplement… rien. Le fond des pages semblait
   correct parce que le `body` porte déjà le crème ; mais les survols n'avaient aucun effet et les
   encoches de perforation du billet étaient invisibles. Remplacé par `paper`, `surface-alt` et
   `fill-neutral` selon l'usage.
2. **« 18h00 → 18h00 ».** Quatre écrans appelaient la fonction d'intervalle avec la date de début
   deux fois. Remplacée par la légende simple là où seule la date de début est connue.
3. **L'écran de confirmation annonçait les billets comme « bientôt »** alors qu'ils venaient d'être
   émis dans la même transaction. Il les livre désormais, avec un lien public par billet — ce qui
   correspond au parcours réel : on achète pour quatre, on envoie trois liens sur WhatsApp.

### Deux écarts assumés

| Prévu                        | Livré                                         | Raison                                                                                                                                                          |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF **en job, caché sur R2** | Génération à la demande, en-tête `max-age=1h` | Ni Redis ni R2 ne sont déployés. Un PDF prend ~150 ms à produire ; le mettre en file coûterait plus qu'il ne rapporterait tant que le volume ne le justifie pas |
| **E-mail de secours**        | Non livré                                     | Aucun fournisseur d'envoi n'est contractualisé. Le champ `buyerEmail` est collecté et stocké ; le branchement appartient à la phase Notifications               |

### Un point de vigilance pour la phase 8

`verifyQrToken` utilise **Ed25519 via WebCrypto**, arrivé tardivement dans les navigateurs. La PWA du
contrôleur devra détecter son absence et basculer sur une implémentation logicielle : un téléphone
Android d'entrée de gamme un peu ancien est précisément la cible de ce produit. Le point est signalé
dans `packages/utils/src/qr.ts`.

---

## Phase 8 · Check-in et hors ligne

**Objectif** : l'interface la plus critique du produit.

| Livrable                | Détail                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Modèle                  | `CheckIn`, `CheckInConflict`, index unique partiel garantissant l'unicité                              |
| Carnet                  | Endpoint de manifeste signé, deltas par `ETag`, données **minimisées**                                 |
| PWA scanner             | Service worker dédié au route group `(scan)`, IndexedDB (Dexie), Background Sync                       |
| Scanner                 | `BarcodeDetector` natif avec repli ZXing WASM, torche, vibration par verdict                           |
| Vérification hors ligne | Signature Ed25519 en WebCrypto + carnet local, logique en 5 étapes de `TECHNICAL_ARCHITECTURE.md` §7.3 |
| Synchronisation         | Envoi par lots idempotent, résolution de conflits « premier horodatage gagne », correction d'horloge   |
| Écrans                  | C1 à C7, verdicts pleine page (vert / ambre / rouge)                                                   |
| Écran organisateur      | O7 check-in : compteurs, historique, **conflits**                                                      |
| Tests                   | Vérification hors ligne, double scan simultané, synchronisation par lots, rejeu, billet hors carnet    |

**Critère de sortie** : mode avion activé, un contrôleur scanne 50 billets, dont un déjà utilisé et
un invalide ; à la reconnexion, tout se synchronise, un conflit provoqué est correctement arbitré et
remonté à l'organisateur.

**Test terrain obligatoire** : sur un appareil Android d'entrée de gamme réel, de nuit, avec un écran
à 40 % de luminosité.

### État : LIVRÉE ✅ — sauf le test terrain, qui reste à faire

Critère de sortie vérifié bout en bout contre l'API réelle :

| Vérification                          | Résultat                                                          |
| ------------------------------------- | ----------------------------------------------------------------- |
| Carnet minimisé                       | ✅ 98 octets/billet (cible 120), aucun téléphone ni e-mail dedans |
| `ETag` sur le carnet                  | ✅ `304` quand le client détient déjà la version                  |
| Lot hors ligne avec un billet inconnu | ✅ 2 acceptés, 1 refusé — le lot entier n'échoue pas              |
| Rejeu du même lot                     | ✅ 2 doublons, 0 nouveau (idempotence par `nonce`)                |
| Double scan par deux contrôleurs      | ✅ 1 conflit, **1 seule entrée effective**                        |
| Arbitrage                             | ✅ le scan le plus ancien gagne, le perdant est conservé          |
| Remontée à l'organisateur             | ✅ les deux contrôleurs et leurs portes figurent au conflit       |
| Cloisonnement du rôle CONTRÔLEUR      | ✅ `403` sur les comptes de retrait                               |
| Portée par événement                  | ✅ un bénévole ne voit que les événements qui lui sont assignés   |

**Couverture** : `checkin` 96,3 % · 34 tests d'intégration · 122 tests de contrats.

### Un défaut trouvé, et qui aurait été invisible

**La détection de conflit ne fonctionnait pas.** Le code cherchait le nom de
l'index violé dans `meta.target`, comme le documente Prisma. Avec un adaptateur
de pilote (`@prisma/adapter-pg`), ce champ reste indéfini : l'erreur native de
PostgreSQL arrive dans `meta.driverAdapterError.cause.constraint.index`.

Conséquence : les doubles scans étaient classés « refusés » au lieu d'être
arbitrés, et **aucun conflit ne remontait à l'organisateur**. Rien ne le
signalait — ni le typage, ni le lint, ni un usage manuel. Seul un test
provoquant réellement un double scan l'a mis au jour.

Correction dans `checkin.service.ts`, avec un repli sur le message d'erreur pour
que la garantie ne disparaisse pas en silence à la prochaine montée de version.

### Trois écarts assumés

| Prévu                              | Livré                                                    | Raison                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background Sync                    | Écoute de l'événement `online` + relance toutes les 20 s | L'API Background Sync n'existe ni sur Safari ni sur Firefox. La relance périodique couvre en plus le cas fréquent d'un retour de réseau sans changement d'interface, en 3G      |
| Vérification Ed25519 par WebCrypto | WebCrypto **avec repli logiciel** chargé dynamiquement   | Ed25519 n'est arrivé dans WebCrypto qu'avec Chrome 137. Sans repli, un contrôleur sur Android un peu ancien refuserait **tous** les billets — la panne la plus visible possible |
| Écran C8 (comptage par porte)      | Non livré                                                | Marqué post-MVP dans l'inventaire des écrans (§4.5). La porte est déjà enregistrée sur chaque scan : l'écran pourra se construire sans migration                                |

### Ce qui reste à faire avant de considérer la phase close

Le **test terrain** listé comme obligatoire dans cette phase n'a pas pu être
mené : il exige un appareil Android d'entrée de gamme réel, de nuit, et une
caméra — trois choses qu'un environnement de développement ne simule pas. Trois
points ne sont donc vérifiés que par construction, jamais en conditions réelles :

- la lecture d'un QR à 176 px sur un écran à 40 % de luminosité ;
- le temps réel entre le cadrage et le verdict, cible sous la seconde ;
- le comportement de la torche et de la vibration selon les constructeurs.

C'est le seul livrable de la phase qui reste ouvert, et il doit l'être
explicitement plutôt que supposé acquis.

---

## Phase 9 · Participants, finances et retraits

**Objectif** : la deuxième moitié de la promesse organisateur — « je récupère mon argent ».

| Livrable               | Détail                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Modèle                 | `LedgerEntry`, vue `OrganizationBalance`, `Payout`, `HoldPolicy`                                    |
| Grand livre            | Écritures immuables, tous les types de `DATABASE_PROPOSAL.md` §8.1, révocation SQL de UPDATE/DELETE |
| Politique de déblocage | Trois paliers (A4), affichée en clair dès la première vente                                         |
| Retraits               | Demande, calcul du net, statuts, échec avec retour au solde sous 24 h et action corrective          |
| Écrans                 | O6 participants avec export CSV/Excel, O9 statistiques de base, O11 finances, O12 détail de retrait |
| Statistiques           | Ventes par jour, par catégorie, taux de présence                                                    |
| Tests                  | **Invariant de solde** (tests de propriétés), scénarios de remboursement, échec de retrait, gel     |

**Critère de sortie** : après une série d'achats, de remboursements et de retraits simulés, le solde
affiché est exactement égal à la somme des écritures du grand livre, et chaque montant est explicable
ligne par ligne.

### État : LIVRÉE ✅ — sauf le parcours de remboursement côté organisateur

**Critère de sortie vérifié.** Le scénario complet — achats, retrait échoué,
retrait réussi — laisse le solde exactement égal à la somme des écritures, au
franc près. Vérifié par 25 tests d'intégration sur PostgreSQL
(`apps/api/src/modules/finance/finance.integration.test.ts`) et 33 tests
d'invariants sur les contrats.

| Vérification                           | Résultat                                                         |
| -------------------------------------- | ---------------------------------------------------------------- |
| Solde = somme des écritures            | ✅ après ventes, retraits, échecs et restitutions                |
| Immuabilité du grand livre             | ✅ `UPDATE` et `DELETE` refusés par déclencheur PostgreSQL       |
| Signe cohérent avec le type d'écriture | ✅ contrainte `CHECK` en base, doublée d'un contrôle applicatif  |
| Paliers de déblocage (A4)              | ✅ trois paliers, arrondi donné à la part bloquée                |
| Retrait échoué                         | ✅ montant restitué dans la même transaction, avec sa cause      |
| Net = brut − frais                     | ✅ contrainte `CHECK` : un écart d'un franc finit en réclamation |
| Retrait payé définitif                 | ✅ correction possible seulement par écriture d'ajustement       |

### Deux décisions de conception

**Le déblocage ne modifie aucune écriture.** Une recette bloquée naît en
`PENDING` avec sa date, et devient disponible quand cette date est passée :
`disponible = Σ(AVAILABLE) + Σ(PENDING échus)`. Aucun job ne « débloque » quoi
que ce soit, et l'immuabilité tient sans exception. Un déblocage ANTICIPÉ,
décidé par un administrateur, s'écrit en revanche explicitement — une paire
`HOLD` / `RELEASE` qui déplace l'argent entre poches sans en créer.

**Les trois écritures d'une vente partagent le même état de blocage.** Bloquer
la vente sans bloquer la commission donnerait un solde disponible NÉGATIF à un
organisateur non vérifié : il devrait de l'argent avant d'en avoir reçu.

### Ce qui reste

| Livrable                           | État                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Écran O6 participants + export CSV | ✅ livré, atteignable depuis l'onglet « Participants » d'un événement publié              |
| Écran O9 statistiques              | ✅ livré, onglet « Statistiques »                                                         |
| Remboursements                     | `RefundsService` opérationnel côté API ; le parcours de DEMANDE n'est pas encore un écran |

**Note sur l'accès aux écrans.** O6, O7 et O9 existaient et fonctionnaient, mais
aucun lien n'y menait : il fallait connaître l'URL. Un `layout.tsx` porte
désormais le fil d'Ariane et quatre onglets — configuration, participants,
contrôle, statistiques — qui n'apparaissent qu'une fois l'événement publié. Un
écran inatteignable équivaut à un écran absent, quelle que soit la qualité de ce
qu'il affiche.

---

## Phase 10 · Notifications et PWA participant

**Objectif** : la boucle de rétention et l'installation.

| Livrable        | Détail                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Modèle          | `Notification`, `NotificationPreference`, `MessageLog`                                                            |
| Canaux          | Email, SMS, WhatsApp (lien `wa.me` au minimum), avec suivi des coûts et de la délivrabilité                       |
| Types           | **Quatre seulement**, chacun actionnable                                                                          |
| Rappels         | Jobs J-7, J-1, H-x (cahier des charges §31)                                                                       |
| PWA participant | Manifeste, service worker, cache dans l'ordre de priorité du prototype, invite d'installation, bandeau hors ligne |
| Écrans          | U6 notifications, invite d'installation                                                                           |
| Tests           | Ordre de cache, fonctionnement hors ligne des billets, préférences respectées                                     |

**Critère de sortie** : la PWA s'installe, pèse moins de 1,2 Mo, les billets à venir sont consultables
en mode avion, et les quatre types de notification arrivent.

### État : LIVRÉE ✅

**Critère de sortie vérifié**, point par point.

| Condition                                 | Résultat                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| La PWA s'installe                         | ✅ manifeste, invite retenue jusqu'aux écrans de billets, refus mémorisé              |
| Moins de 1,2 Mo                           | ✅ **385 Ko gzip** de coque en production (voir la note ci-dessous)                   |
| Billets consultables en mode avion        | ✅ vérifié serveur arrêté : billet et QR rendus depuis le cache                       |
| Les quatre types de notification arrivent | ✅ trois branchés sur un déclencheur réel, le quatrième câblé sans déclencheur au MVP |

**Sur le poids : ne pas mesurer en développement.** Le cache atteignait 5,8 Mo
lors de la première mesure — code non minifié, HMR et cartes de source
comprises. Le chiffre qui compte est celui de `next build` : 385 Ko compressés
pour les fragments partagés. Rapporter le premier aurait donné une alerte
fausse, et un budget « corrigé » pour un problème qui n'existait pas.

### Ce que les tests ont révélé

**Un interblocage PostgreSQL, qui cachait un défaut de production.** Les
diffusions détachées écrivaient dans `message_log` pendant qu'un test suivant
vidait les tables. Le symptôme était un test intermittent ; la cause était que
rien ne permettait d'attendre les envois en vol — y compris à l'arrêt du
processus, où un déploiement coupait la connexion au milieu d'un envoi.
`OutboundService.drain()` répond aux deux, et `onApplicationShutdown` l'appelle.

**Une violation d'unicité dans une transaction avorte tout.** Le dédoublonnage
reposait sur un `catch` de `P2002` — inopérant quand `notify` est appelé depuis
la transaction d'un encaissement : chaque requête suivante échouerait en
`25P02`, et l'encaissement entier serait perdu à cause d'un webhook rejoué. La
lecture préalable de `dedupeKey` n'est donc pas une optimisation, c'est la seule
protection utilisable dans ce contexte.

### Deux décisions de conception

**Ce qui sort de l'application, et ce qui y reste.** Tout arrive dans le centre
de notifications ; seuls les paiements confirmés et les modifications d'événement
partent AUSSI par SMS ou WhatsApp. La règle : ne sort que ce qui a une
conséquence si on le rate. Un rappel J-7 manqué n'en a pas, une annulation si.

**Un seul canal externe par message.** WhatsApp quand il est accepté, SMS en
repli. Envoyer les deux double le coût pour ne rien apporter — le participant a
déjà lu.

### Ce qui reste

| Livrable                  | État                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `ORGANIZER_PUBLISHED`     | Type et préférence câblés ; le suivi d'organisateur n'est pas au périmètre |
| Agrégateur SMS / WhatsApp | Abstraction `SmsProvider` prête ; l'implémentation `console` tient le rôle |
| Notifications web push    | Enum `PUSH` déclaré, non emprunté : demande une clé VAPID et un abonnement |

---

## Phase 11 · Administration et modération

**Objectif** : pouvoir exploiter la plateforme.

| Livrable         | Détail                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application      | `apps/admin` sur `admin.nexakabi.bj`, cookie distinct, 2FA obligatoire                                                                                                                                |
| Modèle           | `Report`, `ReportNote`, complément de `AuditLog`                                                                                                                                                      |
| Écrans           | M1 dashboard, M2 modération d'événements, M3 file de vérification avec les 3 contrôles, M4 utilisateurs, M5 transactions avec export comptable, M6 retraits, M7 signalements avec workflow en 4 états |
| Gel des fonds    | Levier de modération de premier recours, écritures `FREEZE`/`UNFREEZE`                                                                                                                                |
| Export comptable | CSV réconciliable avec les relevés opérateurs                                                                                                                                                         |
| Tests            | Workflow de signalement, SLA, immuabilité des transactions, traçabilité                                                                                                                               |

**Critère de sortie** : un administrateur vérifie une organisation, traite un signalement, gèle un
solde, exécute un retrait, et chaque action est tracée dans le journal d'audit.

### État : LIVRÉE ✅ — sauf l'export comptable et l'écran des retraits

**Critère de sortie vérifié** sur la base réelle, par 22 tests d'intégration
(`apps/api/src/modules/admin/admin.integration.test.ts`) et un parcours complet
dans le navigateur.

| Vérification                         | Résultat                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Le mot de passe seul n'ouvre rien    | ✅ `401` sur le tableau de bord avant le code TOTP, `200` après            |
| Rejeu d'un code TOTP                 | ✅ refusé, même dans sa fenêtre de validité                                |
| Compte inconnu / mot de passe faux   | ✅ message identique — sinon la liste des administrateurs s'énumère        |
| Compte sans 2FA                      | ✅ connexion refusée : la 2FA est une condition d'accès, pas une option    |
| Code de secours                      | ✅ consommé une seule fois, puis retiré de la liste                        |
| Durée de session                     | ✅ plafonnée à 8 h par une contrainte `CHECK`, pas seulement par le code   |
| Le gel ne fait rien disparaître      | ✅ total du grand livre identique avant et après : 30 000 → 30 000         |
| Gel puis dégel                       | ✅ retour exact à l'état initial (18 000 / 12 000), 4 écritures tracées    |
| Décision non motivée                 | ✅ refusée en base (`report_decision_is_motivated`, 10 caractères minimum) |
| Décision sans auteur                 | ✅ refusée (`report_decision_is_attributed`)                               |
| Deux modérateurs sur le même dossier | ✅ le second est refusé                                                    |

### Ce que les tests ont révélé

**Le gel ne peut pas se limiter au solde disponible.** La première version
plafonnait le gel au disponible. Un test l'a mise en défaut : juste après un
achat, au premier palier, tout est encore bloqué — le disponible vaut zéro, et
le gel était refusé sur le compte qu'il fallait précisément arrêter.

Pire, même avec du disponible : les fonds bloqués se libèrent d'eux-mêmes à
l'échéance du palier. Geler le seul disponible laisserait l'organisateur retirer
le lendemain ce qu'on venait de lui bloquer la veille. Le plafond est donc le
TOTAL détenu, et le solde disponible peut passer transitoirement en négatif —
c'est le comportement voulu.

### Quatre décisions de conception

**Une application séparée, pas un dossier de plus.** Le cookie d'administration
ne circule jamais avec les requêtes du site public ; rien du code
d'administration n'est livré au navigateur d'un participant ; et la console se
déploie sans toucher au tunnel d'achat. Le coût est faible : contrats, design
system et utilitaires sont partagés.

**TOTP écrit à la main, contrôlé par les vecteurs de la RFC 6238.** L'algorithme
tient en trente lignes et la norme publie ses cas de test — les six sont rejoués
dans `packages/utils/src/totp.test.ts`. Ce qui compte vraiment n'est pas le
calcul mais la fenêtre de tolérance, le refus du rejeu et le chiffrement du
secret : aucune bibliothèque ne l'aurait fait à notre place.

**`scrypt` plutôt qu'Argon2id.** Argon2id serait le premier choix dans l'absolu,
et le schéma l'annonçait. Il exige une dépendance native compilée par
plateforme, pour quelques comptes d'administration. `scrypt` est dans Node,
reste un KDF sérieux, et les paramètres suivent l'OWASP. Le commentaire du
schéma a été corrigé : une documentation qui annonce autre chose que ce qui
tourne est pire que pas de documentation.

**Le jeton ne sort jamais dans le corps de la réponse.** Le relais BFF le
retire avant de renvoyer : le poser en cookie `httpOnly` tout en le laissant
lisible dans le JSON ne protégerait rien.

### Ce qui reste

| Livrable                           | État                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Export comptable CSV               | Non fait — le format doit se rapprocher des relevés opérateurs réels              |
| Écran M6 retraits                  | API livrée en phase 9 ; l'écran d'administration n'est pas branché                |
| Consultation des pièces d'identité | Stockage privé en place ; le lecteur à URL signée et tracée reste à brancher      |
| Écran M4 utilisateurs              | Non fait — aucun besoin identifié qui ne passe pas par un signalement             |
| Refus du rejeu TOTP multi-instance | En mémoire : ne couvre qu'une instance. À porter en base le jour du deuxième nœud |

---

## Phase 12 · Durcissement, recette et préparation du pilote

**Objectif** : passer d'un produit qui marche à un produit qu'on peut exposer à de l'argent réel.

| Livrable      | Détail                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sécurité      | Revue complète de la liste de contrôle, test d'intrusion externe recommandé sur le tunnel d'achat et l'administration        |
| Performance   | Tests de charge (vente flash : 500 achats simultanés), optimisation des requêtes, budget de poids revérifié sur chaque écran |
| Accessibilité | Audit AA complet, correction des écarts                                                                                      |
| Résilience    | Sauvegardes et restauration testées, procédure de reprise, journal des incidents                                             |
| Documentation | Documentation d'exploitation, procédures de support, guide organisateur                                                      |
| Contenu       | Pages légales rédigées et validées juridiquement, FAQ, textes d'aide                                                         |
| Recette       | Parcours complets rejoués manuellement sur appareils réels                                                                   |
| Surveillance  | Sentry, alertes, tableau de bord d'exploitation opérationnels                                                                |

**Critère de sortie** : la plateforme supporte une vente flash simulée, restaure une sauvegarde en
moins de 30 minutes, et passe l'audit d'accessibilité.

### État : PARTIELLE — la vente flash est vérifiée, le reste demande un environnement de pilote

| Livrable                     | État                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Vente flash 500 simultanés   | ✅ vérifiée, et **elle a révélé un défaut sérieux** (voir ci-dessous)        |
| Pages légales                | ✅ rédigées, avec les points à faire valider juridiquement signalés en clair |
| Sécurité — revue de la liste | Partielle : les garanties sont en place et testées, la revue formelle reste  |
| Test d'intrusion externe     | Non fait — demande un prestataire et un environnement exposé                 |
| Audit d'accessibilité AA     | Non fait                                                                     |
| Sauvegardes et restauration  | Non fait — demande l'infrastructure du pilote                                |
| Sentry et alertes            | Non fait                                                                     |
| Recette sur appareils réels  | Non fait                                                                     |

### Ce que la vente flash a révélé

**143 acheteurs sur 200 ne recevaient pas leur billet.** Le test rejoue le
scénario redouté en entier : cinq cents personnes, deux cents places, du panier
jusqu'à l'émission des billets. Résultat de la première exécution :

```
{"payé": 57, "paiement-non-abouti": 143, "stock-insuffisant": 300}
```

Les trois cents refus de stock sont le fonctionnement normal. Les 143 autres ne
l'étaient pas : leurs paiements étaient **encaissés chez l'opérateur** mais
restaient en `PROCESSING` chez nous, avec en journal
`Unable to start a transaction in the given time`.

**La cause.** La transaction qui ENCAISSE — verrou sur le paiement, confirmation
du stock, mise à jour de la commande, émission des billets, trois écritures au
grand livre — tournait avec les valeurs par défaut de Prisma : deux secondes
pour obtenir une connexion. La simple RÉSERVATION, elle, disposait déjà de vingt
secondes depuis la phase 6. La transaction la plus lourde avait le délai le plus
court.

**Ce qui était en jeu.** Rien n'était perdu : la réconciliation périodique
rattrape ces paiements à la minute suivante. Mais 143 personnes sur 200 auraient
vu « paiement en cours » au lieu de leur billet, à l'entrée d'un concert, après
avoir été débitées. C'est le genre de défaut qui ne casse aucun test unitaire et
qui se découvre le soir de l'événement.

**Après correction** — mêmes délais que la réservation :

```
{"payé": 200, "stock-insuffisant": 300}
```

### Pourquoi ce test a fonctionné là où les précédents ne voyaient rien

Le test de concurrence de la phase 6 s'arrêtait à la RÉSERVATION : il vérifiait
qu'on ne vend pas cent places quand il y en a cinquante. Celui-ci va jusqu'à
l'encaissement, et une assertion en particulier a tout changé —
`expect(paidOrders).toBe(CAPACITY)`. Sans elle, le test passait au vert avec 57
paiements sur 200 : aucune survente, aucun billet orphelin, tous les invariants
respectés. Simplement, les trois quarts des acheteurs n'avaient pas leur billet.

Un test de charge qui compte seulement les succès mesure sa propre indulgence.

### Ce qui reste, et ce qu'il faut pour le faire

| Livrable                    | Ce qu'il demande                                                             |
| --------------------------- | ---------------------------------------------------------------------------- |
| Test d'intrusion            | Un prestataire et un environnement exposé — hors de portée du développement  |
| Sauvegarde / restauration   | L'infrastructure du pilote : la procédure ne se teste pas sur un poste local |
| Audit AA                    | Un passage écran par écran avec lecteur d'écran, sur appareils réels         |
| Sentry                      | Un projet et une clé ; l'instrumentation est mécanique une fois décidée      |
| Recette sur appareils réels | Des téléphones Android d'entrée de gamme et une connexion béninoise réelle   |

Ces cinq points ont un dénominateur commun : ils demandent un environnement ou
un tiers, pas du code. Les prétendre faits ici serait plus grave que de les
laisser ouverts.

---

## Phase 13 · Intégration paiement réelle

**Objectif** : brancher l'argent. **Cette phase dépend entièrement de la piste parallèle §4.**

| Livrable       | Détail                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| Providers      | `MtnMomoProvider`, `MoovMoneyProvider`, éventuellement `AggregatorProvider`       |
| Bac à sable    | Tests complets en environnement opérateur, tous les cas d'échec                   |
| Réconciliation | Rapprochement réel avec les relevés opérateurs, KPI d'écart à zéro                |
| Retraits réels | Versements Mobile Money et virements bancaires                                    |
| Pilote         | 5 à 10 organisateurs, événements réels de petite taille, accompagnement rapproché |

**Critère de sortie** : un événement réel vendu, encaissé, contrôlé à l'entrée et payé à
l'organisateur, sans incident financier.

### État : CODE PRÊT — reste le bac à sable et le pilote, qui demandent des clés réelles

**Décision (19 septembre 2026) : Bictorys plutôt que FedaPay, et une
architecture multi-pays plutôt qu'un branchement béninois.** FedaPay a été
retiré. La première intégration confondait le prestataire et le moyen de
paiement — `providerCode` valait `mtn_momo`, et un fournisseur était instancié
par opérateur. Ouvrir un second pays aurait demandé de tout réécrire.

Le système repose désormais sur trois objets distincts, et une configuration :

```
country                  BJ ouvert · CI, SN, TG, BF, ML, NE, GN, CM, GH, NG dormants
country_payment_method   pays × moyen × prestataire · collecte ? · versement ?
                         + constat synchronisé depuis le compte marchand
commission_policy        plateforme > pays > organisation · jamais par moyen
```

`PaymentRoutingService` est le seul endroit qui décide « qui traite quoi où » :
le tunnel lui demande les moyens du pays de la commande, l'encaissement lui
demande le prestataire d'un moyen, le retrait lui demande qui verse sur le
moyen du compte de réception. Aucun service métier ne connaît un prestataire
par son nom. Un pays s'ouvre depuis la console (« Pays & paiements »), sans code.

| Livrable                           | État                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Modèle pays / moyens / prestataire | ✅ `Country`, `CountryPaymentMethod`, `CommissionPolicy` ; pays sur organisation, événement, commande, paiement, compte de réception |
| Encaissement Bictorys              | ✅ Mobile Money par API directe (`POST /pay/v1/charges?payment_type=…`), carte par page hébergée |
| Webhooks                           | ✅ en-tête `X-Secret-Key` vérifié, puis **relecture** `GET /pay/v1/transactions/{id}` avant tout crédit |
| Interrogation de statut            | ✅ le filet contre le webhook perdu, inchangé                                              |
| Remboursements                     | ✅ intégraux (`PUT /transactions/{id}/refund`) ; le partiel est déclaré non supporté      |
| Retraits réels                     | ✅ `POST /pay/v1/payouts?payment_type=…` avec `idempotency-key`, conclu par webhook `transfer` ou interrogation |
| Synchronisation du compte marchand | ✅ `GET /onboarding/v1/payment-methods/me` → constat par pays et par moyen               |
| Simulateur                         | ✅ un seul prestataire `mock`, tous moyens, tous pays ; page de carte simulée avec webhook puis retour |
| Console « Pays & paiements »       | ✅ ouvrir un pays, collecte/versement par moyen, ajout d'un moyen du catalogue, synchronisation |
| Bac à sable Bictorys               | Non fait — demande des clés de test réelles                                                |
| Pilote 5–10 organisateurs          | Non fait                                                                                   |

### Le webhook n'est qu'un signal

Bictorys authentifie ses notifications par un secret partagé dans un en-tête,
sans signature du corps. Un secret peut fuiter ; un corps peut être rejoué
modifié. `PaymentProvider.capabilities.verifyWebhookByFetch` demande donc au
service de relire la transaction chez Bictorys avant d'appliquer un succès. Si
la relecture échoue, la notification reste `RECEIVED` et la réconciliation
reprend : un billet n'est jamais émis sur la seule foi d'un message entrant.

### Collecte et versement sont deux capacités

Qu'un moyen sache encaisser ne dit rien de sa capacité à verser. Chaque ligne de
configuration porte deux drapeaux, et le compte de réception d'un organisateur
se choisit parmi les moyens ouverts EN VERSEMENT dans son pays — jamais déduit
du moyen par lequel les participants ont payé. Un virement bancaire n'est
jamais automatique : il se fait depuis la banque et s'enregistre dans la console.

### Un défaut trouvé en rejouant le retrait

L'exécution d'un retrait relisait `payoutBlockedReason` en entier, minimum de
retrait compris. Or le montant est débité dès la demande : au moment
d'exécuter, le disponible est souvent SOUS le minimum, et le versement était
refusé — précisément pour l'organisateur qui retire tout son solde. Seuls le gel
et la vérification sont revérifiés à l'exécution.

### Ce qu'il faut pour finir cette phase

Des clés Bictorys de test, puis de production. `BICTORYS_API_KEY` renseignée
suffit à basculer du simulateur au prestataire réel, pour tous les moyens que la
configuration lui confie ; la synchronisation ferme ensuite d'elle-même ce que
le compte marchand ne sait pas faire. Sans clé et hors production, le
simulateur prend le relais pour les mêmes moyens, de sorte que les écrans sont
ceux du prototype. En production sans clé, l'annuaire reste VIDE et le tunnel
dit honnêtement qu'aucun moyen de paiement n'est disponible.

Les utilisateurs ne sont pas forcément béninois : le sélecteur d'indicatif de
la connexion et des coordonnées d'achat accepte tous les pays du registre, et
un numéro inconnu crée son compte comme avant. Une limite assumée : une
commande se paie dans la devise de son pays — pas de conversion inter-devises.

Chaque pays dormant est livré avec son paysage d'opérateurs (Wave et Orange
Money à Dakar, Orange Money et MTN à Abidjan, T-Money à Lomé…) : l'ouvrir dans
la console suffit, la synchronisation Bictorys — au démarrage puis chaque
heure — ferme ce que le compte marchand ne sait pas traiter. Le simulateur
n'est plus proposé comme moyen de paiement : il ne s'enregistre que sans clé
Bictorys, et c'est l'environnement de Bictorys (test ou live) qui dit si
l'argent est réel.

---

## Phase 14 · Lancement progressif

Cotonou → Abomey-Calavi → Porto-Novo, puis le reste du pays (cahier des charges §57).

Priorités post-lancement, dans l'ordre :

1. Codes promotionnels et invitations (le besoin remontera dès les premiers événements).
2. Notifications push Web Push.
3. Remboursements automatisés à grande échelle.
4. Statistiques avancées et sources de trafic.
5. Facturation avec valeur fiscale.
6. Mise en avant payante.
7. Agents de vente et points de vente physiques.
8. Application native, Wallet, affiliation, marketplace.

---

# 4. PISTE PARALLÈLE — DÉMARCHES NON TECHNIQUES

**Ces démarches ont les délais les plus longs du projet et ne dépendent d'aucun code. Elles doivent
démarrer avec la Phase 1, pas avec la Phase 13.**

| Démarche                                                       | Délai typique   | À démarrer   | Risque si retardé                  |
| -------------------------------------------------------------- | --------------- | ------------ | ---------------------------------- |
| Contractualisation MTN MoMo marchand                           | 4 à 12 semaines | Phase 1      | **Bloque le lancement** (R1)       |
| Contractualisation Moov Money                                  | 4 à 12 semaines | Phase 1      | idem                               |
| Évaluation d'un agrégateur régional (plan A alternatif)        | 2 à 6 semaines  | Phase 1      | Réduit fortement R1                |
| Conseil juridique — détention de fonds (BCEAO)                 | 2 à 6 semaines  | Phase 1      | **Bloque la production** (R2, A10) |
| Sélection fournisseur SMS + tarification                       | 2 à 4 semaines  | Phase 2      | Bloque la Phase 3                  |
| WhatsApp Business API — validation Meta et modèles de messages | 4 à 8 semaines  | Phase 2      | Perte du canal principal (R8)      |
| Enregistrement des domaines + dépôt de marque                  | 1 à 4 semaines  | Phase 1      | A11                                |
| Validation du plan de numérotation (ARCEP-Bénin)               | 1 semaine       | **Immédiat** | **Bloque la Phase 3** (A2, R14)    |
| Rédaction juridique CGU / CGV / confidentialité                | 3 à 6 semaines  | Phase 6      | Bloque le lancement                |
| Cadrage fiscal avec un expert-comptable béninois               | 2 à 4 semaines  | Phase 9      | A9                                 |
| Recrutement des 5–10 organisateurs pilotes                     | continu         | Phase 5      | Retarde la Phase 13                |

---

# 5. VUE D'ENSEMBLE

```
Piste technique                          Piste parallèle
──────────────────────────────────       ─────────────────────────────────────
P1  Fondations                       ║   Numérotation · juridique · opérateurs
P2  Design system                    ║   SMS · WhatsApp · domaines
P3  Authentification                 ║
P4  Organisations et équipes         ║   Contractualisation en cours…
P5  Événements et découverte         ║   Recrutement des pilotes
P6  Checkout et paiements (mock)     ║
P7  Billets et QR                    ║   Rédaction juridique
P8  Check-in et hors ligne           ║
P9  Finances et retraits             ║   Cadrage fiscal
P10 Notifications et PWA             ║
P11 Administration                   ║
P12 Durcissement et recette          ║
P13 Paiement réel + pilote ◄─────────╨── dépend de la contractualisation
P14 Lancement progressif
```

**Chemin critique** : P1 → P3 → P4 → P5 → P6 → P7 → P8. Les phases 9 à 11 peuvent partiellement se
paralléliser si l'équipe compte plusieurs développeurs.

**Point de non-retour** : la Phase 13 ne peut pas démarrer sans la contractualisation opérateur.
C'est la raison pour laquelle `MockPaymentProvider` est un livrable de premier plan et non un
utilitaire de test : il permet de construire et de valider 100 % du produit sans dépendre d'un
partenaire externe.

---

# 6. DÉFINITION DE « TERMINÉ »

Une phase est terminée quand **tous** les points suivants sont vrais :

- [ ] Chaque écran livré possède ses cinq états (vide, chargement, erreur, succès, hors ligne).
- [ ] Chaque écran a été comparé visuellement au prototype `design-reference/`.
- [ ] Les tests de la phase passent, et la couverture cible est atteinte sur les modules financiers.
- [ ] `tsc --noEmit`, ESLint et Prettier passent sans avertissement.
- [ ] Aucun `any` non accompagné d'un commentaire justifiant l'exception.
- [ ] Le budget de performance est respecté (Lighthouse CI).
- [ ] Les écrans du tunnel d'achat passent l'audit axe-core.
- [ ] Les actions sensibles introduites écrivent dans `AuditLog`.
- [ ] La documentation OpenAPI est à jour et le client typé régénéré.
- [ ] Les nouvelles ambiguïtés découvertes sont documentées, pas résolues silencieusement.
