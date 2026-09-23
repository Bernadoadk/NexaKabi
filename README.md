# Nexa-Kabi

Plateforme béninoise de découverte, de billetterie et de gestion d'événements.

> **Découvrir un événement → acheter son billet en Mobile Money → recevoir son QR Code → entrer.**
> Et pour l'organisateur : **créer → vendre → contrôler → encaisser → analyser.**

---

## État d'avancement

| Phase | Objet                                               | État |
| ----- | --------------------------------------------------- | :--: |
| 0     | Analyse et architecture                             |  ✅  |
| 1     | Fondations — monorepo, qualité, CI                  |  ✅  |
| 2     | Design system — jetons et composants                |  ✅  |
| 3     | Authentification par téléphone et code à 6 chiffres |  ⏳  |
| 4     | Organisations, équipes et rôles                     |  ⏳  |
| 5     | Événements, billetterie et découverte publique      |  ⏳  |
| 6     | Checkout et paiements                               |  ⏳  |
| 7     | Billets et QR signés                                |  ⏳  |
| 8     | Check-in et mode hors ligne                         |  ⏳  |
| 9     | Finances et retraits                                |  ⏳  |
| 10    | Notifications et PWA                                |  ⏳  |
| 11    | Administration et modération                        |  ⏳  |
| 12    | Durcissement et recette                             |  ⏳  |
| 13    | Intégration paiement réelle et pilote               |  ⏳  |

Le détail de chaque phase figure dans [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md).

---

## Démarrage

**Prérequis** : Node.js ≥ 20.11, pnpm 11, PostgreSQL 16+.

```bash
pnpm install                      # dépendances
cp apps/api/.env.example apps/api/.env   # puis renseigner DATABASE_URL
cp apps/web/.env.example apps/web/.env.local
pnpm db:generate                  # client Prisma
pnpm db:migrate                   # migrations
pnpm db:seed                      # référentiels : catégories et villes (idempotent)
pnpm dev                          # web sur :3000, API sur :4000
```

**PostgreSQL — deux options au choix.**

_Instance locale_ : créez une base et renseignez `DATABASE_URL` dans `apps/api/.env`.

```
DATABASE_URL="postgresql://postgres:motdepasse@localhost:5432/nexakabi_db"
```

_Docker_ : `pnpm infra:up` démarre PostgreSQL et Redis avec les identifiants du
`.env.example`. Redis n'est requis qu'à partir de la phase 6 (files de traitement,
réservation de stock, limitation de débit).

La page d'accueil affiche l'état de la chaîne complète — API et base de données —
ce qui permet de vérifier l'installation d'un coup d'œil.

| Adresse                             | Contenu                  |
| ----------------------------------- | ------------------------ |
| http://localhost:3000               | Application web          |
| http://localhost:3000/design-system | Galerie du design system |
| http://localhost:4000/api/health    | Sonde de disponibilité   |
| http://localhost:4000/api/docs      | Documentation OpenAPI    |

---

## Commandes

```bash
pnpm dev            # tout démarrer en mode développement
pnpm build          # tout construire
pnpm lint           # ESLint
pnpm typecheck      # vérification des types
pnpm format         # formatage Prettier
pnpm db:studio      # explorateur de base de données
pnpm db:migrate     # créer et appliquer une migration
pnpm db:seed        # référentiels : catégories et villes (idempotent)
pnpm infra:reset    # réinitialiser les conteneurs Docker (données perdues)
```

**Compte d'administration.** La console ne peut pas se créer elle-même : le **propriétaire**
s'amorce par script, avec un identifiant de la forme `nom.owner@xxxx` (suffixe généré) et un
mot de passe de 12 caractères au minimum. Relancer le script met à jour le propriétaire
existant (nom, mot de passe) sans changer son suffixe.

```bash
ADMIN_PASSWORD='un-mot-de-passe-de-12-caracteres-minimum' pnpm --filter @nexakabi/api exec tsx src/scripts/create-owner.ts bernado "Bernado"
```

Les **employés** se créent ensuite depuis l'écran « Équipe » de la console (`nom.staff@xxxx`),
avec, pour chaque espace — Événements, Vérifications, Signalements, Organisations, Utilisateurs,
Retraits — un niveau _consultation_ ou _décision_, et un droit à part pour les mouvements
d'argent. Pas de double authentification : mot de passe seul, blocage après cinq échecs,
sessions de 8 h révocables, chaque geste tracé dans le journal d'audit.

