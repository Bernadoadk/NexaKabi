-- Pays, moyens de paiement et prestataires.
--
-- ── Ce que cette migration change ───────────────────────────────────────────
-- Jusqu'ici, le « prestataire » d'un paiement ÉTAIT le moyen de paiement :
-- `payment.providerCode` valait `mtn_momo`, et un opérateur n'existait que
-- parce qu'un fournisseur portait son nom. Le pays n'existait nulle part, et
-- la devise était une constante.
--
-- Désormais trois objets distincts :
--   · `country`                — pays, devise, indicatif ; activable un par un.
--   · `country_payment_method` — dans CE pays, CE moyen (`mtn_momo`, `wave`,
--                                `card`) est traité par CE prestataire
--                                (`bictorys`, `mock`), en collecte et/ou en
--                                versement. C'est la table de configuration.
--   · `commission_policy`      — la commission, par portée (plateforme, pays,
--                                organisation), jamais par moyen de paiement.
--
-- `payment.providerCode` désigne maintenant le PRESTATAIRE ; le moyen choisi
-- par le participant vit dans `payment.methodCode`. Le compte de réception
-- d'un organisateur porte son pays et son moyen (`methodCode`), à la place de
-- l'ancien libellé libre `provider` (« MTN », « MOOV »).

-- ── Pays ────────────────────────────────────────────────────────────────────
CREATE TABLE "country" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "dialCode" TEXT NOT NULL,
    "flag" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "country_isActive_position_idx" ON "country"("isActive", "position");

-- Un seul pays par défaut : index unique partiel, qu'aucun écran ne peut
-- contourner. Le pays par défaut est nécessairement actif (contrainte).
CREATE UNIQUE INDEX "country_single_default_idx" ON "country"("isDefault") WHERE "isDefault" = true;
ALTER TABLE "country" ADD CONSTRAINT "country_default_is_active"
  CHECK ("isDefault" = false OR "isActive" = true);
ALTER TABLE "country" ADD CONSTRAINT "country_code_is_iso"
  CHECK ("code" ~ '^[A-Z]{2}$');

-- Les pays connus sont amorcés ICI et non par le seed : les lignes existantes
-- (villes, organisations, événements) pointent déjà sur `BJ` par défaut, et
-- la clé étrangère ajoutée plus bas exige que ce pays existe. Seul le Bénin
-- est actif ; les autres attendent qu'un administrateur les ouvre.
INSERT INTO "country" ("code", "name", "currency", "dialCode", "flag", "isActive", "isDefault", "position", "updatedAt") VALUES
  ('BJ', 'Bénin',          'XOF', '229', '🇧🇯', true,  true,  0,  CURRENT_TIMESTAMP),
  ('CI', 'Côte d’Ivoire',  'XOF', '225', '🇨🇮', false, false, 10, CURRENT_TIMESTAMP),
  ('SN', 'Sénégal',        'XOF', '221', '🇸🇳', false, false, 20, CURRENT_TIMESTAMP),
  ('TG', 'Togo',           'XOF', '228', '🇹🇬', false, false, 30, CURRENT_TIMESTAMP),
  ('BF', 'Burkina Faso',   'XOF', '226', '🇧🇫', false, false, 40, CURRENT_TIMESTAMP),
  ('ML', 'Mali',           'XOF', '223', '🇲🇱', false, false, 50, CURRENT_TIMESTAMP),
  ('NE', 'Niger',          'XOF', '227', '🇳🇪', false, false, 60, CURRENT_TIMESTAMP),
  ('GN', 'Guinée',         'GNF', '224', '🇬🇳', false, false, 70, CURRENT_TIMESTAMP),
  ('CM', 'Cameroun',       'XAF', '237', '🇨🇲', false, false, 80, CURRENT_TIMESTAMP),
  ('GH', 'Ghana',          'GHS', '233', '🇬🇭', false, false, 90, CURRENT_TIMESTAMP),
  ('NG', 'Nigeria',        'NGN', '234', '🇳🇬', false, false, 100, CURRENT_TIMESTAMP);

-- ── Moyens de paiement par pays ─────────────────────────────────────────────
CREATE TYPE "PaymentMethodKind" AS ENUM ('MOBILE_MONEY', 'CARD', 'BANK_TRANSFER', 'CASH', 'DEMO');

