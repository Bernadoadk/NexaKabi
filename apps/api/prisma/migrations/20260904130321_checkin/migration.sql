-- CreateTable
CREATE TABLE "check_in" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "scannedByUserId" TEXT NOT NULL,
    "gate" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasOffline" BOOLEAN NOT NULL DEFAULT false,
    "deviceId" TEXT,
    "nonce" TEXT NOT NULL,
    "isEffective" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_conflict" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "winningCheckInId" TEXT NOT NULL,
    "losingCheckInId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "check_in_conflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "check_in_nonce_key" ON "check_in"("nonce");

-- CreateIndex
CREATE INDEX "check_in_eventId_scannedAt_idx" ON "check_in"("eventId", "scannedAt" DESC);

-- CreateIndex
CREATE INDEX "check_in_ticketId_idx" ON "check_in"("ticketId");

-- CreateIndex
CREATE INDEX "check_in_scannedByUserId_scannedAt_idx" ON "check_in"("scannedByUserId", "scannedAt" DESC);

-- CreateIndex
CREATE INDEX "check_in_conflict_ticketId_idx" ON "check_in_conflict"("ticketId");

-- CreateIndex
CREATE INDEX "check_in_conflict_resolvedAt_idx" ON "check_in_conflict"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_conflict_losingCheckInId_key" ON "check_in_conflict"("losingCheckInId");

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_scannedByUserId_fkey" FOREIGN KEY ("scannedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_conflict" ADD CONSTRAINT "check_in_conflict_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_conflict" ADD CONSTRAINT "check_in_conflict_winningCheckInId_fkey" FOREIGN KEY ("winningCheckInId") REFERENCES "check_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_conflict" ADD CONSTRAINT "check_in_conflict_losingCheckInId_fkey" FOREIGN KEY ("losingCheckInId") REFERENCES "check_in"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_conflict" ADD CONSTRAINT "check_in_conflict_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- LA contrainte de la phase : un seul check-in effectif par billet
-- ─────────────────────────────────────────────────────────────────────────────
--
-- C'est elle qui rend la double entrée impossible, quel que soit le
-- comportement des clients hors ligne. Deux contrôleurs peuvent scanner le même
-- billet sans réseau et être tous deux convaincus d'avoir raison ; à la
-- synchronisation, la base n'en laisse passer qu'un.
--
-- L'index est PARTIEL : les scans perdants (`isEffective = false`) et les
-- entrées annulées (`revokedAt` renseigné) restent consignés, sans bloquer une
-- nouvelle entrée légitime. Un billet annulé par erreur doit pouvoir être
-- rescanné.
CREATE UNIQUE INDEX "check_in_one_effective_per_ticket"
  ON "check_in" ("ticketId")
  WHERE "isEffective" = true AND "revokedAt" IS NULL;

-- Une entrée annulée porte toujours son auteur et son motif.
--
-- « Annuler cette entrée » est une action à conséquence : le porteur pourra
-- re-scanner. Sans auteur ni motif, un litige à la porte est inarbitrable.
ALTER TABLE "check_in"
  ADD CONSTRAINT "check_in_revocation_is_attributed"
  CHECK (
    "revokedAt" IS NULL
    OR ("revokedByUserId" IS NOT NULL AND "revokeReason" IS NOT NULL)
  );

-- Un conflit oppose deux scans distincts.
ALTER TABLE "check_in_conflict"
  ADD CONSTRAINT "conflict_involves_two_scans"
  CHECK ("winningCheckInId" <> "losingCheckInId");
