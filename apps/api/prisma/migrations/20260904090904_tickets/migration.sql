-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'USED', 'CANCELLED', 'REFUNDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ticket" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeePhone" TEXT,
    "attendeeEmail" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "signature" TEXT NOT NULL,
    "signatureKeyId" TEXT NOT NULL,
    "qrExpiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "transferredToPhone" TEXT,
    "pdfKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_publicId_key" ON "ticket"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_accessToken_key" ON "ticket"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_reference_key" ON "ticket"("reference");

-- CreateIndex
CREATE INDEX "ticket_eventId_status_idx" ON "ticket"("eventId", "status");

-- CreateIndex
CREATE INDEX "ticket_orderId_idx" ON "ticket"("orderId");

-- CreateIndex
CREATE INDEX "ticket_ticketTypeId_idx" ON "ticket"("ticketTypeId");

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Garanties portées par la base
-- ─────────────────────────────────────────────────────────────────────────────

-- Un billet utilisé porte toujours son horodatage d'entrée.
--
-- Le check-in de la phase 8 écrit ces deux champs ensemble. Sans cette
-- contrainte, un billet marqué « utilisé » sans heure d'entrée rendrait le
-- litige impossible à arbitrer : personne ne pourrait dire quand le porteur
-- est passé.
ALTER TABLE "ticket"
  ADD CONSTRAINT "ticket_used_has_timestamp"
  CHECK ("status" <> 'USED' OR "usedAt" IS NOT NULL);

-- Un billet annulé porte toujours sa date d'annulation.
ALTER TABLE "ticket"
  ADD CONSTRAINT "ticket_cancelled_has_timestamp"
  CHECK ("status" NOT IN ('CANCELLED', 'REFUNDED') OR "cancelledAt" IS NOT NULL);

-- L'identifiant public et le jeton d'accès ne se confondent jamais.
--
-- Ce sont deux secrets de portées différentes : le premier est encodé dans le
-- QR, le second circule dans une URL partagée sur WhatsApp. Les rendre égaux
-- — par un bug de génération, ou une correction manuelle — ferait du partage
-- d'un lien l'équivalent du partage du billet lui-même.
ALTER TABLE "ticket"
  ADD CONSTRAINT "ticket_public_id_differs_from_token"
  CHECK ("publicId" <> "accessToken");
