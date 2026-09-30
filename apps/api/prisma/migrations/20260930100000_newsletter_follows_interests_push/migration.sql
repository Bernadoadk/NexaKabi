-- Newsletter, suivi des organisateurs, goûts et notifications sur l'appareil.
--
-- ── Rétro-compatible, et c'est voulu ──────────────────────────────────────
-- La migration tourne pendant le build, alors que la version précédente sert
-- encore le trafic (docs/DEPLOYMENT.md §1). Rien n'est donc retiré ni renommé :
-- des tables et des colonnes s'ajoutent, avec des valeurs par défaut que
-- l'ancien code n'a pas besoin de connaître. `user.marketingOptIn` n'est plus
-- lu par le nouveau code ; il sera supprimé par une migration ultérieure.

-- ─── Cinquième type de notification ─────────────────────────────────────────
-- Il n'est pas employé dans cette migration : PostgreSQL refuse d'utiliser une
-- valeur d'énumération dans la transaction qui l'ajoute.
ALTER TYPE "NotificationType" ADD VALUE 'RECOMMENDATION';

-- ─── Préférences ────────────────────────────────────────────────────────────
-- Suivre un organisateur EST la demande : l'alerte de publication devient
-- active par défaut. Les lignes existantes suivent — le suivi n'existait pas,
-- personne n'a donc pu refuser ce qu'on n'avait jamais proposé.
ALTER TABLE "notification_preference"
  ALTER COLUMN "organizerPublications" SET DEFAULT true,
  ADD COLUMN "recommendations"         BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "lastRecommendationAt"    TIMESTAMP(3),
  ADD COLUMN "recommendationCheckedAt" TIMESTAMP(3);

UPDATE "notification_preference" SET "organizerPublications" = true;

-- ─── Notifications sur l'appareil ───────────────────────────────────────────
CREATE TABLE "push_subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription"("userId");

ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Suivis et goûts ────────────────────────────────────────────────────────
CREATE TABLE "organization_follow" (
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_follow_pkey" PRIMARY KEY ("userId","organizationId")
);

CREATE INDEX "organization_follow_organizationId_idx" ON "organization_follow"("organizationId");

ALTER TABLE "organization_follow" ADD CONSTRAINT "organization_follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_follow" ADD CONSTRAINT "organization_follow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_category_interest" (
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_category_interest_pkey" PRIMARY KEY ("userId","categoryId")
);

CREATE INDEX "user_category_interest_categoryId_idx" ON "user_category_interest"("categoryId");

ALTER TABLE "user_category_interest" ADD CONSTRAINT "user_category_interest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_category_interest" ADD CONSTRAINT "user_category_interest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_city_interest" (
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_city_interest_pkey" PRIMARY KEY ("userId","cityId")
);

CREATE INDEX "user_city_interest_cityId_idx" ON "user_city_interest"("cityId");

ALTER TABLE "user_city_interest" ADD CONSTRAINT "user_city_interest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_city_interest" ADD CONSTRAINT "user_city_interest_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "city"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Newsletter ─────────────────────────────────────────────────────────────
CREATE TYPE "NewsletterSubscriberStatus" AS ENUM ('PENDING', 'ACTIVE', 'UNSUBSCRIBED');
CREATE TYPE "NewsletterSource" AS ENUM ('SIGNUP', 'ACCOUNT', 'WEBSITE');
CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');
CREATE TYPE "NewsletterDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "newsletter_subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "status" "NewsletterSubscriberStatus" NOT NULL DEFAULT 'PENDING',
    "source" "NewsletterSource" NOT NULL,
    "token" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmationSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "newsletter_subscriber_email_key" ON "newsletter_subscriber"("email");
CREATE UNIQUE INDEX "newsletter_subscriber_userId_key" ON "newsletter_subscriber"("userId");
CREATE UNIQUE INDEX "newsletter_subscriber_token_key" ON "newsletter_subscriber"("token");
CREATE INDEX "newsletter_subscriber_status_createdAt_idx" ON "newsletter_subscriber"("status", "createdAt" DESC);