**Paiements multi-pays : pays → moyens → prestataire.** Le système de paiement repose sur trois
objets distincts. Le **pays** (table `country`) porte sa devise et son indicatif, et s'ouvre depuis
la console — le Bénin est ouvert et par défaut, les autres pays d'Afrique de l'Ouest attendent. Le
**moyen** (`mtn_momo`, `wave`, `card`, `bank_transfer`…) est ce que le participant reconnaît. Le
**prestataire** (`bictorys`, `mock`) est celui qui traite l'argent, et le participant ne le voit
jamais. La table `country_payment_method` relie les trois, avec deux drapeaux indépendants par
ligne — **collecte** (ce que le participant peut payer) et **versement** (ce sur quoi l'organisateur
peut recevoir) —, plus le constat synchronisé depuis le compte marchand du prestataire. Ouvrir la
Côte d'Ivoire avec Wave se fait dans l'écran « Pays & paiements » de la console, sans code. Le
moyen de réception d'un organisateur est choisi parmi ceux de SON pays, jamais déduit du moyen par
lequel ses acheteurs ont payé : recevoir sur MTN ce qui a été réglé par carte est le cas normal.

**KPay est le seul prestataire du lancement.** Mobile Money au Bénin (MTN, Moov), en Côte
d'Ivoire (MTN, Orange), au Sénégal (Orange, Free) et au Cameroun (MTN, Orange), en validation sur
le téléphone. Chez lui le code du moyen porte le pays (`MTN_MOMO_BEN`, `MTN_MOMO_CIV`), et c'est
le **préfixe de la clé** qui décide si l'argent bouge — `kpay_test_` simule, `kpay_live_` débite ;
l'API refuse de démarrer si ce préfixe contredit l'environnement. La **carte ne lui est pas
confiée** : sa page hébergée facture en USD, alors qu'une commande Nexa-Kabi est un entier de
francs CFA. Il ne rembourse pas par API non plus — cela se fait depuis son tableau de bord.

**L'état des opérateurs se relève chez lui, toutes les cinq minutes.** Un opérateur `CLOSED`
disparaît de l'écran de choix le temps de la panne ; `DELAYED` reste proposé avec la mention
« retards en cours ». Un relevé impossible ne ferme rien — notre incident ne doit pas devenir une
panne de paiement.

**Bictorys est HÉRITÉ.** Son code et ses lignes de configuration restent en place pour relire,
interroger et rembourser ce qu'il a encaissé, mais il ne reçoit plus aucun paiement neuf : le
routage l'écarte, la console ne le propose plus. Ajouter un prestataire plus tard — CinetPay,
FedaPay — consiste à déposer une implémentation de `PaymentProvider` et à le déclarer `ACTIVE` ;
aucun service financier ni écran d'achat n'a à changer.

Les notifications ne sont qu'un signal : un succès annoncé est **relu chez le prestataire** avant
de créditer quoi que ce soit, et un montant ou une devise qui ne correspondent pas au paiement
font refuser la notification. La commission Nexa-Kabi (table `commission_policy`, résolue
organisation > pays > plateforme) ne dépend jamais du moyen de paiement ; les frais du
prestataire sont une ligne à part, constatée à l'encaissement.

**Paiements simulés tant qu'aucune clé de prestataire n'est configurée.** Hors production, le
simulateur prend la place du prestataire pour tous les moyens configurés, avec les retours exacts du contrat
`PaymentProvider` — encaissement, remboursement, versement des retraits — de sorte que brancher le
prestataire réel ne change ni écran ni service. Le numéro saisi choisit le scénario : finit par `00`
→ refus immédiat, `11` → jamais de réponse, `22` → succès immédiat, tout autre → succès après
quelques secondes. Il vaut pour le numéro du payeur à l'achat comme pour le compte de réception d'un
retrait. Un paiement par carte simulé ouvre une page où l'on valide ou refuse — le webhook part, puis
l'acheteur revient, comme chez le vrai prestataire. Un virement bancaire, lui, se fait toujours à la
main et s'enregistre dans la console.

**Aucune donnée de démonstration, aucune suite de tests automatisés.** Le produit se teste en
réel, par ses propres écrans, en suivant le cahier de recette ; la vérification automatique se
limite aux types (`pnpm typecheck`), au lint et au build. Pour
remettre la base à son état de départ — référentiels et propriétaire uniquement — après
une sauvegarde `pg_dump` dans `apps/api/storage/backups/` :

