-- Suivi de l'exécution des remboursements.
--
-- ── Ce qui change ─────────────────────────────────────────────────────────
-- Un remboursement était écrit APRÈS la réponse du prestataire, et seulement
-- s'il avait accepté. KPay, seul prestataire de la V1, rembourse de façon
-- asynchrone, intégralement, et dans les sept jours suivant le paiement :
-- au-delà, le remboursement se fait à la main. Un remboursement est donc
-- désormais inscrit dès qu'il est DÉCIDÉ — l'argent quitte le solde de
-- l'organisateur, qui ne peut plus le retirer — et son exécution se suit
-- ligne par ligne.
--
-- Rien n'est réécrit : les lignes existantes gardent leur état, les colonnes
-- nouvelles prennent une valeur neutre.

ALTER TABLE "refund"
  ADD COLUMN "processedById"   TEXT,
  ADD COLUMN "failureReason"   TEXT,
  ADD COLUMN "manual"          BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "providerAttempt" INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt"   TIMESTAMP(3),
  ADD COLUMN "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Les notifications du prestataire retrouvent un remboursement par sa référence.
CREATE INDEX "refund_providerReference_idx" ON "refund"("providerReference");
