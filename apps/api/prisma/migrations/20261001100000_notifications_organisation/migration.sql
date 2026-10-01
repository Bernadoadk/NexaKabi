-- Notifications de l'organisation, et remboursement confirmé.
--
-- ── Rétro-compatible, et c'est voulu ──────────────────────────────────────
-- La migration tourne pendant le build, alors que la version précédente sert
-- encore le trafic (docs/DEPLOYMENT.md §1). Rien n'est retiré ni renommé : des
-- valeurs d'énumération et une colonne s'ajoutent, avec une valeur par défaut
-- que l'ancien code n'a pas besoin de connaître. L'ancien code ne produit
-- aucun des nouveaux types, il n'en lira donc aucune ligne.

-- ─── Six nouveaux types de notification ─────────────────────────────────────
-- Aucun n'est employé dans cette migration : PostgreSQL refuse d'utiliser une
-- valeur d'énumération dans la transaction qui l'ajoute.
--
-- Le participant : son remboursement, confirmé quand l'argent part (l'annulation
-- l'avait seulement promis).
ALTER TYPE "NotificationType" ADD VALUE 'REFUND_COMPLETED';

-- L'organisation : une vente, un épuisement, la décision de la modération, celle
-- de la vérification, l'issue d'un retrait. Jusqu'ici, les deux décisions ne
-- partaient que par WhatsApp ou SMS, et le reste n'était annoncé nulle part.
ALTER TYPE "NotificationType" ADD VALUE 'SALE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'SOLD_OUT';
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_REVIEWED';
ALTER TYPE "NotificationType" ADD VALUE 'VERIFICATION_REVIEWED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_UPDATED';

-- ─── Alertes de vente ───────────────────────────────────────────────────────
-- Actives par défaut : vendre des billets, c'est vouloir savoir qu'ils partent.
-- Les lignes existantes suivent — personne n'a pu refuser ce qu'on ne proposait
-- pas. L'interrupteur ne concerne que les ventes et les épuisements : les
-- décisions de modération et de vérification, et les retraits, ne se coupent pas.
ALTER TABLE "notification_preference"
  ADD COLUMN "salesAlerts" BOOLEAN NOT NULL DEFAULT true;