ALTER TABLE "newsletter_subscriber" ADD CONSTRAINT "newsletter_subscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "newsletter_campaign" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "heading" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "eventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "newsletter_campaign_status_scheduledAt_idx" ON "newsletter_campaign"("status", "scheduledAt");
CREATE INDEX "newsletter_campaign_createdAt_idx" ON "newsletter_campaign"("createdAt" DESC);

ALTER TABLE "newsletter_campaign" ADD CONSTRAINT "newsletter_campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "newsletter_delivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "newsletter_delivery_campaignId_subscriberId_key" ON "newsletter_delivery"("campaignId", "subscriberId");
CREATE INDEX "newsletter_delivery_status_createdAt_idx" ON "newsletter_delivery"("status", "createdAt");
CREATE INDEX "newsletter_delivery_campaignId_status_idx" ON "newsletter_delivery"("campaignId", "status");

ALTER TABLE "newsletter_delivery" ADD CONSTRAINT "newsletter_delivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "newsletter_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "newsletter_delivery" ADD CONSTRAINT "newsletter_delivery_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "newsletter_subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Réglages de la plateforme ──────────────────────────────────────────────
CREATE TABLE "platform_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("key")
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INVARIANTS
--
-- Ce que le code promet, la base le fait respecter : un service réécrit peut
-- oublier une règle, une contrainte non.
-- ═══════════════════════════════════════════════════════════════════════════

-- Une adresse s'écrit en minuscules : sans quoi `Awa@x.bj` et `awa@x.bj`
-- seraient deux abonnés, et un désabonnement n'en toucherait qu'un.
ALTER TABLE "newsletter_subscriber"
  ADD CONSTRAINT "newsletter_subscriber_email_is_lowercase"
  CHECK ("email" = lower("email"));

-- Un abonné actif a confirmé ; un désabonné a une date de départ.
ALTER TABLE "newsletter_subscriber"
  ADD CONSTRAINT "newsletter_subscriber_active_is_confirmed"
  CHECK ("status" <> 'ACTIVE' OR "confirmedAt" IS NOT NULL);

ALTER TABLE "newsletter_subscriber"
  ADD CONSTRAINT "newsletter_subscriber_unsubscribe_is_dated"
  CHECK ("status" <> 'UNSUBSCRIBED' OR "unsubscribedAt" IS NOT NULL);

-- Une campagne programmée a une date ; une campagne envoyée, une fin.
ALTER TABLE "newsletter_campaign"
  ADD CONSTRAINT "newsletter_campaign_schedule_is_dated"
  CHECK ("status" <> 'SCHEDULED' OR "scheduledAt" IS NOT NULL);

ALTER TABLE "newsletter_campaign"
  ADD CONSTRAINT "newsletter_campaign_sent_is_completed"
  CHECK ("status" <> 'SENT' OR "completedAt" IS NOT NULL);

-- Un bouton sans lien, ou un lien sans bouton, ne se voit pas.
ALTER TABLE "newsletter_campaign"
  ADD CONSTRAINT "newsletter_campaign_cta_is_complete"
  CHECK (("ctaLabel" IS NULL) = ("ctaUrl" IS NULL));

-- Un envoi parti a une date ; un échec s'explique — le support lira la phrase.
ALTER TABLE "newsletter_delivery"
  ADD CONSTRAINT "newsletter_delivery_sent_is_dated"
  CHECK ("status" <> 'SENT' OR "sentAt" IS NOT NULL);

ALTER TABLE "newsletter_delivery"
  ADD CONSTRAINT "newsletter_delivery_failure_is_explained"
  CHECK ("status" <> 'FAILED' OR length(btrim(COALESCE("failureReason", ''))) > 0);

-- Le serveur n'écrit qu'aux services de notification, jamais en clair.
ALTER TABLE "push_subscription"
  ADD CONSTRAINT "push_subscription_endpoint_is_https"
  CHECK ("endpoint" LIKE 'https://%');
