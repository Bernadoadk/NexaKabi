-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('EVENT', 'ORGANIZATION', 'USER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('FRAUD', 'FALSE_INFO', 'INAPPROPRIATE', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "organizationId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterPhone" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "assignedToUserId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_note" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "totpVerifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_reference_key" ON "report"("reference");

-- CreateIndex
CREATE INDEX "report_status_createdAt_idx" ON "report"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "report_organizationId_status_idx" ON "report"("organizationId", "status");

-- CreateIndex
CREATE INDEX "report_targetType_targetId_idx" ON "report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "report_note_reportId_createdAt_idx" ON "report_note"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_tokenHash_key" ON "admin_session"("tokenHash");

-- CreateIndex
CREATE INDEX "admin_session_userId_expiresAt_idx" ON "admin_session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "admin_session_expiresAt_idx" ON "admin_session"("expiresAt");

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_note" ADD CONSTRAINT "report_note_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_note" ADD CONSTRAINT "report_note_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- INVARIANTS DE LA MODÉRATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Une décision se motive.
--
-- Classer un signalement sans dire pourquoi rend la decision indefendable trois
-- mois plus tard, y compris pour celui qui l'a prise. C'est aussi la seule
-- trace qui permet a un autre moderateur de reprendre le dossier.
ALTER TABLE "report"
  ADD CONSTRAINT "report_decision_is_motivated"
  CHECK (
    "status" NOT IN ('RESOLVED', 'DISMISSED')
    OR length(btrim(COALESCE("resolutionNote", ''))) >= 10
  );

-- Une decision a un auteur et une date.
--
-- « Qui a classe ce dossier » est la premiere question posee quand une decision
-- est contestee. Sans reponse, la moderation n'est pas auditable.
ALTER TABLE "report"
  ADD CONSTRAINT "report_decision_is_attributed"
  CHECK (
    "status" NOT IN ('RESOLVED', 'DISMISSED')
    OR ("resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL)
  );

-- Un signalement est joignable.
--
-- Soit un compte, soit un numero. Un signalement anonyme et injoignable ne peut
-- etre ni verifie ni instruit : il encombre la file sans jamais aboutir.
ALTER TABLE "report"
  ADD CONSTRAINT "report_reporter_is_reachable"
  CHECK (
    "reporterUserId" IS NOT NULL
    OR length(btrim(COALESCE("reporterPhone", ''))) > 0
  );

-- Le signalement dit quelque chose.
ALTER TABLE "report"
  ADD CONSTRAINT "report_details_are_substantive"
  CHECK (length(btrim("details")) >= 10);

-- Une note interne n'est pas vide.
ALTER TABLE "report_note"
  ADD CONSTRAINT "report_note_is_substantive"
  CHECK (length(btrim("body")) > 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- SESSIONS D'ADMINISTRATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Une session d'administration est courte.
--
-- Huit heures au maximum, soit une journee de travail. La contrainte porte sur
-- la DUREE et non sur une date fixe, pour qu'elle reste vraie demain.
--
-- Ce plafond est ici plutot que dans le code parce qu'il protege l'acces aux
-- pieces d'identite de tous les organisateurs et au gel des fonds : c'est
-- exactement le genre de valeur qu'une refonte allonge « temporairement ».
ALTER TABLE "admin_session"
  ADD CONSTRAINT "admin_session_is_short_lived"
  CHECK ("expiresAt" <= "createdAt" + INTERVAL '8 hours');

-- La seconde etape ne precede pas la premiere.
ALTER TABLE "admin_session"
  ADD CONSTRAINT "admin_session_totp_follows_creation"
  CHECK ("totpVerifiedAt" IS NULL OR "totpVerifiedAt" >= "createdAt");
