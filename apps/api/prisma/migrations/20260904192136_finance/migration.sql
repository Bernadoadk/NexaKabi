-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE', 'HOLD', 'RELEASE', 'PLATFORM_FEE', 'PROVIDER_FEE', 'REFUND', 'REFUND_FEE_REVERSAL', 'PAYOUT', 'PAYOUT_FEE', 'PAYOUT_REVERSAL', 'FREEZE', 'UNFREEZE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BalanceState" AS ENUM ('PENDING', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "balanceState" "BalanceState" NOT NULL DEFAULT 'AVAILABLE',
    "availableAt" TIMESTAMP(3),
    "eventId" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "payoutId" TEXT,
    "refundId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payoutAccountId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "feeAmount" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "processedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entry_organizationId_balanceState_idx" ON "ledger_entry"("organizationId", "balanceState");

-- CreateIndex
CREATE INDEX "ledger_entry_organizationId_createdAt_idx" ON "ledger_entry"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ledger_entry_balanceState_availableAt_idx" ON "ledger_entry"("balanceState", "availableAt");

-- CreateIndex
CREATE INDEX "ledger_entry_eventId_idx" ON "ledger_entry"("eventId");

-- CreateIndex
CREATE INDEX "ledger_entry_payoutId_idx" ON "ledger_entry"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_reference_key" ON "payout"("reference");

-- CreateIndex
CREATE INDEX "payout_organizationId_requestedAt_idx" ON "payout"("organizationId", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "payout_status_requestedAt_idx" ON "payout"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "payout_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout" ADD CONSTRAINT "payout_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- IMMUABILITÉ DU GRAND LIVRE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Le principe est simple à énoncer et facile à trahir : une écriture ne se
-- modifie jamais, une correction est une écriture inverse. Le laisser à la
-- discipline du code serait illusoire — il suffit d'un `updateMany` un peu
-- rapide, d'un script de reprise ou d'une correction manuelle en production
-- pour rendre un solde inexplicable, sans laisser aucune trace.
--
-- La base le fait donc respecter elle-même. Ces deux déclencheurs sont la
-- garantie la plus forte du produit sur le plan financier.
CREATE OR REPLACE FUNCTION ledger_entry_is_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Le grand livre est immuable : une correction est une écriture inverse, jamais une modification (tentative de % sur %)',
    TG_OP, OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_no_update
  BEFORE UPDATE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_is_immutable();

CREATE TRIGGER ledger_entry_no_delete
  BEFORE DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_is_immutable();

-- ─────────────────────────────────────────────────────────────────────────────
-- Cohérence des écritures
-- ─────────────────────────────────────────────────────────────────────────────

-- Une écriture exprime toujours un fait économique : jamais zéro.
--
-- Le signe est vérifié ici, et non seulement en applicatif : une vente
-- enregistrée en négatif ferait baisser le solde à chaque billet vendu, et
-- resterait invisible — un nombre faux reste un nombre plausible.
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_sign_matches_type"
  CHECK (
    "amount" <> 0
    AND (
      ("type" IN ('SALE', 'RELEASE', 'REFUND_FEE_REVERSAL', 'PAYOUT_REVERSAL', 'UNFREEZE') AND "amount" > 0)
      OR ("type" IN ('HOLD', 'PLATFORM_FEE', 'PROVIDER_FEE', 'REFUND', 'PAYOUT', 'PAYOUT_FEE', 'FREEZE') AND "amount" < 0)
      OR "type" = 'ADJUSTMENT'
    )
  );

-- Une écriture bloquée porte sa date de déblocage, sauf au palier 0 où c'est la
-- vérification d'identité qui débloque, et non le temps.
ALTER TABLE "ledger_entry"
  ADD CONSTRAINT "ledger_entry_available_only_when_pending"
  CHECK ("availableAt" IS NULL OR "balanceState" = 'PENDING');

-- ─────────────────────────────────────────────────────────────────────────────
-- Cohérence des retraits
-- ─────────────────────────────────────────────────────────────────────────────

-- Le net est ce que l'organisateur reçoit : brut moins frais, exactement.
--
-- Un écart, même d'un franc, se retrouverait dans une réclamation. Le vérifier
-- ici évite qu'un arrondi mal placé passe au travers.
ALTER TABLE "payout"
  ADD CONSTRAINT "payout_net_equals_gross_minus_fee"
  CHECK ("netAmount" = "grossAmount" - "feeAmount" AND "grossAmount" > 0 AND "feeAmount" >= 0);

-- Un retrait échoué porte toujours sa cause.
--
-- Sans elle, l'organisateur ne peut pas corriger son compte, et le support ne
-- peut rien lui dire d'utile.
ALTER TABLE "payout"
  ADD CONSTRAINT "payout_failure_is_explained"
  CHECK ("status" <> 'FAILED' OR "failureReason" IS NOT NULL);

-- Un retrait effectué porte sa date d'exécution.
ALTER TABLE "payout"
  ADD CONSTRAINT "payout_paid_has_timestamp"
  CHECK ("status" <> 'PAID' OR "completedAt" IS NOT NULL);