```bash
pnpm --filter @nexakabi/api exec tsx src/scripts/reset-to-clean-state.ts --confirmer
```

---

## Structure

```
apps/
  web/          Next.js — public, participant, organisateur, check-in
  api/          NestJS — API REST, Prisma, files de traitement
packages/
  contracts/    Schémas Zod et types partagés — source unique de vérité
  ui/           Design system : jetons et composants
  utils/        Montants XOF, téléphones E.164, dates françaises, slugs
  config/       Presets ESLint, TypeScript, Prettier
docs/           Analyse, architecture, modèle de données, feuille de route
design-reference/   🔒 Prototype de référence — LECTURE SEULE
infra/          docker-compose (PostgreSQL, Redis)
```

---

## Règles du projet

**`design-reference/` ne se modifie jamais.** C'est la référence visuelle et UX du produit. Les
jetons du design system y sont relevés valeur par valeur, jamais approximés. Le dossier est exclu
de Prettier et d'ESLint.

**Les montants sont des entiers.** Le franc CFA n'a pas de sous-unité : aucun nombre à virgule
flottante ne représente jamais de l'argent. Tout passe par `@nexakabi/utils/money` et le composant
`<Money>`.

**Les numéros de téléphone sont normalisés en E.164.** Le numéro est l'identifiant
d'authentification et la clé de rapprochement Mobile Money. L'ancien format béninois à 8 chiffres
est accepté à la saisie et converti.

**L'identifiant d'authentification est le numéro de téléphone**, jamais un mot de passe. Un code à
6 chiffres tient lieu de preuve, la session dure 90 jours, et les jetons vivent dans des cookies
httpOnly posés par les route handlers de Next : le navigateur ne parle jamais directement à l'API.

**Les droits dans une organisation passent par la matrice de permissions** de
`@nexakabi/contracts`, appliquée par `OrgMemberGuard`. Aucun contrôleur ne compare un rôle en dur :
c'est ce qui empêche le code et la documentation de diverger. Le rôle est présenté à l'utilisateur
par une phrase, jamais par une matrice de cases à cocher.

**Le stock ne peut pas être sur-vendu** : une contrainte `CHECK` en base garantit
`quantitySold + quantityReserved <= quantityTotal`. La vérification applicative peut être
contournée par une course entre deux requêtes ; celle-là, non.

**`any` est interdit** sauf justification explicite en commentaire.

**Un écran n'est livré que lorsque ses cinq états sont dessinés** : vide, chargement, erreur,
succès, hors ligne.

**Toute action sensible est tracée** dans le journal d'audit : opérations financières,
changements de rôle, publication ou annulation d'événement, accès à une pièce d'identité.

---

## Documentation

| Document                                                           | Contenu                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| [`docs/cahier-des-charge.md`](docs/cahier-des-charge.md)           | Cahier des charges fonctionnel                        |
| [`docs/PROJECT_ANALYSIS.md`](docs/PROJECT_ANALYSIS.md)             | Produit, rôles, design, écrans, parcours, ambiguïtés  |
| [`docs/TECHNICAL_ARCHITECTURE.md`](docs/TECHNICAL_ARCHITECTURE.md) | Stack, modules, auth, paiements, QR, PWA, risques     |
| [`docs/DATABASE_PROPOSAL.md`](docs/DATABASE_PROPOSAL.md)           | Entités, relations, contraintes, machines à états     |
| [`docs/DEVELOPMENT_ROADMAP.md`](docs/DEVELOPMENT_ROADMAP.md)       | Plan par phases et piste parallèle                    |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                         | Mise en ligne : Vercel (api, web, admin), Neon, crons |

---

## Décisions en attente

Trois points appellent une décision avant d'aller plus loin ; ils sont documentés dans
`docs/PROJECT_ANALYSIS.md` §8.

- **A2 — Plan de numérotation téléphonique** 🔴 à confirmer auprès de l'ARCEP-Bénin. Le code
  accepte les deux formats et normalise vers 10 chiffres, mais la règle doit être validée.
- **A10 — Montage juridique de détention des fonds** 🔴 encaisser pour le compte de tiers dans
  l'espace UEMOA peut relever de la réglementation BCEAO.
- **A1 — Part fixe des frais de service** 🟠 le libellé du prototype annonce « + 100 FCFA par
  billet », les montants affichés ne l'appliquent pas. Le calcul est paramétrable, le défaut suit
  les montants.