CREATE TABLE "country_payment_method" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "methodCode" TEXT NOT NULL,
    "kind" "PaymentMethodKind" NOT NULL,
    "providerCode" TEXT NOT NULL,
    "providerMethodCode" TEXT NOT NULL,
    "collectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "providerCollectionEnabled" BOOLEAN,
    "providerPayoutEnabled" BOOLEAN,
    "providerSyncedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "country_payment_method_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "country_payment_method_countryCode_collectionEnabled_positi_idx" ON "country_payment_method"("countryCode", "collectionEnabled", "position");
CREATE INDEX "country_payment_method_countryCode_payoutEnabled_position_idx" ON "country_payment_method"("countryCode", "payoutEnabled", "position");
CREATE UNIQUE INDEX "country_payment_method_countryCode_methodCode_providerCode_key" ON "country_payment_method"("countryCode", "methodCode", "providerCode");

ALTER TABLE "country_payment_method" ADD CONSTRAINT "country_payment_method_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- Le Bénin, tel que le prototype le décrit : trois opérateurs Mobile Money,
-- la carte, et le virement bancaire pour recevoir. Tout est confié à
-- Bictorys ; hors production, quand Bictorys n'est pas configuré, le
-- simulateur en prend la place à l'exécution — pas ici. Celtiis Cash n'a pas
-- d'identifiant documenté chez Bictorys : la ligne existe pour l'écran, mais
-- reste fermée tant que le prestataire ne l'annonce pas.
INSERT INTO "country_payment_method"
  ("id", "countryCode", "methodCode", "kind", "providerCode", "providerMethodCode", "collectionEnabled", "payoutEnabled", "position", "updatedAt") VALUES
  ('cpm_bj_mtn_momo',      'BJ', 'mtn_momo',      'MOBILE_MONEY',  'bictorys', 'mtn_money',     true,  true,  0,  CURRENT_TIMESTAMP),
  ('cpm_bj_moov_money',    'BJ', 'moov_money',    'MOBILE_MONEY',  'bictorys', 'moov',          true,  true,  10, CURRENT_TIMESTAMP),
  ('cpm_bj_celtiis_cash',  'BJ', 'celtiis_cash',  'MOBILE_MONEY',  'mock',     'celtiis_cash',  false, false, 20, CURRENT_TIMESTAMP),
  ('cpm_bj_card',          'BJ', 'card',          'CARD',          'bictorys', 'card',          true,  false, 30, CURRENT_TIMESTAMP),
  ('cpm_bj_bank_transfer', 'BJ', 'bank_transfer', 'BANK_TRANSFER', 'mock',     'bank_transfer', false, true,  40, CURRENT_TIMESTAMP);

-- ── Politique de commission ─────────────────────────────────────────────────
CREATE TABLE "commission_policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT,
    "organizationId" TEXT,
    "percentageBps" INTEGER NOT NULL,
    "fixedAmountPerTicket" INTEGER NOT NULL DEFAULT 0,
    "minFeePerOrder" INTEGER,
    "maxFeePerOrder" INTEGER,
    "buyerSharePercent" INTEGER NOT NULL DEFAULT 100,
    "appliesToFreeTickets" BOOLEAN NOT NULL DEFAULT false,
    "payoutFeeBps" INTEGER NOT NULL DEFAULT 100,
    "payoutFeeMax" INTEGER NOT NULL DEFAULT 2000,
    "minPayoutAmount" INTEGER NOT NULL DEFAULT 5000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_policy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_policy_countryCode_isActive_idx" ON "commission_policy"("countryCode", "isActive");
CREATE INDEX "commission_policy_organizationId_isActive_idx" ON "commission_policy"("organizationId", "isActive");

ALTER TABLE "commission_policy" ADD CONSTRAINT "commission_policy_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commission_policy" ADD CONSTRAINT "commission_policy_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une politique est de plateforme, de pays OU d'organisation : jamais les deux.
ALTER TABLE "commission_policy" ADD CONSTRAINT "commission_policy_single_scope"
  CHECK ("countryCode" IS NULL OR "organizationId" IS NULL);
ALTER TABLE "commission_policy" ADD CONSTRAINT "commission_policy_bps_range"
  CHECK ("percentageBps" BETWEEN 0 AND 10000 AND "payoutFeeBps" BETWEEN 0 AND 10000);
ALTER TABLE "commission_policy" ADD CONSTRAINT "commission_policy_buyer_share_range"
  CHECK ("buyerSharePercent" BETWEEN 0 AND 100);

