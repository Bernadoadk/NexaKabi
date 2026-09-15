# NEXA-KABI — PROPOSITION DE MODÈLE DE DONNÉES

> **Phase 0 — Proposition documentée.** Aucun fichier `schema.prisma` n'est créé. Ce document décrit
> les entités, leurs champs, leurs relations, leurs cardinalités, leurs contraintes et leurs machines
> à états, afin d'être validé avant toute implémentation.
>
> Documents liés : `PROJECT_ANALYSIS.md` (§8 pour les ambiguïtés référencées),
> `TECHNICAL_ARCHITECTURE.md` (§6 paiements, §7 QR).

## Sommaire

1. Conventions transverses
2. Vue d'ensemble des entités
3. Identité et accès
4. Organisations et équipes
5. Catalogue et événements
6. Commandes et paiements
7. Billets et contrôle d'accès
8. Finance
9. Promotions
10. Communication et modération
11. Machines à états
12. Index et contraintes critiques
13. Points ouverts

---

# 1. CONVENTIONS TRANSVERSES

| Convention               | Choix                                                                                                                      | Justification                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clés primaires**       | `String @id` au format **CUID2** (ou UUIDv7)                                                                               | Non énumérable, triable par date de création avec UUIDv7, sûr en URL. Les identifiants séquentiels exposeraient le volume d'affaires               |
| **Identifiants publics** | Champ `publicId` distinct, aléatoire, sur les entités exposées (billet, jeton)                                             | Sépare la clé technique de ce qui circule dans un QR ou une URL                                                                                    |
| **Montants**             | `Int` (entier), en **unité entière de FCFA**                                                                               | Le XOF n'a **pas de sous-unité** (exposant 0). Aucun flottant nulle part. Un champ `currency` accompagne chaque montant pour l'extension régionale |
| **Devise**               | `currency String @default("XOF")`                                                                                          | Prépare l'Afrique de l'Ouest sans complexité immédiate. La table de configuration porte l'exposant décimal par devise                              |
| **Horodatages**          | `createdAt`, `updatedAt` sur toute entité ; `TIMESTAMPTZ` en UTC                                                           | Le Bénin est en UTC+1 sans heure d'été, mais stocker en UTC reste la seule option correcte                                                         |
| **Suppression**          | `deletedAt` (suppression logique) sur les entités métier ; suppression physique sur les entités techniques (sessions, OTP) | Traçabilité financière et modération. Une commande n'est jamais supprimée                                                                          |
| **Énumérations**         | `enum` PostgreSQL natif                                                                                                    | Contrainte au niveau base, pas seulement applicative                                                                                               |
| **Téléphone**            | Stocké en **E.164** (`+2290197441208`), unique                                                                             | Voir ambiguïté A2                                                                                                                                  |
| **Slugs**                | Uniques, immuables après publication                                                                                       | SEO ; un renommage crée une redirection, pas une modification                                                                                      |
| **JSON**                 | `Json` réservé aux charges utiles opaques (réponse de provider, métadonnées d'audit)                                       | Jamais pour des données interrogées ou contraintes                                                                                                 |
| **Audit**                | Toute action sensible écrit dans `AuditLog`                                                                                | Exigence explicite du prototype                                                                                                                    |

---

# 2. VUE D'ENSEMBLE DES ENTITÉS

```
IDENTITÉ                    ORGANISATION                CATALOGUE
├─ User                     ├─ Organization             ├─ Category
├─ Device                   ├─ OrganizationMember       ├─ City
├─ OtpChallenge             ├─ MemberInvitation         └─ Venue
└─ AdminCredential          ├─ VerificationRequest
                            └─ PayoutAccount            ÉVÉNEMENT
                                                        ├─ Event
COMMANDE                    PAIEMENT                    ├─ EventImage
├─ Order                    ├─ Payment                  └─ TicketType
├─ OrderItem                ├─ PaymentAttempt
├─ StockReservation         ├─ Refund                   BILLET
└─ FeeBreakdown             └─ WebhookEvent             ├─ Ticket
                                                        ├─ CheckIn
FINANCE                     PROMOTION                   └─ CheckInConflict
├─ LedgerEntry              ├─ PromoCode
├─ Balance (vue)            ├─ PromoCodeUsage           COMMUNICATION
├─ Payout                   └─ Invitation               ├─ Notification
└─ CommissionPolicy                                     ├─ NotificationPreference
                            MODÉRATION                  └─ MessageLog
                            ├─ Report
                            └─ AuditLog
```

**Chaîne relationnelle principale** :

```
User ──< OrganizationMember >── Organization ──< Event ──< TicketType
                                                   │           │
                                                   │           ▼
User ──< Order ──< OrderItem ────────────────────────────────┘
          │  │
          │  └──< Ticket ──< CheckIn
          │         │
          │         └──> TicketType
          ▼
       Payment ──< Refund
          │
          └──> LedgerEntry ──> Organization ──< Payout
```

---

# 3. IDENTITÉ ET ACCÈS

## 3.1 `User`

| Champ                                 | Type         | Contrainte                     | Note                                                                 |
| ------------------------------------- | ------------ | ------------------------------ | -------------------------------------------------------------------- |
| `id`                                  | String       | PK                             | CUID2                                                                |
| `phone`                               | String       | **UNIQUE**, non nul            | E.164. Identifiant principal d'authentification                      |
| `phoneVerifiedAt`                     | DateTime?    |                                | Renseigné après validation OTP                                       |
| `email`                               | String?      | UNIQUE partiel (là où non nul) | Canal de secours, facultatif                                         |
| `emailVerifiedAt`                     | DateTime?    |                                |                                                                      |
| `fullName`                            | String       | non nul                        | Le prototype demande un seul champ « Nom complet », pas prénom + nom |
| `avatarUrl`                           | String?      |                                |                                                                      |
| `globalRole`                          | `GlobalRole` | défaut `USER`                  | `USER`, `SUPPORT`, `ADMIN`, `SUPERADMIN`                             |
| `status`                              | `UserStatus` | défaut `UNVERIFIED`            | `UNVERIFIED`, `ACTIVE`, `SUSPENDED`, `DELETED`                       |
| `locale`                              | String       | défaut `fr-BJ`                 | Prépare l'extension régionale                                        |
| `defaultCityId`                       | String?      | FK → `City`                    | Sélecteur de ville de l'en-tête                                      |
| `marketingOptIn`                      | Boolean      | défaut `false`                 | Consentement explicite recueilli à l'étape 3 de l'inscription        |
| `termsAcceptedAt`                     | DateTime?    |                                | Preuve horodatée d'acceptation                                       |
| `suspendedReason`                     | String?      |                                |                                                                      |
| `lastSeenAt`                          | DateTime?    |                                |                                                                      |
| `createdAt`, `updatedAt`, `deletedAt` | DateTime     |                                |                                                                      |

**Relations** : 1–N `Device`, 1–N `Order`, 1–N `OrganizationMember`, 1–N `Notification`,
1–N `Report`, 1–N `AuditLog`.

**Décision** : `fullName` en un seul champ, comme dans le prototype (« Comment t'appelles-tu ? Deux
champs, c'est tout »). Découper en prénom/nom imposerait une saisie que le prototype refuse et
poserait des problèmes avec les noms béninois composés.

**Ambiguïté A3** : un compte créé silencieusement pendant un achat naît `UNVERIFIED`. Il devient
`ACTIVE` après vérification OTP. Les billets restent accessibles via `/t/:token` sans vérification.

## 3.2 `Device` (session persistante)

| Champ                             | Type      | Note                                                       |
| --------------------------------- | --------- | ---------------------------------------------------------- |
| `id`                              | String    | PK                                                         |
| `userId`                          | String    | FK → `User`, cascade                                       |
| `refreshTokenHash`                | String    | UNIQUE. **Jamais le jeton en clair**                       |
| `tokenFamily`                     | String    | Détection de réutilisation : toute la famille est révoquée |
| `userAgent`, `ipAddress`, `label` | String?   | « Chrome sur Android · Cotonou »                           |
| `expiresAt`                       | DateTime  | 90 jours par défaut (durée du prototype)                   |
| `revokedAt`                       | DateTime? |                                                            |
| `lastUsedAt`                      | DateTime  |                                                            |

**Cas particulier contrôleur** : `expiresAt` est ramené à _fin de l'événement + 24 h_ lorsque la
session est ouverte via une invitation de contrôleur.

## 3.3 `OtpChallenge`

| Champ        | Type         | Note                                                      |
| ------------ | ------------ | --------------------------------------------------------- |
| `id`         | String       | PK                                                        |
| `phone`      | String       | Indexé                                                    |
| `codeHash`   | String       | Argon2 ou HMAC — jamais le code en clair                  |
| `purpose`    | `OtpPurpose` | `LOGIN`, `PHONE_CHANGE`, `TEAM_INVITE`, `TICKET_RECOVERY` |
| `channel`    | `OtpChannel` | `SMS`, `WHATSAPP`                                         |
| `attempts`   | Int          | défaut 0, maximum 5                                       |
| `consumedAt` | DateTime?    |                                                           |
| `expiresAt`  | DateTime     | TTL 5 minutes                                             |
| `ipAddress`  | String?      | Limitation de débit                                       |

Purge automatique des enregistrements expirés (job quotidien).

## 3.4 `AdminCredential`

Séparé de `User` : les administrateurs plateforme ont un mot de passe et une 2FA, contrairement à
tous les autres utilisateurs.

| Champ                  | Type      | Note                             |
| ---------------------- | --------- | -------------------------------- |
| `userId`               | String    | FK → `User`, UNIQUE              |
| `passwordHash`         | String    | Argon2id                         |
| `totpSecret`           | String    | Chiffré au repos                 |
| `totpEnabledAt`        | DateTime? | **Obligatoire** avant tout accès |
| `recoveryCodes`        | String[]  | Hachés                           |
| `lastPasswordChangeAt` | DateTime  |                                  |

---

# 4. ORGANISATIONS ET ÉQUIPES

## 4.1 `Organization`

| Champ                                        | Type                 | Contrainte          | Note                                                          |
| -------------------------------------------- | -------------------- | ------------------- | ------------------------------------------------------------- |
| `id`                                         | String               | PK                  |                                                               |
| `slug`                                       | String               | **UNIQUE**          | `/o/yele-productions`                                         |
| `name`                                       | String               |                     |                                                               |
| `legalName`                                  | String?              |                     | Raison sociale si différente                                  |
| `type`                                       | `OrganizationType`   |                     | `INDIVIDUAL`, `COMPANY`, `ASSOCIATION`, `INSTITUTION`         |
| `description`                                | String?              |                     |                                                               |
| `logoUrl`, `coverUrl`                        | String?              |                     |                                                               |
| `email`, `phone`                             | String?              |                     | Contact public                                                |
| `whatsapp`                                   | String?              |                     | Canal de contact principal en pratique                        |
| `website`, `facebook`, `instagram`, `tiktok` | String?              |                     |                                                               |
| `cityId`                                     | String?              | FK → `City`         |                                                               |
| `address`                                    | String?              |                     |                                                               |
| `status`                                     | `OrganizationStatus` | défaut `ACTIVE`     | `ACTIVE`, `SUSPENDED`, `CLOSED`                               |
| `verificationStatus`                         | `VerificationStatus` | défaut `UNVERIFIED` | `UNVERIFIED`, `PENDING`, `INCOMPLETE`, `VERIFIED`, `REJECTED` |
| `verifiedAt`                                 | DateTime?            |                     |                                                               |
| `payoutFrozen`                               | Boolean              | défaut `false`      | **Levier de modération de premier recours**                   |
| `payoutFrozenReason`                         | String?              |                     |                                                               |
| `completedEventsCount`                       | Int                  | défaut 0            | Détermine le palier de déblocage du solde (A4)                |
| `commissionPolicyId`                         | String?              | FK                  | Grille dérogatoire éventuelle                                 |
| `ownerId`                                    | String               | FK → `User`         | Propriétaire, distinct du rôle `ADMIN`                        |

**Relation `ownerId`** : redondante avec `OrganizationMember(role = OWNER)`, mais conservée pour une
contrainte forte — une organisation a exactement un propriétaire, non révocable, seul habilité à
supprimer ou transférer.

## 4.2 `OrganizationMember`

| Champ            | Type           | Contrainte       | Note                                                 |
| ---------------- | -------------- | ---------------- | ---------------------------------------------------- |
| `id`             | String         | PK               |                                                      |
| `organizationId` | String         | FK, cascade      |                                                      |
| `userId`         | String         | FK               |                                                      |
| `role`           | `OrgRole`      |                  | `OWNER`, `ADMIN`, `MANAGER`, `SCANNER`, `ANALYST`    |
| `status`         | `MemberStatus` | défaut `INVITED` | `INVITED`, `ACTIVE`, `SUSPENDED`, `REMOVED`          |
| `scopedEventIds` | String[]       | défaut `[]`      | **Uniquement pour `SCANNER`** : événements autorisés |
| `gate`           | String?        |                  | Porte assignée (« Porte principale »)                |
| `invitedById`    | String?        | FK → `User`      |                                                      |
| `joinedAt`       | DateTime?      |                  |                                                      |

**Contrainte** : `@@unique([organizationId, userId])` — une personne a un seul rôle par organisation.

**Contrainte applicative** : `scopedEventIds` non vide si `role = SCANNER` ; ignoré sinon.

**Point d'architecture** : `scopedEventIds` en tableau plutôt qu'une table de jointure. Justification —
un contrôleur est assigné à un ou deux événements, jamais à des centaines ; le tableau évite une
jointure sur le chemin critique du scan. Si le besoin évolue (agences gérant des dizaines
d'événements simultanés), une table `ScannerAssignment` la remplacera.

## 4.3 `MemberInvitation`

| Champ                            | Type      | Note                                 |
| -------------------------------- | --------- | ------------------------------------ |
| `id`                             | String    | PK                                   |
| `organizationId`                 | String    | FK                                   |
| `token`                          | String    | **UNIQUE**, 128 bits, à usage unique |
| `phone` / `email`                | String?   | Au moins l'un des deux               |
| `role`                           | `OrgRole` |                                      |
| `scopedEventIds`                 | String[]  | Si contrôleur                        |
| `gate`                           | String?   |                                      |
| `expiresAt`                      | DateTime  | **7 jours** (valeur du prototype)    |
| `acceptedAt`, `acceptedByUserId` |           |                                      |
| `revokedAt`                      | DateTime? |                                      |

## 4.4 `VerificationRequest`

| Champ                         | Type                     | Note                                                          |
| ----------------------------- | ------------------------ | ------------------------------------------------------------- |
| `id`                          | String                   | PK                                                            |
| `organizationId`              | String                   | FK                                                            |
| `status`                      | `VerificationStatus`     |                                                               |
| `documents`                   | `VerificationDocument[]` | Relation 1–N                                                  |
| `contactName`, `contactPhone` | String                   | Le responsable identifié                                      |
| `submittedAt`, `reviewedAt`   | DateTime?                |                                                               |
| `reviewedById`                | String?                  | FK → `User` (administrateur)                                  |
| `decisionNote`                | String?                  | Motif obligatoire en cas de refus                             |
| `checks`                      | Json                     | Les **trois contrôles** du prototype, cochés individuellement |

**`checks`** matérialise la règle métier du prototype :

```json
{
  "idMatchesPayoutAccount": true,
  "phoneVerifiedByCode": true,
  "legalDocumentValid": true
}
```

## 4.5 `VerificationDocument`

| Champ             | Type             | Note                                                              |
| ----------------- | ---------------- | ----------------------------------------------------------------- |
| `type`            | `DocumentType`   | `CIP`, `PASSPORT`, `RCCM`, `IFU`, `ASSOCIATION_STATUTES`, `OTHER` |
| `fileKey`         | String           | Clé de stockage objet, **accès par URL signée uniquement**        |
| `status`          | `DocumentStatus` | `PENDING`, `ACCEPTED`, `REJECTED`                                 |
| `rejectionReason` | String?          |                                                                   |

**Sécurité** : ces fichiers contiennent des pièces d'identité. Stockage chiffré, jamais d'URL
publique, accès journalisé dans `AuditLog`, purge après un délai de conservation défini.

## 4.6 `PayoutAccount`

| Champ               | Type                | Note                                                   |
| ------------------- | ------------------- | ------------------------------------------------------ |
| `organizationId`    | String              | FK                                                     |
| `type`              | `PayoutAccountType` | `MOBILE_MONEY`, `BANK`                                 |
| `provider`          | String?             | `mtn_momo`, `moov_money`, `celtiis`                    |
| `accountNumber`     | String              | Numéro MoMo en E.164, ou IBAN/RIB                      |
| `accountHolderName` | String              | **Doit correspondre au nom vérifié**                   |
| `bankName`          | String?             |                                                        |
| `isDefault`         | Boolean             |                                                        |
| `verifiedAt`        | DateTime?           | Confirmé par un micro-versement ou par l'opérateur     |
| `lastFailureReason` | String?             | « Numéro non marchand » (cas relevé dans le prototype) |

---

# 5. CATALOGUE ET ÉVÉNEMENTS

## 5.1 `Category`

| Champ        | Type    | Note                                                            |
| ------------ | ------- | --------------------------------------------------------------- |
| `slug`       | String  | UNIQUE — `musique`, `tech`, `sport`…                            |
| `name`       | String  | 17 catégories listées au cahier des charges §6                  |
| `parentId`   | String? | Auto-relation pour les sous-catégories (§17 étape 1)            |
| `colorToken` | String  | Plaque typographique de repli quand l'événement n'a pas d'image |
| `icon`       | String? |                                                                 |
| `position`   | Int     | Ordre d'affichage                                               |
| `isActive`   | Boolean |                                                                 |

**Note de design** : `colorToken` implémente la règle « sans image, l'événement retombe sur une plaque
typographique colorée dérivée de sa catégorie : jamais de rectangle gris ».

## 5.2 `City`

| Champ                   | Type    | Note                                                 |
| ----------------------- | ------- | ---------------------------------------------------- |
| `slug`, `name`          | String  | Cotonou, Abomey-Calavi, Porto-Novo, Parakou, Ouidah… |
| `region`                | String? | Département                                          |
| `countryCode`           | String  | `BJ` — prépare l'extension régionale                 |
| `latitude`, `longitude` | Float?  | Tri « événements proches »                           |
| `isActive`              | Boolean |                                                      |

## 5.3 `Venue`

Lieu réutilisable par une organisation (« Plage de Fidjrossè », « Sofitel »).

| Champ                   | Type                                           |
| ----------------------- | ---------------------------------------------- |
| `name`, `address`       | String                                         |
| `cityId`                | FK → `City`                                    |
| `latitude`, `longitude` | Float?                                         |
| `organizationId`        | String? — null pour les lieux publics partagés |

## 5.4 `Event`

| Champ                                          | Type              | Contrainte                 | Note                                                           |
| ---------------------------------------------- | ----------------- | -------------------------- | -------------------------------------------------------------- |
| `id`                                           | String            | PK                         |                                                                |
| `slug`                                         | String            | **UNIQUE**                 | `yele-2026` — immuable après publication                       |
| `shortCode`                                    | String            | **UNIQUE**, 6 caractères   | Encodé dans le QR (`eventShortId`) et le lien court `nxk.bj/…` |
| `organizationId`                               | String            | FK                         |                                                                |
| `title`                                        | String            | ≤ 80 caractères            | Limite affichée dans l'assistant                               |
| `subtitle`                                     | String?           |                            |                                                                |
| `description`                                  | String?           | Texte riche assaini        |                                                                |
| `categoryId`, `subcategoryId`                  | String            | FK                         |                                                                |
| `format`                                       | `EventFormat`     |                            | `PHYSICAL`, `ONLINE`, `HYBRID`                                 |
| `venueId`                                      | String?           | FK                         | Si `PHYSICAL`                                                  |
| `cityId`                                       | String?           | FK                         | Dénormalisé pour le filtrage                                   |
| `onlineUrl`, `onlinePlatform`                  | String?           |                            | Si `ONLINE`                                                    |
| `startsAt`, `endsAt`                           | DateTime          |                            |                                                                |
| `doorsOpenAt`                                  | DateTime?         |                            | « Ouverture 17 h 30 » figure sur le billet                     |
| `timezone`                                     | String            | défaut `Africa/Porto-Novo` |                                                                |
| `coverImageUrl`                                | String?           |                            | 16:9, minimum 1600×900                                         |
| `status`                                       | `EventStatus`     | défaut `DRAFT`             | Voir §11.1                                                     |
| `visibility`                                   | `EventVisibility` | défaut `PUBLIC`            | `PUBLIC`, `PRIVATE` (accès par lien)                           |
| `publishedAt`, `cancelledAt`                   | DateTime?         |                            |                                                                |
| `cancellationReason`                           | String?           |                            |                                                                |
| `postponedFromEventId`                         | String?           | FK auto                    | Report : les billets restent valides (§29)                     |
| `refundPolicy`                                 | `RefundPolicy`    |                            | `UNTIL_DAYS_BEFORE`, `NONE`, `CASE_BY_CASE`                    |
| `refundDeadlineDays`                           | Int?              |                            | Si `UNTIL_DAYS_BEFORE`                                         |
| `minimumAge`                                   | Int?              |                            |                                                                |
| `requiresAttendeeName`                         | Boolean           | défaut `false`             | Ambiguïté A6                                                   |
| `maxTicketsPerOrder`                           | Int?              |                            |                                                                |
| `accessInstructions`                           | String?           |                            | « Fouille à l'entrée · boissons extérieures interdites »       |
| `commissionPolicyId`                           | String?           | FK                         | Dérogation par événement                                       |
| `draftStep`                                    | Int?              |                            | Étape courante de l'assistant (1–8), reprise exacte            |
| `draftData`                                    | Json?             |                            | Brouillon auto-sauvegardé, purgé à la publication              |
| `salesCount`, `revenueTotal`, `checkedInCount` | Int               |                            | Compteurs dénormalisés, maintenus transactionnellement         |
| `createdById`                                  | String            | FK → `User`                |                                                                |

**Contrainte** : `endsAt > startsAt`, `doorsOpenAt <= startsAt`.

**Note sur `draftData`** : c'est l'unique usage de `Json` sur une donnée métier, justifié par le fait
qu'un brouillon incomplet ne peut pas satisfaire les contraintes du schéma. À la publication, les
données sont écrites dans les colonnes typées et `draftData` est vidé.

## 5.5 `EventImage`

Galerie (§17 étape 4) : `eventId`, `url`, `alt`, `position`, `type` (`COVER`, `POSTER`, `GALLERY`).

## 5.6 `TicketType`

| Champ                        | Type               | Contrainte      | Note                                                  |
| ---------------------------- | ------------------ | --------------- | ----------------------------------------------------- |
| `id`                         | String             | PK              |                                                       |
| `eventId`                    | String             | FK, cascade     |                                                       |
| `name`                       | String             |                 | « Pass 2 jours · VIP »                                |
| `description`                | String?            |                 | Avantages inclus                                      |
| `price`                      | Int                | ≥ 0             | 0 = billet gratuit                                    |
| `currency`                   | String             | défaut `XOF`    |                                                       |
| `quantityTotal`              | Int                | > 0             |                                                       |
| `quantitySold`               | Int                | défaut 0        | **Maintenu transactionnellement**                     |
| `quantityReserved`           | Int                | défaut 0        | Réservations temporaires en cours                     |
| `minPerOrder`                | Int                | défaut 1        |                                                       |
| `maxPerOrder`                | Int?               |                 | « Nombre maximum par participant »                    |
| `salesStartAt`, `salesEndAt` | DateTime?          |                 |                                                       |
| `visibility`                 | `TicketVisibility` | défaut `PUBLIC` | `PUBLIC`, `HIDDEN` (billet partenaire, presse — §8.5) |
| `accessCode`                 | String?            |                 | Accès à un billet caché par lien ou code              |
| `status`                     | `TicketTypeStatus` |                 | `DRAFT`, `ON_SALE`, `PAUSED`, `SOLD_OUT`, `CLOSED`    |
| `position`                   | Int                |                 | Ordre d'affichage                                     |

**Disponibilité** = `quantityTotal − quantitySold − quantityReserved`.

**Contrainte** : `quantitySold + quantityReserved <= quantityTotal` — vérifiée par contrainte CHECK
en base, pas seulement en applicatif. C'est la protection ultime contre la sur-vente.

---

# 6. COMMANDES ET PAIEMENTS

## 6.1 `Order`

| Champ                                | Type          | Contrainte     | Note                                                  |
| ------------------------------------ | ------------- | -------------- | ----------------------------------------------------- |
| `id`                                 | String        | PK             |                                                       |
| `reference`                          | String        | **UNIQUE**     | `NK-8F4C21` — base 32 sans caractères ambigus         |
| `userId`                             | String?       | FK             | Null tant que le compte n'est pas créé (achat invité) |
| `buyerPhone`                         | String        |                | E.164, toujours renseigné                             |
| `buyerName`                          | String        |                |                                                       |
| `buyerEmail`                         | String?       |                | Facultatif                                            |
| `eventId`                            | String        | FK             | Une commande porte sur **un seul** événement          |
| `status`                             | `OrderStatus` |                | Voir §11.2                                            |
| `subtotalAmount`                     | Int           |                | Somme des billets, avant remise                       |
| `discountAmount`                     | Int           | défaut 0       | Code promo                                            |
| `platformFeeAmount`                  | Int           |                | Commission plateforme                                 |
| `providerFeeAmount`                  | Int           | défaut 0       | Frais opérateur                                       |
| `buyerFeeAmount`                     | Int           | défaut 0       | Part des frais **portée par le participant**          |
| `organizerFeeAmount`                 | Int           | défaut 0       | Part des frais **portée par l'organisateur**          |
| `totalAmount`                        | Int           |                | **Ce que le participant paie**                        |
| `organizerNetAmount`                 | Int           |                | Ce qui revient à l'organisateur                       |
| `currency`                           | String        | défaut `XOF`   |                                                       |
| `promoCodeId`                        | String?       | FK             |                                                       |
| `termsAcceptedAt`                    | DateTime      |                | Preuve horodatée                                      |
| `whatsappOptIn`                      | Boolean       | défaut `false` | Case du récapitulatif                                 |
| `expiresAt`                          | DateTime?     |                | Réservation de stock : 30 min                         |
| `paidAt`, `cancelledAt`              | DateTime?     |                |                                                       |
| `ipAddress`, `userAgent`, `referrer` | String?       |                | Attribution et anti-fraude                            |

**`buyerFeeAmount` et `organizerFeeAmount` répondent à l'ambiguïté A1** : ils permettent d'appliquer
le modèle A (100 % organisateur), le modèle B (100 % participant) ou le modèle C (partagé) sans
migration. L'invariant à respecter :

```
totalAmount        = subtotalAmount − discountAmount + buyerFeeAmount
organizerNetAmount = subtotalAmount − discountAmount − organizerFeeAmount − providerFeeAmount
platformFeeAmount  = buyerFeeAmount + organizerFeeAmount
```

## 6.2 `OrderItem`

| Champ                     | Type   | Note                                                                                                |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `orderId`, `ticketTypeId` | String | FK                                                                                                  |
| `quantity`                | Int    |                                                                                                     |
| `unitPrice`               | Int    | **Prix figé à la commande** — un changement de tarif ultérieur ne modifie pas les commandes passées |
| `unitFee`                 | Int    | Frais unitaires figés                                                                               |
| `subtotal`                | Int    |                                                                                                     |
| `attendees`               | Json?  | `[{ name, phone? }]` si `requiresAttendeeName`                                                      |

## 6.3 `StockReservation`

Rend explicite la réservation temporaire de stock, plutôt que de la déduire de l'état des commandes.

| Champ          | Type      | Note                                             |
| -------------- | --------- | ------------------------------------------------ |
| `orderId`      | String    | FK, cascade                                      |
| `ticketTypeId` | String    | FK                                               |
| `quantity`     | Int       |                                                  |
| `expiresAt`    | DateTime  | Indexé — un job libère les réservations expirées |
| `releasedAt`   | DateTime? |                                                  |

**Cycle** : créée à la création de la commande (incrémente `quantityReserved`), convertie à la
confirmation du paiement (décrémente `quantityReserved`, incrémente `quantitySold`), ou libérée à
l'expiration.

## 6.4 `Payment`

| Champ                                                 | Type            | Contrainte                 | Note                                                                                                 |
| ----------------------------------------------------- | --------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                                                  | String          | PK                         |                                                                                                      |
| `orderId`                                             | String          | FK                         | Un paiement par tentative aboutie ; plusieurs paiements possibles par commande (reprise après échec) |
| `providerCode`                                        | String          |                            | `mock`, `mtn_momo`, `moov_money`, `celtiis`, `card`                                                  |
| `providerReference`                                   | String?         | UNIQUE avec `providerCode` | Référence de l'opérateur                                                                             |
| `idempotencyKey`                                      | String          | **UNIQUE**                 | Empêche la double initiation                                                                         |
| `amount`                                              | Int             |                            |                                                                                                      |
| `currency`                                            | String          |                            |                                                                                                      |
| `status`                                              | `PaymentStatus` |                            | Voir §11.3                                                                                           |
| `payerPhone`                                          | String?         |                            | Numéro Mobile Money utilisé                                                                          |
| `failureCode`, `failureReason`                        | String?         |                            | « Solde insuffisant », « délai opérateur dépassé »                                                   |
| `initiatedAt`, `confirmedAt`, `failedAt`, `expiresAt` | DateTime?       |                            |                                                                                                      |
| `providerPayload`                                     | Json?           |                            | Réponse brute, pour audit                                                                            |
| `webhookReceivedAt`                                   | DateTime?       |                            | **Le seul horodatage faisant foi**                                                                   |

**Contrainte critique** : `@@unique([orderId])` **là où `status = SUCCEEDED`** — une commande ne peut
avoir qu'un seul paiement réussi. Implémenté par index unique partiel PostgreSQL.

## 6.5 `PaymentAttempt`

Journal de chaque appel au provider, y compris les interrogations de statut. Permet de diagnostiquer
un webhook manquant.

| Champ                               | Type                                           |
| ----------------------------------- | ---------------------------------------------- |
| `paymentId`                         | FK                                             |
| `kind`                              | `INITIATE`, `STATUS_POLL`, `WEBHOOK`, `REFUND` |
| `requestPayload`, `responsePayload` | Json                                           |
| `httpStatus`, `durationMs`          | Int                                            |
| `error`                             | String?                                        |

## 6.6 `WebhookEvent`

| Champ          | Type            | Contrainte | Note                                         |
| -------------- | --------------- | ---------- | -------------------------------------------- |
| `providerCode` | String          |            |                                              |
| `externalId`   | String          |            | Identifiant fourni par l'opérateur           |
| `signature`    | String          |            | Vérifiée avant traitement                    |
| `rawBody`      | String          |            | Corps brut conservé, pour rejeu et audit     |
| `status`       | `WebhookStatus` |            | `RECEIVED`, `PROCESSED`, `IGNORED`, `FAILED` |
| `processedAt`  | DateTime?       |            |                                              |
| `error`        | String?         |            |                                              |

**Contrainte** : `@@unique([providerCode, externalId])` — **c'est la garantie d'idempotence**. Sans
cet index, un webhook rejoué émettrait des billets en double.

## 6.7 `Refund`

| Champ                           | Type           | Note                                                                           |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `paymentId`                     | String         | FK                                                                             |
| `orderId`                       | String         | FK, dénormalisé                                                                |
| `amount`                        | Int            | Total ou partiel                                                               |
| `reason`                        | `RefundReason` | `EVENT_CANCELLED`, `CUSTOMER_REQUEST`, `DUPLICATE_PAYMENT`, `DISPUTE`, `ADMIN` |
| `status`                        | `RefundStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`                                 |
| `feesRefunded`                  | Boolean        | défaut `false` — les frais de service ne sont pas remboursés par défaut        |
| `requestedById`, `approvedById` | String?        | FK → `User`                                                                    |
| `providerReference`             | String?        |                                                                                |
| `note`                          | String?        | Motif obligatoire pour un refus                                                |

---

# 7. BILLETS ET CONTRÔLE D'ACCÈS

## 7.1 `Ticket`

| Champ                                 | Type               | Contrainte                       | Note                                                                     |
| ------------------------------------- | ------------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `id`                                  | String             | PK                               |                                                                          |
| `publicId`                            | String             | **UNIQUE**, 16 octets aléatoires | Encodé dans le QR                                                        |
| `accessToken`                         | String             | **UNIQUE**, 16 octets aléatoires | Route publique `/t/:token`, **distinct de `publicId`**                   |
| `reference`                           | String             | **UNIQUE**                       | `NK-8F4C21-01`                                                           |
| `orderId`                             | String             | FK                               |                                                                          |
| `orderItemId`                         | String             | FK                               |                                                                          |
| `ticketTypeId`                        | String             | FK                               |                                                                          |
| `eventId`                             | String             | FK, dénormalisé                  | Chemin critique du scan                                                  |
| `attendeeName`                        | String             |                                  | Toujours renseigné (nom de l'acheteur si `requiresAttendeeName = false`) |
| `attendeePhone`                       | String?            |                                  |                                                                          |
| `attendeeEmail`                       | String?            |                                  |                                                                          |
| `status`                              | `TicketStatus`     |                                  | `VALID`, `USED`, `CANCELLED`, `REFUNDED`, `EXPIRED`                      |
| `signature`                           | String             |                                  | Signature Ed25519 du jeton QR                                            |
| `signatureKeyId`                      | String             |                                  | Identifie la clé d'événement utilisée — permet la rotation               |
| `qrExpiresAt`                         | DateTime           |                                  | Fin de l'événement + 24 h                                                |
| `issuedAt`                            | DateTime           |                                  |                                                                          |
| `usedAt`                              | DateTime?          |                                  | Renseigné au premier check-in effectif                                   |
| `cancelledAt`                         | DateTime?          |                                  |                                                                          |
| `transferredAt`, `transferredToPhone` | DateTime?, String? |                                  | Réservé (ambiguïté A7), sans logique au MVP                              |
| `pdfKey`                              | String?            |                                  | Clé du PDF généré, mis en cache                                          |

**Règle d'or** : `Ticket` n'est créé qu'à la transition `Payment → SUCCEEDED`, à l'intérieur de la
même transaction que le passage de la commande à `PAID`. Un billet ne peut jamais exister sans
paiement confirmé (ou sans commande gratuite validée).

**Un billet = un QR.** Deux places donnent deux enregistrements `Ticket`, comme le prototype l'exige.

## 7.2 `CheckIn`

| Champ                          | Type     | Contrainte      | Note                                                |
| ------------------------------ | -------- | --------------- | --------------------------------------------------- |
| `id`                           | String   | PK              |                                                     |
| `ticketId`                     | String   | FK              |                                                     |
| `eventId`                      | String   | FK, dénormalisé |                                                     |
| `scannedByUserId`              | String   | FK → `User`     | Le contrôleur                                       |
| `gate`                         | String?  |                 | Porte                                               |
| `scannedAt`                    | DateTime |                 | **Horodatage client, corrigé de l'écart d'horloge** |
| `recordedAt`                   | DateTime |                 | Horodatage serveur à la synchronisation             |
| `wasOffline`                   | Boolean  | défaut `false`  |                                                     |
| `deviceId`                     | String?  |                 | Appareil du contrôleur                              |
| `nonce`                        | String   | **UNIQUE**      | Idempotence de la synchronisation par lots          |
| `isEffective`                  | Boolean  | défaut `true`   | `false` pour un scan perdant en cas de conflit      |
| `revokedAt`, `revokedByUserId` |          |                 | « Annuler cette entrée »                            |

**Contrainte capitale** : index unique partiel `@@unique([ticketId]) WHERE isEffective = true AND
revokedAt IS NULL` — **un seul check-in effectif par billet**, garanti au niveau base. C'est ce qui
rend impossible la double entrée, quel que soit le comportement des clients hors ligne.

## 7.3 `CheckInConflict`

| Champ                            | Type     | Note                                  |
| -------------------------------- | -------- | ------------------------------------- |
| `ticketId`                       | String   | FK                                    |
| `winningCheckInId`               | String   | FK — horodatage client le plus ancien |
| `losingCheckInId`                | String   | FK                                    |
| `detectedAt`                     | DateTime | À la synchronisation                  |
| `resolvedAt`, `resolvedByUserId` |          | Traité par l'organisateur             |
| `resolution`                     | String?  |                                       |

Remonté à l'organisateur dans l'onglet Check-in, **jamais au contrôleur pendant l'événement**.

## 7.4 `EventSigningKey`

| Champ           | Type      | Note                                                                     |
| --------------- | --------- | ------------------------------------------------------------------------ |
| `eventId`       | String    | FK, UNIQUE                                                               |
| `keyId`         | String    | Version de clé                                                           |
| `publicKey`     | String    | Distribuée aux contrôleurs avec le carnet                                |
| `privateKeyRef` | String    | **Référence vers le KMS ou le secret** — jamais la clé elle-même en base |
| `rotatedAt`     | DateTime? |                                                                          |

---

# 8. FINANCE

## 8.1 `LedgerEntry` — le grand livre

Écritures **immuables**. Aucune mise à jour, aucune suppression : une correction est une écriture
inverse. C'est ce qui rend un solde explicable et auditable.

| Champ                                                                 | Type              | Note                                          |
| --------------------------------------------------------------------- | ----------------- | --------------------------------------------- |
| `id`                                                                  | String            | PK                                            |
| `organizationId`                                                      | String            | FK, indexé                                    |
| `type`                                                                | `LedgerEntryType` | Voir ci-dessous                               |
| `amount`                                                              | Int               | **Signé** : positif = crédit, négatif = débit |
| `currency`                                                            | String            |                                               |
| `balanceState`                                                        | `BalanceState`    | `PENDING` (bloqué) ou `AVAILABLE`             |
| `availableAt`                                                         | DateTime?         | Date de déblocage — affichée à l'organisateur |
| `eventId`, `orderId`, `paymentId`, `ticketId`, `payoutId`, `refundId` | String?           | FK, selon le type                             |
| `description`                                                         | String            | Libellé lisible                               |
| `metadata`                                                            | Json?             |                                               |
| `createdAt`                                                           | DateTime          |                                               |

**Types d'écriture** :

| Type                  | Signe | Origine                                                    |
| --------------------- | ----- | ---------------------------------------------------------- |
| `SALE`                | +     | Vente d'un billet, montant brut                            |
| `PLATFORM_FEE`        | −     | Commission Nexa-Kabi                                       |
| `PROVIDER_FEE`        | −     | Frais opérateur Mobile Money                               |
| `HOLD`                | −     | Blocage jusqu'à la date de déblocage                       |
| `RELEASE`             | +     | Déblocage (J+48 h, ou 60 % immédiat au palier 2)           |
| `REFUND`              | −     | Remboursement à un participant                             |
| `REFUND_FEE_REVERSAL` | +     | Restitution de commission sur remboursement, si applicable |
| `PAYOUT`              | −     | Retrait exécuté                                            |
| `PAYOUT_FEE`          | −     | Frais de retrait (1 %, plafond 2 000 FCFA)                 |
| `PAYOUT_REVERSAL`     | +     | Retrait échoué : l'argent revient au solde sous 24 h       |
| `FREEZE` / `UNFREEZE` | − / + | Gel administratif                                          |
| `ADJUSTMENT`          | ±     | Correction manuelle, motif obligatoire                     |

**Calcul du solde** :

```sql
-- Solde disponible
SELECT SUM(amount) FROM ledger_entry
WHERE organization_id = ? AND balance_state = 'AVAILABLE';

-- Solde en attente de déblocage
SELECT SUM(amount) FROM ledger_entry
WHERE organization_id = ? AND balance_state = 'PENDING';
```

Une **vue matérialisée** `OrganizationBalance` rafraîchie à chaque écriture évite de recalculer sur
des dizaines de milliers de lignes.

## 8.2 `CommissionPolicy`

Répond à l'ambiguïté A1 en rendant le modèle configurable.

| Champ                              | Type          | Note                                                                               |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `id`                               | String        | PK                                                                                 |
| `name`                             | String        | « Grille standard 2026 »                                                           |
| `scope`                            | `PolicyScope` | `PLATFORM`, `ORGANIZATION`, `EVENT`                                                |
| `percentageBps`                    | Int           | Points de base : 500 = 5 %                                                         |
| `fixedAmountPerTicket`             | Int           | 100 FCFA                                                                           |
| `minFeePerOrder`, `maxFeePerOrder` | Int?          | Bornes                                                                             |
| `buyerSharePercent`                | Int           | 0 = tout à l'organisateur (A) · 100 = tout au participant (B) · entre les deux (C) |
| `appliesToFreeTickets`             | Boolean       | défaut `false`                                                                     |
| `payoutFeeBps`                     | Int           | 100 = 1 %                                                                          |
| `payoutFeeMax`                     | Int           | 2 000 FCFA                                                                         |
| `minPayoutAmount`                  | Int           | 5 000 FCFA                                                                         |
| `effectiveFrom`, `effectiveTo`     | DateTime      | **Versionnée** : un changement de grille ne modifie pas le passé                   |

## 8.3 `HoldPolicy`

Répond à l'ambiguïté A4.

| Champ                     | Type    | Note      |
| ------------------------- | ------- | --------- |
| `tier`                    | Int     | 0, 1, 2   |
| `requiresVerification`    | Boolean |           |
| `minCompletedEvents`      | Int     | 0, 0, 3   |
| `immediateReleasePercent` | Int     | 0, 0, 60  |
| `holdHoursAfterEvent`     | Int     | —, 48, 48 |

## 8.4 `Payout`

| Champ                                       | Type           | Note                                                        |
| ------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `id`                                        | String         | PK                                                          |
| `reference`                                 | String         | UNIQUE                                                      |
| `organizationId`                            | String         | FK                                                          |
| `payoutAccountId`                           | String         | FK                                                          |
| `requestedByUserId`                         | String         | FK                                                          |
| `grossAmount`                               | Int            | Montant demandé                                             |
| `feeAmount`                                 | Int            | Frais de retrait                                            |
| `netAmount`                                 | Int            | **Ce que l'organisateur reçoit** — affiché avant validation |
| `status`                                    | `PayoutStatus` | `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `CANCELLED`      |
| `providerReference`                         | String?        |                                                             |
| `failureReason`                             | String?        | « Le numéro n'est pas un compte marchand »                  |
| `requestedAt`, `processedAt`, `completedAt` | DateTime?      |                                                             |
| `processedByUserId`                         | String?        | FK — administrateur ayant exécuté                           |

**Règle** : un retrait `FAILED` déclenche automatiquement une écriture `PAYOUT_REVERSAL` sous 24 h,
plus une notification expliquant la cause et proposant de corriger le compte.

---

# 9. PROMOTIONS _(post-MVP, modélisé dès maintenant)_

## 9.1 `PromoCode`

| Champ                   | Type        | Note                                                           |
| ----------------------- | ----------- | -------------------------------------------------------------- |
| `code`                  | String      | UNIQUE par organisation — `YELE25`                             |
| `organizationId`        | String      | FK                                                             |
| `eventId`               | String?     | FK — null = applicable à tous les événements de l'organisation |
| `type`                  | `PromoType` | `PERCENTAGE`, `FIXED_AMOUNT`, `FREE`                           |
| `value`                 | Int         | Points de base ou montant                                      |
| `maxUses`, `usedCount`  | Int         |                                                                |
| `maxUsesPerUser`        | Int?        |                                                                |
| `ticketTypeIds`         | String[]    | Catégories concernées                                          |
| `startsAt`, `expiresAt` | DateTime?   |                                                                |
| `isActive`              | Boolean     |                                                                |

## 9.2 `PromoCodeUsage`

`promoCodeId`, `orderId`, `userId`, `discountAmount`, `usedAt`.
Contrainte `@@unique([promoCodeId, orderId])`.

## 9.3 `Invitation` (billet offert)

| Champ                                               | Type             | Note                                           |
| --------------------------------------------------- | ---------------- | ---------------------------------------------- |
| `eventId`, `ticketTypeId`                           | String           | FK                                             |
| `recipientName`, `recipientPhone`, `recipientEmail` | String           |                                                |
| `kind`                                              | `InvitationKind` | `ARTIST`, `PRESS`, `PARTNER`, `SPONSOR`, `VIP` |
| `token`                                             | String           | UNIQUE — lien de réclamation                   |
| `claimedAt`, `ticketId`                             |                  | Billet émis à la réclamation                   |
| `expiresAt`                                         | DateTime         |                                                |

---

# 10. COMMUNICATION ET MODÉRATION

## 10.1 `Notification`

| Champ                    | Type               | Note                                                                                                                            |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `userId`                 | String             | FK                                                                                                                              |
| `type`                   | `NotificationType` | **4 types seulement** (contrainte du prototype) : `PAYMENT_CONFIRMED`, `EVENT_REMINDER`, `EVENT_UPDATED`, `ORGANIZER_PUBLISHED` |
| `title`, `body`          | String             |                                                                                                                                 |
| `actionUrl`              | String?            | **Chaque notification est actionnable**                                                                                         |
| `entityType`, `entityId` | String?            | Cible                                                                                                                           |
| `readAt`                 | DateTime?          |                                                                                                                                 |

**Contrainte produit** : « Aucune notification promotionnelle non sollicitée. » Toute notification
marketing exige `User.marketingOptIn = true` et sort de cette table.

## 10.2 `NotificationPreference`

`userId`, `channel` (`EMAIL`, `SMS`, `WHATSAPP`, `PUSH`), `type`, `enabled`.

## 10.3 `MessageLog`

Trace de chaque message sortant, indispensable pour le suivi des coûts et de la délivrabilité (risque
R7).

| Champ                           | Type                                            |
| ------------------------------- | ----------------------------------------------- |
| `channel`                       | `SMS`, `WHATSAPP`, `EMAIL`, `PUSH`              |
| `provider`, `providerMessageId` | String                                          |
| `recipient`, `template`         | String                                          |
| `status`                        | `QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `READ` |
| `cost`                          | Int?                                            |
| `error`                         | String?                                         |

## 10.4 `Report` (signalement)

| Champ              | Type               | Note                                                          |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| `reporterUserId`   | String?            | FK — null si signalement anonyme                              |
| `targetType`       | `ReportTargetType` | `EVENT`, `ORGANIZATION`, `USER`                               |
| `targetId`         | String             |                                                               |
| `reason`           | `ReportReason`     | `FRAUD`, `FALSE_INFO`, `INAPPROPRIATE`, `NO_SHOW`, `OTHER`    |
| `description`      | String             |                                                               |
| `status`           | `ReportStatus`     | `NEW`, `IN_PROGRESS`, `RESOLVED`, `DISMISSED`                 |
| `assignedToUserId` | String?            | FK                                                            |
| `resolution`       | String?            | **Motif obligatoire si `DISMISSED`**                          |
| `actionsTaken`     | Json?              | `["FREEZE_PAYOUT", "CONTACT_ORGANIZER"]`                      |
| `slaDueAt`         | DateTime           | **4 h ouvrées** pour la prise en charge (valeur du prototype) |
| `resolvedAt`       | DateTime?          |                                                               |

`ReportNote` : notes horodatées et attribuées liées à un signalement.

## 10.5 `AuditLog`

| Champ                    | Type                      | Note                                                                                 |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------ |
| `actorUserId`            | String?                   | FK                                                                                   |
| `actorType`              | `USER`, `ADMIN`, `SYSTEM` |
| `organizationId`         | String?                   | FK                                                                                   |
| `action`                 | String                    | `event.published`, `payout.requested`, `member.invited`, `ticket_type.quota_changed` |
| `entityType`, `entityId` | String                    |                                                                                      |
| `changes`                | Json?                     | Avant / après                                                                        |
| `ipAddress`, `userAgent` | String?                   |                                                                                      |
| `createdAt`              | DateTime                  | Indexé                                                                               |

**Écrit systématiquement pour** : toute action financière, toute modification de rôle, toute
publication ou annulation d'événement, toute modification de quota, tout accès à une pièce
d'identité, toute action d'administration.

---

# 11. MACHINES À ÉTATS

## 11.1 `EventStatus`

```
DRAFT ──────► PENDING_REVIEW ──────► PUBLISHED ──────► COMPLETED ──► ARCHIVED
  │                  │                    │
  │                  └──► REJECTED        ├──► SOLD_OUT ──► (retour PUBLISHED possible)
  │                                       │
  └───────────────────────────────────────┴──► CANCELLED
                                          └──► POSTPONED ──► PUBLISHED (nouvelles dates)
```

| Transition                   | Conditions                                                                                       | Effets                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `DRAFT → PENDING_REVIEW`     | Toutes les étapes obligatoires validées, organisation non vérifiée **ou** premier événement (A5) | Notification à l'administration, SLA 2 h                                     |
| `DRAFT → PUBLISHED`          | Organisation vérifiée avec au moins un événement publié                                          | Génération du kit de promotion, `publishedAt`                                |
| `PENDING_REVIEW → PUBLISHED` | Validation administrateur                                                                        | idem                                                                         |
| `PENDING_REVIEW → REJECTED`  | Refus, **motif obligatoire**                                                                     | Notification à l'organisateur                                                |
| `PENDING_REVIEW → DRAFT`     | Retrait par l'organisateur avant la relecture (dépublication)                                    | Les billets repassent en `DRAFT` ; à resoumettre                             |
| `PUBLISHED → DRAFT`          | Dépublication par l'organisateur, **uniquement si aucun billet vendu** — au-delà, seule l'annulation retire l'événement | Retiré de la découverte, billets → `DRAFT`, `publishedAt` effacé, audit `event.unpublished` |
| `PUBLISHED → SOLD_OUT`       | Automatique quand toutes les catégories sont épuisées                                            | Réversible                                                                   |
| `PUBLISHED → CANCELLED`      | Organisateur ou administrateur, **motif obligatoire**                                            | Remboursement en lot, tous les billets → `CANCELLED`, notification immédiate |
| `PUBLISHED → POSTPONED`      | Report                                                                                           | Les billets restent `VALID`, `postponedFromEventId` renseigné, notification  |
| `PUBLISHED → COMPLETED`      | Automatique à `endsAt`                                                                           | Démarre le compteur de déblocage du solde, incrémente `completedEventsCount` |
| `COMPLETED → ARCHIVED`       | Automatique à `endsAt + 90 jours`                                                                | Purge du carnet de scan, expiration des jetons QR                            |

La **suppression** n'est pas une transition : c'est un `deletedAt` (suppression logique, audit `event.deleted`), possible pour tout événement qui n'a rien vendu — et pour un événement annulé ou terminé. Un événement en ligne qui a vendu s'annule d'abord.

## 11.2 `OrderStatus`

```
DRAFT ──► AWAITING_PAYMENT ──► PAID ──► COMPLETED
   │             │                │
   │             ├──► EXPIRED     ├──► REFUNDED
   │             │                └──► PARTIALLY_REFUNDED
   └─────────────┴──► CANCELLED
```

`DRAFT` correspond au panier en cours de constitution (étape 1). Le passage à `AWAITING_PAYMENT`
crée la `StockReservation` et fixe `expiresAt`.

## 11.3 `PaymentStatus`

Voir `TECHNICAL_ARCHITECTURE.md` §6.3. Rappel des transitions interdites :

- `SUCCEEDED → FAILED` : un webhook d'échec arrivant après un succès est **journalisé et ignoré**.
- Toute transition depuis un état terminal, sauf `SUCCEEDED → REFUNDED`.

## 11.4 `TicketStatus`

```
VALID ──► USED
  │
  ├──► CANCELLED   (événement annulé, ou commande annulée)
  ├──► REFUNDED    (remboursement effectif)
  └──► EXPIRED     (événement terminé sans check-in)
```

`USED` est un état terminal : un billet utilisé ne redevient jamais `VALID`, sauf annulation
explicite du check-in par un responsable (qui supprime l'effectivité du `CheckIn` et repasse le
billet à `VALID`).

## 11.5 `PayoutStatus`

```
PENDING ──► PROCESSING ──► PAID
   │             │
   │             └──► FAILED ──► (PAYOUT_REVERSAL sous 24 h, retour au solde)
   └──► CANCELLED
```

---

# 12. INDEX ET CONTRAINTES CRITIQUES

## 12.1 Contraintes garantissant l'intégrité métier

| Contrainte                                                                             | Objet                 | Sans elle                                              |
| -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| `CHECK (quantity_sold + quantity_reserved <= quantity_total)` sur `TicketType`         | Sur-vente             | Vente de billets inexistants sous forte concurrence    |
| Index unique partiel sur `CheckIn(ticketId) WHERE isEffective AND revokedAt IS NULL`   | Double entrée         | Un billet photographié entre deux fois                 |
| `UNIQUE(providerCode, externalId)` sur `WebhookEvent`                                  | Idempotence           | Un webhook rejoué émet des billets en double           |
| Index unique partiel sur `Payment(orderId) WHERE status = 'SUCCEEDED'`                 | Double paiement       | Le client paie deux fois la même commande              |
| `UNIQUE(idempotencyKey)` sur `Payment`                                                 | Double initiation     | Deux demandes MoMo pour un seul panier                 |
| `UNIQUE(organizationId, userId)` sur `OrganizationMember`                              | Rôles contradictoires | Une personne avec deux rôles dans la même organisation |
| `UNIQUE(nonce)` sur `CheckIn`                                                          | Synchronisation       | Un lot rejoué duplique les entrées                     |
| `UNIQUE` sur `Ticket.publicId`, `Ticket.accessToken`, `Ticket.reference`               | Collisions            | Accès croisé entre billets                             |
| Immuabilité de `LedgerEntry` (révoquer UPDATE/DELETE au niveau du rôle SQL applicatif) | Falsification         | Un solde non explicable                                |

## 12.2 Index de performance

| Table              | Index                                                        | Requête servie                         |
| ------------------ | ------------------------------------------------------------ | -------------------------------------- |
| `Event`            | `(status, visibility, startsAt)`                             | Catalogue public                       |
| `Event`            | `(cityId, categoryId, startsAt)`                             | Filtres de découverte                  |
| `Event`            | `(organizationId, status)`                                   | Liste organisateur                     |
| `Event`            | GIN sur `to_tsvector('french', title                         |                                        | description)` | Recherche plein texte |
| `Ticket`           | `(eventId, status)`                                          | Génération du carnet de scan           |
| `Ticket`           | `(publicId)`                                                 | Vérification au scan — chemin critique |
| `Order`            | `(userId, createdAt DESC)`                                   | Mes commandes                          |
| `Order`            | `(eventId, status)`                                          | Participants de l'événement            |
| `Payment`          | `(status, initiatedAt)`                                      | Job de réconciliation                  |
| `StockReservation` | `(expiresAt)` où non libérée                                 | Job de libération                      |
| `LedgerEntry`      | `(organizationId, balanceState, availableAt)`                | Calcul de solde                        |
| `AuditLog`         | `(organizationId, createdAt DESC)`, `(entityType, entityId)` | Journal d'activité                     |
| `Notification`     | `(userId, readAt, createdAt DESC)`                           | Centre d'alertes                       |

## 12.3 Données dénormalisées à maintenir

Toutes mises à jour **dans la même transaction** que l'opération source :

| Champ                                                | Source                               | Raison                                                     |
| ---------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `TicketType.quantitySold` / `quantityReserved`       | Commandes et réservations            | Le calcul à la volée est incompatible avec le verrouillage |
| `Event.salesCount`, `revenueTotal`, `checkedInCount` | Billets et check-ins                 | Tableau de bord organisateur en temps réel                 |
| `Organization.completedEventsCount`                  | Événements `COMPLETED`               | Détermine le palier de déblocage                           |
| `Ticket.eventId`                                     | Via `orderItem → ticketType → event` | Évite deux jointures sur le chemin critique du scan        |
| `Order.eventId`                                      | Via les items                        | Une commande ne porte que sur un événement                 |

---

# 13. POINTS OUVERTS

| #   | Question                                                     | Impact        | Proposition                                                                                                                                                                                                |
| --- | ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Une commande peut-elle porter sur **plusieurs événements** ? | Structurant   | **Non.** `Order.eventId` non nul. Le prototype ne montre jamais de panier multi-événements, et cela simplifie radicalement la réservation de stock, les frais, le remboursement et le grand livre          |
| D2  | Faut-il une entité `Cart` distincte de `Order` ?             | Moyen         | **Non.** `Order` en statut `DRAFT` fait office de panier. Une entité supplémentaire dupliquerait toute la logique de tarification                                                                          |
| D3  | Historiser les prix des `TicketType` ?                       | Faible        | Non nécessaire : `OrderItem.unitPrice` fige le prix. Un historique complet relève de l'audit                                                                                                               |
| D4  | Multi-devise dès le MVP ?                                    | Faible        | Colonnes `currency` présentes partout, mais **une seule devise active** (XOF). Le multi-devise réel exige des taux de change et une comptabilité par devise — hors périmètre                               |
| D5  | Partitionner `LedgerEntry` ?                                 | Faible au MVP | Prévoir un partitionnement par trimestre au-delà de quelques millions de lignes                                                                                                                            |
| D6  | Où stocker le carnet de scan côté serveur ?                  | Moyen         | Pas de table dédiée : le carnet est une **projection** de `Ticket` filtrée par événement, servie avec un `ETag` pour permettre des deltas                                                                  |
| D7  | Suppression de compte et RGPD                                | Moyen         | Anonymisation plutôt que suppression physique : `User.deletedAt`, remplacement de `phone`/`email`/`fullName` par des valeurs anonymes, conservation des commandes et du grand livre (obligation comptable) |
| D8  | Rétention des logs de webhooks                               | Faible        | 12 mois glissants, puis archivage froid                                                                                                                                                                    |
