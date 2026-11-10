-- À la une, étapes 2 et 3 : la vidéo, et la vente des places aux organisateurs.
--
-- ── Rétro-compatible, et c'est voulu ──────────────────────────────────────
-- La migration tourne pendant le build, alors que la version précédente sert
-- encore le trafic (docs/DEPLOYMENT.md §1). Rien n'est retiré ni renommé :
--  · trois tables et trois énumérations s'ajoutent, que l'ancien code ignore ;
--  · `payment.orderId` devient facultatif — l'ancien code le renseigne
--    toujours, et la contrainte `payment_settles_one_thing` continue d'exiger
--    qu'un paiement règle exactement une chose ;
--  · deux types d'écriture et un type de notification s'ajoutent. Ils ne sont
--    pas UTILISÉS ici : PostgreSQL refuse d'employer une valeur d'énumération
--    dans la transaction qui la crée. La contrainte de signe du grand livre
--    qui les nomme vit donc dans la migration suivante.

-- CreateEnum
CREATE TYPE "SpotlightBookingStatus" AS ENUM ('AWAITING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'INTERRUPTED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SpotlightPaymentMethod" AS ENUM ('PROVIDER', 'BALANCE', 'CREDIT');

-- CreateEnum
CREATE TYPE "SpotlightCreditReason" AS ENUM ('CANCELLATION', 'INTERRUPTION', 'WITHDRAWAL', 'LATE_REVIEW', 'GESTURE');

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'SPOTLIGHT_PURCHASE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'SPOTLIGHT_REFUND';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SPOTLIGHT_UPDATED';

-- AlterTable
ALTER TABLE "ledger_entry" ADD COLUMN     "spotlightBookingId" TEXT;

-- AlterTable
ALTER TABLE "payment" ADD COLUMN     "spotlightBookingId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "spotlight" ADD COLUMN     "videoDurationSeconds" INTEGER,
ADD COLUMN     "videoPosterUrl" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- CreateTable
CREATE TABLE "spotlight_booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "SpotlightBookingStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "startDay" DATE NOT NULL,
    "endDay" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "pricePerDay" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "creditAmount" INTEGER NOT NULL DEFAULT 0,
    "chargedAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "paymentMethod" "SpotlightPaymentMethod" NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "videoPosterUrl" TEXT,
    "videoDurationSeconds" INTEGER,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "interruptedAt" TIMESTAMP(3),
    "interruptionReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "reportSentAt" TIMESTAMP(3),
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "creditedAmount" INTEGER NOT NULL DEFAULT 0,
    "spotlightId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotlight_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotlight_credit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "reason" "SpotlightCreditReason" NOT NULL,
    "note" TEXT,
    "bookingId" TEXT,
    "grantedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotlight_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotlight_credit_use" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spotlight_credit_use_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spotlight_booking_reference_key" ON "spotlight_booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "spotlight_booking_spotlightId_key" ON "spotlight_booking"("spotlightId");

-- CreateIndex
CREATE INDEX "spotlight_booking_countryCode_status_startDay_endDay_idx" ON "spotlight_booking"("countryCode", "status", "startDay", "endDay");

-- CreateIndex
CREATE INDEX "spotlight_booking_organizationId_createdAt_idx" ON "spotlight_booking"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "spotlight_booking_eventId_status_idx" ON "spotlight_booking"("eventId", "status");

-- CreateIndex
CREATE INDEX "spotlight_booking_status_holdExpiresAt_idx" ON "spotlight_booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "spotlight_booking_status_endsAt_idx" ON "spotlight_booking"("status", "endsAt");

-- CreateIndex
CREATE INDEX "spotlight_credit_organizationId_expiresAt_idx" ON "spotlight_credit"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "spotlight_credit_use_bookingId_idx" ON "spotlight_credit_use"("bookingId");

-- CreateIndex
CREATE INDEX "spotlight_credit_use_creditId_idx" ON "spotlight_credit_use"("creditId");

-- CreateIndex
CREATE INDEX "ledger_entry_spotlightBookingId_idx" ON "ledger_entry"("spotlightBookingId");

-- CreateIndex
CREATE INDEX "payment_spotlightBookingId_idx" ON "payment"("spotlightBookingId");

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_spotlightBookingId_fkey" FOREIGN KEY ("spotlightBookingId") REFERENCES "spotlight_booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_booking" ADD CONSTRAINT "spotlight_booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_booking" ADD CONSTRAINT "spotlight_booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_booking" ADD CONSTRAINT "spotlight_booking_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_booking" ADD CONSTRAINT "spotlight_booking_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_booking" ADD CONSTRAINT "spotlight_booking_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_booking" ADD CONSTRAINT "spotlight_booking_spotlightId_fkey" FOREIGN KEY ("spotlightId") REFERENCES "spotlight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_credit" ADD CONSTRAINT "spotlight_credit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_credit" ADD CONSTRAINT "spotlight_credit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "spotlight_booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_credit" ADD CONSTRAINT "spotlight_credit_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_credit_use" ADD CONSTRAINT "spotlight_credit_use_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "spotlight_credit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_credit_use" ADD CONSTRAINT "spotlight_credit_use_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "spotlight_booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Cohérence, garantie par la base ───────────────────────────────────────
-- Le service vérifie déjà tout cela ; ces contraintes protègent contre ce
-- qu'il ne voit pas — une correction à la main, un script pressé.

-- Un paiement règle UNE chose : une commande, ou une place à la une.
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_settles_one_thing"
  CHECK (("orderId" IS NULL) <> ("spotlightBookingId" IS NULL));

-- Une place ne peut être réglée qu'une fois chez le prestataire — même garantie
-- que `payment_one_success_per_order` pour les commandes.
CREATE UNIQUE INDEX "payment_one_success_per_spotlight_booking"
  ON "payment" ("spotlightBookingId")
  WHERE "status" = 'SUCCEEDED' AND "spotlightBookingId" IS NOT NULL;

-- Une vidéo vient entière : adresse, affiche et durée ensemble, quinze
-- secondes au plus.
ALTER TABLE "spotlight"
  ADD CONSTRAINT "spotlight_video_complete"
  CHECK (
    ("videoUrl" IS NULL AND "videoPosterUrl" IS NULL AND "videoDurationSeconds" IS NULL)
    OR (
      "videoUrl" LIKE 'http%'
      AND "videoPosterUrl" LIKE 'http%'
      AND "videoDurationSeconds" BETWEEN 1 AND 15
    )
  );

ALTER TABLE "spotlight_booking"
  ADD CONSTRAINT "spotlight_booking_video_complete"
  CHECK (
    ("videoUrl" IS NULL AND "videoPosterUrl" IS NULL AND "videoDurationSeconds" IS NULL)
    OR (
      "videoUrl" LIKE 'http%'
      AND "videoPosterUrl" LIKE 'http%'
      AND "videoDurationSeconds" BETWEEN 1 AND 15
    )
  );

-- Les jours vendus sont comptés exactement, et la fenêtre suit les jours.
ALTER TABLE "spotlight_booking"
  ADD CONSTRAINT "spotlight_booking_days_consistent"
  CHECK (
    "endDay" >= "startDay"
    AND "days" = ("endDay" - "startDay") + 1
    AND "endsAt" > "startsAt"
  );

-- Les montants se tiennent au franc près : prix × jours = total, et le total
-- se partage entre avoir et paiement. Rien n'est rendu au-delà du total.
ALTER TABLE "spotlight_booking"
  ADD CONSTRAINT "spotlight_booking_amounts_consistent"
  CHECK (
    "pricePerDay" > 0
    AND "totalAmount" = "pricePerDay" * "days"
    AND "creditAmount" BETWEEN 0 AND "totalAmount"
    AND "chargedAmount" = "totalAmount" - "creditAmount"
    AND "refundedAmount" >= 0
    AND "creditedAmount" >= 0
    AND "refundedAmount" + "creditedAmount" <= "totalAmount"
  );

-- Payée entièrement par un avoir, une place n'a rien à prélever — et
-- réciproquement.
ALTER TABLE "spotlight_booking"
  ADD CONSTRAINT "spotlight_booking_credit_method"
  CHECK (("paymentMethod" = 'CREDIT') = ("chargedAmount" = 0));

-- Une place en attente de paiement dit jusqu'à quand elle retient ses jours.
ALTER TABLE "spotlight_booking"
  ADD CONSTRAINT "spotlight_booking_hold_has_deadline"
  CHECK ("status" <> 'AWAITING_PAYMENT' OR "holdExpiresAt" IS NOT NULL);

-- Un refus porte son motif : l'organisateur ne lira que lui.
ALTER TABLE "spotlight_booking"
  ADD CONSTRAINT "spotlight_booking_rejection_explained"
  CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL);

-- Un avoir vaut quelque chose, et ne se dépense jamais au-delà de lui-même.
ALTER TABLE "spotlight_credit"
  ADD CONSTRAINT "spotlight_credit_amounts"
  CHECK ("amount" > 0 AND "remaining" BETWEEN 0 AND "amount");

ALTER TABLE "spotlight_credit_use"
  ADD CONSTRAINT "spotlight_credit_use_positive"
  CHECK ("amount" > 0);
