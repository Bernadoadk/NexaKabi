-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_CONFIRMED', 'EVENT_REMINDER', 'EVENT_UPDATED', 'ORGANIZER_PUBLISHED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL,
    "eventId" TEXT,
    "orderId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventReminders" BOOLEAN NOT NULL DEFAULT true,
    "organizerPublications" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_log" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "providerReference" TEXT,
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_userId_createdAt_idx" ON "notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notification_eventId_idx" ON "notification"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_userId_dedupeKey_key" ON "notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_userId_key" ON "notification_preference"("userId");

-- CreateIndex
CREATE INDEX "message_log_userId_createdAt_idx" ON "message_log"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "message_log_status_createdAt_idx" ON "message_log"("status", "createdAt");

-- CreateIndex
CREATE INDEX "message_log_notificationId_idx" ON "message_log"("notificationId");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- INVARIANTS DES NOTIFICATIONS
--
-- Ce que le code applicatif promet, la base le fait respecter. Un service
-- refactorisé peut oublier une règle ; une contrainte, non.
-- ═══════════════════════════════════════════════════════════════════════════

-- Une notification mène quelque part. Toujours.
--
-- C'est la règle produit la plus facile à eroder : on ajoute un type
-- « informatif », puis un deuxieme, et le centre de notifications devient une
-- liste que plus personne n'ouvre. La base refuse la premiere marche.
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_action_is_present"
  CHECK (length(btrim("actionUrl")) > 0 AND length(btrim("actionLabel")) > 0);

-- Le chemin est relatif, jamais une URL absolue.
--
-- Une notification qui pointe vers un domaine externe est un vecteur
-- d'hameconnage : le participant fait confiance a ce qui vient de nous.
ALTER TABLE "notification"
  ADD CONSTRAINT "notification_action_is_internal"
  CHECK ("actionUrl" LIKE '/%' AND "actionUrl" NOT LIKE '//%');

-- Un envoi parti a forcement une date de depart, et un envoi remis a
-- forcement ete parti d'abord.
ALTER TABLE "message_log"
  ADD CONSTRAINT "message_log_timeline_is_coherent"
  CHECK (
    ("status" <> 'SENT' AND "status" <> 'DELIVERED')
    OR "sentAt" IS NOT NULL
  );

ALTER TABLE "message_log"
  ADD CONSTRAINT "message_log_delivery_follows_send"
  CHECK ("deliveredAt" IS NULL OR "sentAt" IS NOT NULL);

-- Un echec s'explique.
--
-- Meme regle que pour les retraits : « le numero n'est pas un compte
-- marchand », jamais un code brut seul. C'est ce que le support lira.
ALTER TABLE "message_log"
  ADD CONSTRAINT "message_log_failure_is_explained"
  CHECK ("status" <> 'FAILED' OR length(btrim(COALESCE("failureReason", ''))) > 0);