-- La politique par défaut — décision A1 : 5 %, plancher de 100 par commande,
-- frais ajoutés au participant. Ce sont les valeurs que le code appliquait
-- déjà en constante ; elles deviennent une ligne que l'on peut faire évoluer.
INSERT INTO "commission_policy"
  ("id", "name", "percentageBps", "fixedAmountPerTicket", "minFeePerOrder", "buyerSharePercent", "appliesToFreeTickets", "payoutFeeBps", "payoutFeeMax", "minPayoutAmount", "updatedAt")
VALUES
  ('policy_platform_default', 'Défaut plateforme', 500, 0, 100, 100, false, 100, 2000, 5000, CURRENT_TIMESTAMP);

-- ── Pays sur les entités existantes ─────────────────────────────────────────
ALTER TABLE "city" ADD CONSTRAINT "city_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'BJ';
ALTER TABLE "organization" ADD CONSTRAINT "organization_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'BJ',
                    ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'XOF';
-- Un événement suit sa ville quand il en a une.
UPDATE "event" e SET "countryCode" = c."countryCode"
  FROM "city" c WHERE e."cityId" = c."id";
ALTER TABLE "event" ADD CONSTRAINT "event_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'BJ',
                    ADD COLUMN "commissionPolicyId" TEXT;
UPDATE "order" o SET "countryCode" = e."countryCode"
  FROM "event" e WHERE o."eventId" = e."id";
ALTER TABLE "order" ADD CONSTRAINT "order_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order" ADD CONSTRAINT "order_commissionPolicyId_fkey"
  FOREIGN KEY ("commissionPolicyId") REFERENCES "commission_policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Paiements : le prestataire n'est plus le moyen ──────────────────────────
ALTER TABLE "payment" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'BJ',
                      ADD COLUMN "methodCode" TEXT NOT NULL DEFAULT 'mock',
                      ADD COLUMN "providerFeeAmount" INTEGER,
                      ADD COLUMN "redirectUrl" TEXT;

-- Les paiements existants ont tous été traités par le simulateur — aucune
-- clé de prestataire réel n'a jamais été configurée — sous l'identité d'un
-- opérateur. L'opérateur devient le moyen, le simulateur devient le
-- prestataire. L'index unique (providerCode, providerReference) tient : les
-- références du simulateur sont uniques par construction.
UPDATE "payment" SET "methodCode" = "providerCode";
UPDATE "payment" SET "providerCode" = 'mock' WHERE "providerCode" <> 'mock';
UPDATE "payment" p SET "countryCode" = o."countryCode"
  FROM "order" o WHERE p."orderId" = o."id";

-- Même déplacement pour les webhooks déjà reçus, qui portent le même code.
UPDATE "webhook_event" SET "providerCode" = 'mock' WHERE "providerCode" <> 'mock';

-- ── Comptes de réception ────────────────────────────────────────────────────
ALTER TABLE "payout_account" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'BJ',
                             ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'XOF',
                             ADD COLUMN "methodCode" TEXT NOT NULL DEFAULT 'bank_transfer';

-- L'ancien libellé libre devient un code du catalogue.
UPDATE "payout_account" SET "methodCode" = CASE
  WHEN "type" = 'BANK' THEN 'bank_transfer'
  WHEN upper(coalesce("provider", '')) LIKE 'MTN%' THEN 'mtn_momo'
  WHEN upper(coalesce("provider", '')) LIKE 'MOOV%' THEN 'moov_money'
  WHEN upper(coalesce("provider", '')) LIKE 'CELTIIS%' THEN 'celtiis_cash'
  ELSE 'mtn_momo'
END;
UPDATE "payout_account" pa SET "countryCode" = o."countryCode"
  FROM "organization" o WHERE pa."organizationId" = o."id";

ALTER TABLE "payout_account" DROP COLUMN "provider";
ALTER TABLE "payout_account" ADD CONSTRAINT "payout_account_countryCode_fkey"
  FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Retraits : qui a versé ──────────────────────────────────────────────────
ALTER TABLE "payout" ADD COLUMN "providerCode" TEXT;
-- Un retrait exécuté automatiquement l'a été par le simulateur, seul
-- prestataire jamais branché ; un virement manuel n'a pas de prestataire.
UPDATE "payout" SET "providerCode" = 'mock'
  WHERE "providerReference" IS NOT NULL AND "providerReference" LIKE 'MOCK%';
