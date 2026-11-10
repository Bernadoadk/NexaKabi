-- À la une : les mises en avant de Découvrir et de l'accueil.
--
-- ── Rétro-compatible, et c'est voulu ──────────────────────────────────────
-- La migration tourne pendant le build, alors que la version précédente sert
-- encore le trafic (docs/DEPLOYMENT.md §1). Rien n'est retiré ni renommé :
-- deux tables et trois énumérations s'ajoutent, que l'ancien code ignore.

-- CreateEnum
CREATE TYPE "SpotlightKind" AS ENUM ('EVENT', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "SpotlightSource" AS ENUM ('EDITORIAL', 'PAID');

-- CreateEnum
CREATE TYPE "SpotlightStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "spotlight" (
    "id" TEXT NOT NULL,
    "kind" "SpotlightKind" NOT NULL,
    "source" "SpotlightSource" NOT NULL DEFAULT 'EDITORIAL',
    "status" "SpotlightStatus" NOT NULL DEFAULT 'ACTIVE',
    "eventId" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'BJ',
    "externalTitle" TEXT,
    "externalStartsAt" TIMESTAMP(3),
    "externalEndsAt" TIMESTAMP(3),
    "externalVenueName" TEXT,
    "externalCityName" TEXT,
    "externalOrganizerName" TEXT,
    "externalUrl" TEXT,
    "externalPriceLabel" TEXT,
    "externalCategoryLabel" TEXT,
    "imageUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "withdrawnAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotlight_daily_stat" (
    "spotlightId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "spotlight_daily_stat_pkey" PRIMARY KEY ("spotlightId","day")
);

-- CreateIndex
CREATE INDEX "spotlight_countryCode_status_startsAt_endsAt_idx" ON "spotlight"("countryCode", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "spotlight_eventId_idx" ON "spotlight"("eventId");

-- AddForeignKey
ALTER TABLE "spotlight" ADD CONSTRAINT "spotlight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight" ADD CONSTRAINT "spotlight_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight" ADD CONSTRAINT "spotlight_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_daily_stat" ADD CONSTRAINT "spotlight_daily_stat_spotlightId_fkey" FOREIGN KEY ("spotlightId") REFERENCES "spotlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Cohérence, garantie par la base ───────────────────────────────────────
-- Le service vérifie déjà tout cela ; ces contraintes protègent contre ce
-- qu'il ne voit pas — une correction à la main, un script pressé.

-- Une mise en avant d'événement désigne un événement ; une mise en avant
-- externe porte sa fiche complète, visuel et billetterie compris. Une une
-- sans image, ou qui mènerait nulle part, n'a rien à faire en vitrine.
ALTER TABLE "spotlight"
  ADD CONSTRAINT "spotlight_kind_fields"
  CHECK (
    ("kind" = 'EVENT' AND "eventId" IS NOT NULL)
    OR (
      "kind" = 'EXTERNAL'
      AND "eventId" IS NULL
      AND "externalTitle" IS NOT NULL
      AND "externalStartsAt" IS NOT NULL
      AND "externalOrganizerName" IS NOT NULL
      AND "imageUrl" IS NOT NULL
      AND "externalUrl" LIKE 'https://%'
    )
  );

-- La fenêtre d'affichage se termine après avoir commencé.
ALTER TABLE "spotlight"
  ADD CONSTRAINT "spotlight_ends_after_start"
  CHECK ("endsAt" > "startsAt");

-- Les compteurs ne descendent jamais sous zéro.
ALTER TABLE "spotlight_daily_stat"
  ADD CONSTRAINT "spotlight_daily_stat_non_negative"
  CHECK ("views" >= 0 AND "clicks" >= 0);
